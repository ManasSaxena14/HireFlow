import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type BookOffer,
  type CreateOffer,
  formatInterviewTime,
  type InterviewOffer,
  type PublicOffer,
  type Slot,
} from '@hireflow/shared';
import { sql } from 'kysely';
import type { Viewer } from '../common/access.js';
import { AuditService } from '../common/audit.service.js';
import { DomainError, notFound } from '../common/domain-error.js';
import { Database, type Executor } from '../database/database.js';
import { MailQueue } from '../queue/mail-queue.js';
import { InterviewsService, toSlotTaken } from './interviews.service.js';
import { offerStatus } from './offer-status.js';
import { SchedulerLinks } from './scheduler-links.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

@Injectable()
export class OffersService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
    private readonly mail: MailQueue,
    private readonly links: SchedulerLinks,
    private readonly interviews: InterviewsService,
  ) {}

  /** Lets the candidate choose a time. An earlier open offer stops working, so only one is live. */
  async create(viewer: Viewer, body: CreateOffer, ip: string | null): Promise<InterviewOffer> {
    const now = Date.now();
    const slots = [...new Set(body.slots.map((slot) => new Date(slot).toISOString()))].sort();
    if (slots.some((slot) => Date.parse(slot) <= now)) {
      throw new DomainError('VALIDATION_ERROR', 'Please offer only times in the future.');
    }
    const expiresAt = new Date(now + body.expiresInDays * DAY_MS);

    return this.db.transaction().execute(async (tx) => {
      const application = await this.interviews.findBookableApplication(
        tx,
        viewer.companyId,
        body.applicationId,
      );
      await this.interviews.assertMembers(tx, viewer.companyId, [body.interviewerId]);
      await tx
        .updateTable('interviewOffers')
        .set({ withdrawnAt: new Date() })
        .where('companyId', '=', viewer.companyId)
        .where('applicationId', '=', application.id)
        .where('interviewId', 'is', null)
        .where('withdrawnAt', 'is', null)
        .execute();

      const offer = await tx
        .insertInto('interviewOffers')
        .values({
          companyId: viewer.companyId,
          applicationId: application.id,
          interviewerId: body.interviewerId,
          durationMin: body.durationMin,
          slots,
          meetingUrl: body.meetingUrl,
          notes: body.notes,
          expiresAt,
          withdrawnAt: null,
          interviewId: null,
          createdBy: viewer.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const details = await tx
        .selectFrom('applications as a')
        .innerJoin('candidates as c', 'c.id', 'a.candidateId')
        .innerJoin('jobs as j', 'j.id', 'a.jobId')
        .innerJoin('companies as co', 'co.id', 'a.companyId')
        .select([
          'c.fullName as candidateName',
          'c.email as candidateEmail',
          'j.title as jobTitle',
          'co.name as companyName',
        ])
        .where('a.id', '=', application.id)
        .executeTakeFirstOrThrow();
      const interviewer = await tx
        .selectFrom('users')
        .select(['id', 'fullName', 'timezone'])
        .where('id', '=', body.interviewerId)
        .executeTakeFirstOrThrow();

      const bookingUrl = this.links.bookingUrl(offer.id);
      await this.mail.enqueue(
        {
          template: 'interview-offer',
          to: details.candidateEmail,
          dedupeKey: `interview-offer:${offer.id}:${randomUUID()}`,
          name: details.candidateName,
          jobTitle: details.jobTitle,
          companyName: details.companyName,
          durationMin: body.durationMin,
          expires: formatInterviewTime(expiresAt, interviewer.timezone),
          link: bookingUrl,
        },
        tx,
      );
      await this.audit.record(
        {
          companyId: viewer.companyId,
          actorId: viewer.userId,
          action: 'interview_offer.created',
          entityType: 'interview_offer',
          entityId: offer.id,
          diff: { slots },
          ip,
        },
        tx,
      );
      return {
        id: offer.id,
        applicationId: application.id,
        status: 'open',
        durationMin: body.durationMin,
        slots,
        expiresAt: expiresAt.toISOString(),
        interviewer: { id: interviewer.id, fullName: interviewer.fullName },
        bookingUrl,
        createdAt: offer.createdAt.toISOString(),
      };
    });
  }

  async withdraw(viewer: Viewer, id: string, ip: string | null): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const result = await tx
        .updateTable('interviewOffers')
        .set({ withdrawnAt: new Date() })
        .where('companyId', '=', viewer.companyId)
        .where('id', '=', id)
        .where('interviewId', 'is', null)
        .where('withdrawnAt', 'is', null)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) throw notFound('Offer');
      await this.audit.record(
        {
          companyId: viewer.companyId,
          actorId: viewer.userId,
          action: 'interview_offer.withdrawn',
          entityType: 'interview_offer',
          entityId: id,
          ip,
        },
        tx,
      );
    });
  }

  private offerRow(executor: Executor, id: string) {
    return executor
      .selectFrom('interviewOffers as o')
      .innerJoin('applications as a', 'a.id', 'o.applicationId')
      .innerJoin('pipelineStages as s', 's.id', 'a.stageId')
      .innerJoin('candidates as c', 'c.id', 'a.candidateId')
      .innerJoin('jobs as j', 'j.id', 'a.jobId')
      .innerJoin('companies as co', 'co.id', 'o.companyId')
      .innerJoin('users as u', 'u.id', 'o.interviewerId')
      .select([
        'o.id',
        'o.companyId',
        'o.applicationId',
        'o.interviewerId',
        'o.durationMin',
        'o.slots',
        'o.meetingUrl',
        'o.notes',
        'o.expiresAt',
        'o.withdrawnAt',
        'o.interviewId',
        'o.createdBy',
        'a.candidateId',
        's.kind as stageKind',
        'c.fullName as candidateName',
        'j.title as jobTitle',
        'co.name as companyName',
        'u.fullName as interviewerName',
      ])
      .where('o.id', '=', id)
      .executeTakeFirst();
  }

  private async readToken(token: string) {
    const id = this.links.readOfferToken(token);
    const offer = id ? await this.offerRow(this.db, id) : undefined;
    if (!offer) throw notFound('Offer');
    return offer;
  }

  /** Only shows the times that are still free right now. */
  async getPublic(token: string): Promise<PublicOffer> {
    const offer = await this.readToken(token);
    const status = offerStatus(offer);
    const base = {
      companyName: offer.companyName,
      jobTitle: offer.jobTitle,
      candidateName: offer.candidateName,
      interviewerName: offer.interviewerName,
      durationMin: offer.durationMin,
      expiresAt: offer.expiresAt.toISOString(),
    };

    if (offer.interviewId) {
      const interview = await this.db
        .selectFrom('interviews')
        .select(['id', 'meetingUrl', 'status'])
        .select([sql<Date>`lower(during)`.as('startsAt'), sql<Date>`upper(during)`.as('endsAt')])
        .where('id', '=', offer.interviewId)
        .executeTakeFirstOrThrow();
      return {
        ...base,
        status: interview.status === 'cancelled' ? 'withdrawn' : 'booked',
        slots: [],
        booked:
          interview.status === 'cancelled'
            ? null
            : {
                start: interview.startsAt.toISOString(),
                end: interview.endsAt.toISOString(),
                meetingUrl: interview.meetingUrl,
                calendarUrl: this.links.calendarUrl(interview.id),
              },
      };
    }

    if (status !== 'open' || !this.stillInTheRunning(offer.stageKind)) {
      return {
        ...base,
        status: status === 'open' ? 'withdrawn' : status,
        slots: [],
        booked: null,
      };
    }

    const busy = await this.db
      .selectFrom('interviews')
      .select([sql<Date>`lower(during)`.as('startsAt'), sql<Date>`upper(during)`.as('endsAt')])
      .where('status', '=', 'scheduled')
      .where((eb) =>
        eb.or([
          eb('interviewerId', '=', offer.interviewerId),
          eb('candidateId', '=', offer.candidateId),
        ]),
      )
      .where(sql<boolean>`upper(during) > now()`)
      .execute();
    const now = Date.now();
    const slots: Slot[] = offer.slots
      .map((slot) => ({
        start: slot.getTime(),
        end: slot.getTime() + offer.durationMin * MINUTE_MS,
      }))
      .filter(
        (slot) =>
          slot.start > now &&
          !busy.some(
            (item) => item.startsAt.getTime() < slot.end && item.endsAt.getTime() > slot.start,
          ),
      )
      .map((slot) => ({
        start: new Date(slot.start).toISOString(),
        end: new Date(slot.end).toISOString(),
      }));
    return { ...base, status: 'open', slots, booked: null };
  }

  private stillInTheRunning(kind: string) {
    return kind !== 'rejected' && kind !== 'hired';
  }

  async book(token: string, body: BookOffer): Promise<PublicOffer> {
    const offer = await this.readToken(token);
    const start = new Date(body.start);

    if (offer.interviewId) {
      throw new DomainError('SLOT_TAKEN', 'A time has already been booked with this link.');
    }
    if (offerStatus(offer) !== 'open' || !this.stillInTheRunning(offer.stageKind)) {
      throw new DomainError(
        'CONFLICT',
        'This link no longer works. Please ask the company for a new one.',
      );
    }
    const offered = offer.slots.some((slot) => slot.getTime() === start.getTime());
    if (!offered || start.getTime() <= Date.now()) {
      throw new DomainError('VALIDATION_ERROR', 'Please choose one of the times on this page.');
    }

    try {
      await this.db.transaction().execute(async (tx) => {
        const facts = await this.interviews.insertBooking(tx, {
          companyId: offer.companyId,
          applicationId: offer.applicationId,
          candidateId: offer.candidateId,
          interviewerId: offer.interviewerId,
          start,
          end: new Date(start.getTime() + offer.durationMin * MINUTE_MS),
          meetingUrl: offer.meetingUrl,
          notes: offer.notes,
          candidateTimezone: body.timezone ?? null,
          createdBy: offer.createdBy,
        });
        // If two tabs race for two different times, this lets only the first one through.
        const claimed = await tx
          .updateTable('interviewOffers')
          .set({ interviewId: facts.id })
          .where('id', '=', offer.id)
          .where('interviewId', 'is', null)
          .where('withdrawnAt', 'is', null)
          .executeTakeFirst();
        if (claimed.numUpdatedRows === 0n) {
          throw new DomainError('SLOT_TAKEN', 'A time has already been booked with this link.');
        }
        await this.audit.record(
          {
            companyId: offer.companyId,
            actorId: null,
            action: 'interview.booked_by_candidate',
            entityType: 'interview',
            entityId: facts.id,
            diff: { start: start.toISOString() },
            ip: null,
          },
          tx,
        );
      });
    } catch (error) {
      throw toSlotTaken(error);
    }
    return this.getPublic(token);
  }
}
