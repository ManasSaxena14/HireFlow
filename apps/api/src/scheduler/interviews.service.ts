import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type ApplicationInterviews,
  type CreateInterview,
  formatInterviewTime,
  type Interview,
  type ListInterviews,
  MAX_SUGGESTED_SLOTS,
  type MailMessage,
  type MyInterview,
  type Page,
  type RescheduleInterview,
  type Slot,
  type SuggestSlots,
} from '@hireflow/shared';
import { sql } from 'kysely';
import type { Viewer } from '../common/access.js';
import { AuditService } from '../common/audit.service.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DomainError, notFound } from '../common/domain-error.js';
import { ConfigService } from '../config/config.service.js';
import { bookingClash, Database, type Executor, type Tx } from '../database/database.js';
import { MailQueue } from '../queue/mail-queue.js';
import { toIcs } from './ics.js';
import { offerStatus } from './offer-status.js';
import { SchedulerLinks } from './scheduler-links.js';
import { type Span, suggest, type WeeklyRule } from './slots.js';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const REMINDER_HOURS_BEFORE = [24, 1];

const rangeOf = (start: Date, end: Date) =>
  sql<string>`tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')`;

/** Stops a save when a booking rule says no, with words that fit what went wrong. */
export function toSlotTaken(error: unknown): unknown {
  const clash = bookingClash(error);
  if (!clash) return error;
  return new DomainError(
    'SLOT_TAKEN',
    clash === 'candidate'
      ? 'This person already has an interview at that time. Please pick another time.'
      : 'This time was just taken. Please pick another one.',
  );
}

export interface BookingInput {
  companyId: string;
  applicationId: string;
  candidateId: string;
  interviewerId: string;
  start: Date;
  end: Date;
  meetingUrl: string | null;
  notes: string | null;
  candidateTimezone: string | null;
  createdBy: string;
}

interface InterviewFacts {
  id: string;
  companyId: string;
  applicationId: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  meetingUrl: string | null;
  notes: string | null;
  candidateTimezone: string | null;
  createdAt: Date;
  jobTitle: string;
  companyName: string;
  companySlug: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidateUserId: string | null;
  interviewerId: string;
  interviewerName: string;
  interviewerEmail: string;
  interviewerTimezone: string;
}

@Injectable()
export class InterviewsService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly mail: MailQueue,
    private readonly config: ConfigService,
    private readonly links: SchedulerLinks,
  ) {}

  private facts(executor: Executor) {
    return executor
      .selectFrom('interviews as i')
      .innerJoin('applications as a', 'a.id', 'i.applicationId')
      .innerJoin('jobs as j', 'j.id', 'a.jobId')
      .innerJoin('companies as co', 'co.id', 'i.companyId')
      .innerJoin('candidates as c', 'c.id', 'i.candidateId')
      .innerJoin('users as u', 'u.id', 'i.interviewerId')
      .select([
        'i.id',
        'i.companyId',
        'i.applicationId',
        'i.status',
        'i.meetingUrl',
        'i.notes',
        'i.candidateTimezone',
        'i.createdAt',
        'j.title as jobTitle',
        'co.name as companyName',
        'co.slug as companySlug',
        'c.id as candidateId',
        'c.fullName as candidateName',
        'c.email as candidateEmail',
        'c.userId as candidateUserId',
        'u.id as interviewerId',
        'u.fullName as interviewerName',
        'u.email as interviewerEmail',
        'u.timezone as interviewerTimezone',
      ])
      .select([
        sql<Date>`lower(i.during)`.as('startsAt'),
        sql<Date>`upper(i.during)`.as('endsAt'),
        sql<string>`lower(i.during)::text`.as('cursorAt'),
      ]);
  }

  private async factsById(executor: Executor, id: string): Promise<InterviewFacts> {
    return this.facts(executor).where('i.id', '=', id).executeTakeFirstOrThrow();
  }

  private toInterview(row: InterviewFacts): Interview {
    return {
      id: row.id,
      applicationId: row.applicationId,
      status: row.status as Interview['status'],
      start: row.startsAt.toISOString(),
      end: row.endsAt.toISOString(),
      meetingUrl: row.meetingUrl,
      notes: row.notes,
      jobTitle: row.jobTitle,
      candidate: { id: row.candidateId, fullName: row.candidateName },
      interviewer: { id: row.interviewerId, fullName: row.interviewerName },
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findBookableApplication(executor: Executor, companyId: string, applicationId: string) {
    const application = await executor
      .selectFrom('applications as a')
      .innerJoin('pipelineStages as s', 's.id', 'a.stageId')
      .select(['a.id', 'a.candidateId', 's.kind'])
      .where('a.companyId', '=', companyId)
      .where('a.id', '=', applicationId)
      .executeTakeFirst();
    if (!application) throw notFound('Candidate');
    if (application.kind === 'rejected' || application.kind === 'hired') {
      throw new DomainError('CONFLICT', 'This person is no longer waiting for an interview.');
    }
    return application;
  }

  async assertMembers(executor: Executor, companyId: string, userIds: string[]) {
    const unique = [...new Set(userIds)];
    const found = await executor
      .selectFrom('memberships')
      .select('userId')
      .where('companyId', '=', companyId)
      .where('userId', 'in', unique)
      .execute();
    if (found.length !== unique.length) throw notFound('Interviewer');
  }

  private assertFuture(start: Date) {
    if (start.getTime() <= Date.now()) {
      throw new DomainError('VALIDATION_ERROR', 'Please pick a time in the future.');
    }
  }

  private async busyOf(
    userIds: string[],
    candidateId: string,
    range: Span,
    ignoreInterviewId: string | undefined,
  ) {
    const from = new Date(range.start).toISOString();
    const to = new Date(range.end).toISOString();
    let builder = this.db
      .selectFrom('interviews')
      .select(['interviewerId', 'candidateId'])
      .select([sql<Date>`lower(during)`.as('startsAt'), sql<Date>`upper(during)`.as('endsAt')])
      .where('status', '=', 'scheduled')
      .where(sql<boolean>`during && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')`)
      .where((eb) =>
        eb.or([eb('interviewerId', 'in', userIds), eb('candidateId', '=', candidateId)]),
      );
    if (ignoreInterviewId) builder = builder.where('id', '!=', ignoreInterviewId);
    return builder.execute();
  }

  async suggestSlots(viewer: Viewer, body: SuggestSlots): Promise<{ slots: Slot[] }> {
    const { companyId } = viewer;
    const interviewerIds = [...new Set(body.interviewerIds)];
    const application = await this.findBookableApplication(this.db, companyId, body.applicationId);
    await this.assertMembers(this.db, companyId, interviewerIds);

    const range: Span = {
      start: Math.max(Date.parse(body.from), Date.now()),
      end: Date.parse(body.to),
    };
    if (range.end <= range.start) return { slots: [] };

    const from = new Date(range.start).toISOString();
    const to = new Date(range.end).toISOString();
    const [rules, blocks, interviews] = await Promise.all([
      this.db
        .selectFrom('availabilityRules')
        .select(['userId', 'weekday', 'timezone'])
        .select([
          sql<string>`to_char(start_time, 'HH24:MI')`.as('startTime'),
          sql<string>`to_char(end_time, 'HH24:MI')`.as('endTime'),
          sql<string | null>`valid_from::text`.as('validFrom'),
          sql<string | null>`valid_to::text`.as('validTo'),
        ])
        .where('companyId', '=', companyId)
        .where('userId', 'in', interviewerIds)
        .execute(),
      this.db
        .selectFrom('availabilityBlocks')
        .select('userId')
        .select([sql<Date>`lower(during)`.as('startsAt'), sql<Date>`upper(during)`.as('endsAt')])
        .where('companyId', '=', companyId)
        .where('userId', 'in', interviewerIds)
        .where(sql<boolean>`during && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')`)
        .execute(),
      this.busyOf(interviewerIds, application.candidateId, range, body.ignoreInterviewId),
    ]);

    const toSpan = (row: { startsAt: Date; endsAt: Date }): Span => ({
      start: row.startsAt.getTime(),
      end: row.endsAt.getTime(),
    });
    const slots = suggest({
      range,
      durationMs: body.durationMin * MINUTE_MS,
      max: MAX_SUGGESTED_SLOTS,
      people: interviewerIds.map((id) => ({
        rules: rules.filter((rule) => rule.userId === id) as WeeklyRule[],
        busy: [
          ...blocks.filter((block) => block.userId === id),
          ...interviews.filter((interview) => interview.interviewerId === id),
        ].map(toSpan),
      })),
      candidateBusy: interviews
        .filter((interview) => interview.candidateId === application.candidateId)
        .map(toSpan),
    });
    return {
      slots: slots.map((slot) => ({
        start: new Date(slot.start).toISOString(),
        end: new Date(slot.end).toISOString(),
      })),
    };
  }

  private async addReminders(tx: Tx, facts: InterviewFacts) {
    const when = formatInterviewTime(facts.startsAt, facts.interviewerTimezone);
    const due = REMINDER_HOURS_BEFORE.map(
      (hours) => new Date(facts.startsAt.getTime() - hours * HOUR_MS),
    ).filter((remindAt) => remindAt.getTime() > Date.now());
    if (due.length === 0) return;
    await tx
      .insertInto('reminders')
      .values(
        due.map((remindAt) => ({
          userId: facts.interviewerId,
          interviewId: facts.id,
          kind: 'interview' as const,
          remindAt,
          message: `Interview with ${facts.candidateName} for ${facts.jobTitle} on ${when}.`,
          trackedApplicationId: null,
          sentAt: null,
        })),
      )
      .execute();
  }

  private removeUnsentReminders(tx: Tx, interviewId: string) {
    return tx
      .deleteFrom('reminders')
      .where('interviewId', '=', interviewId)
      .where('sentAt', 'is', null)
      .execute();
  }

  /** Tells the candidate and the interviewer, each in their own time zone. */
  private async tell(tx: Tx, facts: InterviewFacts, kind: 'booked' | 'moved' | 'cancelled') {
    const action = randomUUID();
    const interviewerWhen = formatInterviewTime(facts.startsAt, facts.interviewerTimezone);
    const candidateWhen = formatInterviewTime(
      facts.startsAt,
      facts.candidateTimezone ?? facts.interviewerTimezone,
    );
    const shared = {
      template: 'interview' as const,
      kind,
      jobTitle: facts.jobTitle,
      companyName: facts.companyName,
      meetingUrl: facts.meetingUrl,
    };
    const appUrl = this.config.env.APP_URL;
    const toCandidate: MailMessage = {
      ...shared,
      to: facts.candidateEmail,
      dedupeKey: `interview:${facts.id}:${kind}:${action}:candidate`,
      name: facts.candidateName,
      when: candidateWhen,
      withName: facts.interviewerName,
      ...(kind === 'cancelled'
        ? { link: `${appUrl}/c/${facts.companySlug}`, linkLabel: `See ${facts.companyName}` }
        : { link: this.links.calendarUrl(facts.id), linkLabel: 'Add to calendar' }),
    };
    const path = `/company/${facts.companyId}/candidates/${facts.applicationId}`;
    const toInterviewer: MailMessage = {
      ...shared,
      to: facts.interviewerEmail,
      dedupeKey: `interview:${facts.id}:${kind}:${action}:interviewer`,
      name: facts.interviewerName,
      when: interviewerWhen,
      withName: facts.candidateName,
      link: `${appUrl}${path}`,
      linkLabel: 'Open candidate',
    };
    await this.mail.enqueue(toCandidate, tx);
    await this.mail.enqueue(toInterviewer, tx);

    const words = {
      booked: 'New interview',
      moved: 'Interview moved',
      cancelled: 'Interview cancelled',
    };
    await tx
      .insertInto('notifications')
      .values({
        userId: facts.interviewerId,
        type: 'interview',
        payload: JSON.stringify({
          message: `${words[kind]}: ${facts.candidateName} for ${facts.jobTitle}, ${interviewerWhen}.`,
          link: path,
        }),
      })
      .execute();
    // A candidate with an account sees it on their own screens too, without waiting for an email.
    if (facts.candidateUserId) {
      await tx
        .insertInto('notifications')
        .values({
          userId: facts.candidateUserId,
          type: 'interview',
          payload: JSON.stringify({
            message: `${words[kind]}: ${facts.jobTitle} at ${facts.companyName}, ${candidateWhen}.`,
            link: '/app/interviews',
          }),
        })
        .execute();
    }
  }

  /** The one place that adds an interview. The database rules decide if the time is free. */
  async insertBooking(tx: Tx, input: BookingInput): Promise<InterviewFacts> {
    const { id } = await tx
      .insertInto('interviews')
      .values({
        companyId: input.companyId,
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        interviewerId: input.interviewerId,
        during: rangeOf(input.start, input.end),
        meetingUrl: input.meetingUrl,
        notes: input.notes,
        candidateTimezone: input.candidateTimezone,
        createdBy: input.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // Being booked is what lets an interviewer open this candidate.
    await tx
      .insertInto('applicationAssignments')
      .values({
        companyId: input.companyId,
        applicationId: input.applicationId,
        userId: input.interviewerId,
        assignedBy: input.createdBy,
      })
      .onConflict((oc) => oc.columns(['applicationId', 'userId']).doNothing())
      .execute();

    const facts = await this.factsById(tx, id);
    await this.addReminders(tx, facts);
    await this.tell(tx, facts, 'booked');
    return facts;
  }

  async create(viewer: Viewer, body: CreateInterview, ip: string | null): Promise<Interview> {
    const start = new Date(body.start);
    this.assertFuture(start);
    const end = new Date(start.getTime() + body.durationMin * MINUTE_MS);
    try {
      return await this.db.transaction().execute(async (tx) => {
        const application = await this.findBookableApplication(
          tx,
          viewer.companyId,
          body.applicationId,
        );
        await this.assertMembers(tx, viewer.companyId, [body.interviewerId]);
        const facts = await this.insertBooking(tx, {
          companyId: viewer.companyId,
          applicationId: application.id,
          candidateId: application.candidateId,
          interviewerId: body.interviewerId,
          start,
          end,
          meetingUrl: body.meetingUrl,
          notes: body.notes,
          candidateTimezone: null,
          createdBy: viewer.userId,
        });
        await this.audit.record(
          {
            companyId: viewer.companyId,
            actorId: viewer.userId,
            action: 'interview.created',
            entityType: 'interview',
            entityId: facts.id,
            diff: { start: start.toISOString(), end: end.toISOString() },
            ip,
          },
          tx,
        );
        return this.toInterview(facts);
      });
    } catch (error) {
      throw toSlotTaken(error);
    }
  }

  private async findScheduled(tx: Tx, companyId: string, id: string) {
    const row = await tx
      .selectFrom('interviews')
      .select(['id', 'status'])
      .select([sql<Date>`lower(during)`.as('startsAt'), sql<Date>`upper(during)`.as('endsAt')])
      .where('companyId', '=', companyId)
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound('Interview');
    if (row.status !== 'scheduled') {
      throw new DomainError('CONFLICT', 'This interview is no longer going ahead.');
    }
    if (row.endsAt.getTime() <= Date.now()) {
      throw new DomainError('CONFLICT', 'This interview has already happened.');
    }
    return row;
  }

  async reschedule(
    viewer: Viewer,
    id: string,
    body: RescheduleInterview,
    ip: string | null,
  ): Promise<Interview> {
    const start = new Date(body.start);
    this.assertFuture(start);
    try {
      return await this.db.transaction().execute(async (tx) => {
        const current = await this.findScheduled(tx, viewer.companyId, id);
        const length = current.endsAt.getTime() - current.startsAt.getTime();
        const end = new Date(
          start.getTime() + (body.durationMin ? body.durationMin * MINUTE_MS : length),
        );
        await tx
          .updateTable('interviews')
          .set({ during: rangeOf(start, end) })
          .where('id', '=', id)
          .execute();
        await this.removeUnsentReminders(tx, id);
        const facts = await this.factsById(tx, id);
        await this.addReminders(tx, facts);
        await this.tell(tx, facts, 'moved');
        await this.audit.record(
          {
            companyId: viewer.companyId,
            actorId: viewer.userId,
            action: 'interview.rescheduled',
            entityType: 'interview',
            entityId: id,
            diff: {
              from: current.startsAt.toISOString(),
              to: start.toISOString(),
            },
            ip,
          },
          tx,
        );
        return this.toInterview(facts);
      });
    } catch (error) {
      throw toSlotTaken(error);
    }
  }

  async cancel(viewer: Viewer, id: string, ip: string | null): Promise<Interview> {
    return this.db.transaction().execute(async (tx) => {
      await this.findScheduled(tx, viewer.companyId, id);
      return this.toInterview(await this.markCancelled(tx, viewer, id, ip));
    });
  }

  private async markCancelled(tx: Tx, viewer: Viewer, id: string, ip: string | null) {
    await tx.updateTable('interviews').set({ status: 'cancelled' }).where('id', '=', id).execute();
    await this.removeUnsentReminders(tx, id);
    const facts = await this.factsById(tx, id);
    await this.tell(tx, facts, 'cancelled');
    await this.audit.record(
      {
        companyId: viewer.companyId,
        actorId: viewer.userId,
        action: 'interview.cancelled',
        entityType: 'interview',
        entityId: id,
        ip,
      },
      tx,
    );
    return facts;
  }

  /**
   * Runs when someone is rejected or hired. Without this they would keep getting reminders
   * for an interview that no longer makes sense, and could still use an old booking link.
   */
  async closeForDecision(tx: Tx, viewer: Viewer, applicationId: string, ip: string | null) {
    const upcoming = await tx
      .selectFrom('interviews')
      .select('id')
      .where('companyId', '=', viewer.companyId)
      .where('applicationId', '=', applicationId)
      .where('status', '=', 'scheduled')
      .where(sql<boolean>`upper(during) > now()`)
      .forUpdate()
      .execute();
    for (const { id } of upcoming) await this.markCancelled(tx, viewer, id, ip);
    await tx
      .updateTable('interviewOffers')
      .set({ withdrawnAt: new Date() })
      .where('companyId', '=', viewer.companyId)
      .where('applicationId', '=', applicationId)
      .where('interviewId', 'is', null)
      .where('withdrawnAt', 'is', null)
      .execute();
  }

  /**
   * Runs when a candidate's data is deleted. The interviewer still needs to know their time
   * is free, but the message leaves out the person. Older messages that name them are removed.
   */
  async removeForDeletedCandidate(
    tx: Tx,
    companyId: string,
    candidateId: string,
    applicationIds: string[],
  ) {
    const upcoming = await this.facts(tx)
      .where('i.companyId', '=', companyId)
      .where('i.candidateId', '=', candidateId)
      .where('i.status', '=', 'scheduled')
      .where(sql<boolean>`upper(i.during) > now()`)
      .execute();
    const appUrl = this.config.env.APP_URL;
    for (const facts of upcoming) {
      const when = formatInterviewTime(facts.startsAt, facts.interviewerTimezone);
      await this.mail.enqueue(
        {
          template: 'interview',
          kind: 'cancelled',
          to: facts.interviewerEmail,
          dedupeKey: `interview:${facts.id}:deleted:interviewer`,
          name: facts.interviewerName,
          jobTitle: facts.jobTitle,
          companyName: facts.companyName,
          when,
          withName: 'the candidate',
          meetingUrl: null,
          link: `${appUrl}/company/${companyId}/interviews`,
          linkLabel: 'See interviews',
        },
        tx,
      );
    }
    if (applicationIds.length > 0) {
      const links = applicationIds.map((id) => `/company/${companyId}/candidates/${id}`);
      await tx
        .deleteFrom('notifications')
        .where(sql<string>`payload->>'link'`, 'in', links)
        .execute();
    }
    if (upcoming.length > 0) {
      await tx
        .insertInto('notifications')
        .values(
          upcoming.map((facts) => ({
            userId: facts.interviewerId,
            type: 'interview',
            payload: JSON.stringify({
              message: `Interview cancelled: ${facts.jobTitle}, ${formatInterviewTime(
                facts.startsAt,
                facts.interviewerTimezone,
              )}.`,
              link: `/company/${companyId}/interviews`,
            }),
          })),
        )
        .execute();
    }
    // Their reminders go with the interviews.
    await tx
      .deleteFrom('interviews')
      .where('companyId', '=', companyId)
      .where('candidateId', '=', candidateId)
      .execute();
  }

  /** Interviewers only see the interviews they will run. */
  async list(viewer: Viewer, query: ListInterviews): Promise<Page<Interview>> {
    const upcoming = query.scope === 'upcoming';
    let builder = this.facts(this.db).where('i.companyId', '=', viewer.companyId);
    if (viewer.role === 'interviewer') {
      builder = builder.where('i.interviewerId', '=', viewer.userId);
    }
    builder = upcoming
      ? builder.where('i.status', '=', 'scheduled').where(sql<boolean>`upper(i.during) > now()`)
      : builder.where((eb) =>
          eb.or([eb('i.status', '!=', 'scheduled'), sql<boolean>`upper(i.during) <= now()`]),
        );
    if (query.cursor) {
      const { at, id } = decodeCursor(query.cursor);
      builder = builder.where(
        upcoming
          ? sql<boolean>`(lower(i.during), i.id) > (${at}::timestamptz, ${id}::uuid)`
          : sql<boolean>`(lower(i.during), i.id) < (${at}::timestamptz, ${id}::uuid)`,
      );
    }
    const direction = upcoming ? 'asc' : 'desc';
    const rows = await builder
      .orderBy(sql`lower(i.during)`, direction)
      .orderBy('i.id', direction)
      .limit(query.limit + 1)
      .execute();
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((row) => this.toInterview(row)),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ at: last.cursorAt, id: last.id }) : null,
    };
  }

  async forApplication(viewer: Viewer, applicationId: string): Promise<ApplicationInterviews> {
    let application = this.db
      .selectFrom('applications')
      .select('id')
      .where('companyId', '=', viewer.companyId)
      .where('id', '=', applicationId);
    if (viewer.role === 'interviewer') {
      application = application.where(
        sql<boolean>`EXISTS (
          SELECT 1 FROM application_assignments aa
          WHERE aa.application_id = applications.id AND aa.user_id = ${viewer.userId})`,
      );
    }
    if (!(await application.executeTakeFirst())) throw notFound('Candidate');

    const interviews = await this.facts(this.db)
      .where('i.companyId', '=', viewer.companyId)
      .where('i.applicationId', '=', applicationId)
      .orderBy(sql`lower(i.during)`, 'desc')
      .execute();
    // How to reach the candidate is for the people who run hiring.
    const offers =
      viewer.role === 'interviewer'
        ? []
        : await this.db
            .selectFrom('interviewOffers as o')
            .innerJoin('users as u', 'u.id', 'o.interviewerId')
            .select([
              'o.id',
              'o.applicationId',
              'o.durationMin',
              'o.slots',
              'o.expiresAt',
              'o.withdrawnAt',
              'o.interviewId',
              'o.createdAt',
              'u.id as interviewerId',
              'u.fullName as interviewerName',
            ])
            .where('o.companyId', '=', viewer.companyId)
            .where('o.applicationId', '=', applicationId)
            .orderBy('o.createdAt', 'desc')
            .execute();
    return {
      interviews: interviews.map((row) => this.toInterview(row)),
      offers: offers.map((offer) => ({
        id: offer.id,
        applicationId: offer.applicationId,
        status: offerStatus(offer),
        durationMin: offer.durationMin,
        slots: offer.slots.map((slot) => slot.toISOString()),
        expiresAt: offer.expiresAt.toISOString(),
        interviewer: { id: offer.interviewerId, fullName: offer.interviewerName },
        bookingUrl: this.links.bookingUrl(offer.id),
        createdAt: offer.createdAt.toISOString(),
      })),
    };
  }

  async mine(userId: string): Promise<MyInterview[]> {
    const rows = await this.facts(this.db)
      .where('i.status', '=', 'scheduled')
      .where(sql<boolean>`upper(i.during) > now()`)
      .where((eb) => eb.or([eb('i.interviewerId', '=', userId), eb('c.userId', '=', userId)]))
      .orderBy(sql`lower(i.during)`)
      .limit(100)
      .execute();
    return rows.map((row) => {
      const asInterviewer = row.interviewerId === userId;
      return {
        id: row.id,
        companyId: row.companyId,
        applicationId: row.applicationId,
        companyName: row.companyName,
        jobTitle: row.jobTitle,
        start: row.startsAt.toISOString(),
        end: row.endsAt.toISOString(),
        status: row.status,
        meetingUrl: row.meetingUrl,
        role: asInterviewer ? 'interviewer' : 'candidate',
        otherPerson: asInterviewer ? row.candidateName : row.interviewerName,
      };
    });
  }

  private calendarFile(row: InterviewFacts, withName: string, description: string[]): string {
    return toIcs({
      id: row.id,
      start: row.startsAt,
      end: row.endsAt,
      title: `Interview: ${row.jobTitle} at ${row.companyName}`,
      description: [`With ${withName}.`, ...description].join('\n'),
      url: row.meetingUrl,
      cancelled: row.status === 'cancelled',
    });
  }

  /** A 404 for anyone else, so nobody can find out which interviews exist. */
  async icsForParticipant(userId: string, id: string): Promise<string> {
    const row = await this.facts(this.db).where('i.id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Interview');
    if (row.interviewerId === userId) return this.calendarFile(row, row.candidateName, []);
    if (row.candidateUserId === userId) return this.calendarFile(row, row.interviewerName, []);
    throw notFound('Interview');
  }

  /** For the signed link in a candidate's email. Team notes are never in this file. */
  async icsForCandidateLink(id: string, signature: string): Promise<string> {
    if (!this.links.isCalendarSignature(id, signature)) throw notFound('Interview');
    const row = await this.facts(this.db).where('i.id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Interview');
    return this.calendarFile(row, row.interviewerName, []);
  }
}
