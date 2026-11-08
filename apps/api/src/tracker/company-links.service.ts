import { Injectable } from '@nestjs/common';
import type { StageKind, TrackerStatus } from '@hireflow/shared';
import { jobHash } from '@hireflow/shared/node';
import { ConfigService } from '../config/config.service.js';
import type { Executor } from '../database/database.js';

const STATUS_OF: Record<StageKind, TrackerStatus> = {
  applied: 'applied',
  screening: 'screening',
  interview: 'interview',
  offer: 'offer',
  hired: 'offer',
  rejected: 'rejected',
};

/** Shown on the card's history. It only says where the person is, never why. */
const LABELS: Record<StageKind, string> = {
  applied: 'Application received',
  screening: 'First round',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'You got the job',
  rejected: 'Not selected',
};

const CANCELS_FOLLOW_UP: readonly TrackerStatus[] = ['rejected', 'withdrawn', 'offer'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** `applied` is the first time the card is made, `moved` is a change by the company. */
export type LinkReason = 'applied' | 'moved';

/**
 * Keeps a person's own job board in step with their application to a company on HireFlow.
 * Every hiring move changes the card in the same transaction, so the two can never differ.
 * It acts only for a candidate whose account is known, and that is set only when the person
 * was signed in with a confirmed email at the moment they applied.
 */
@Injectable()
export class CompanyLinks {
  constructor(private readonly config: ConfigService) {}

  private facts(tx: Executor, applicationId: string) {
    return tx
      .selectFrom('applications as a')
      .innerJoin('pipelineStages as s', 's.id', 'a.stageId')
      .innerJoin('jobs as j', 'j.id', 'a.jobId')
      .innerJoin('companies as co', 'co.id', 'a.companyId')
      .innerJoin('candidates as c', 'c.id', 'a.candidateId')
      .select([
        'a.appliedAt',
        's.kind as stageKind',
        'j.title',
        'j.slug as jobSlug',
        'j.location',
        'j.description',
        'j.skills',
        'co.name as companyName',
        'co.slug as companySlug',
        'c.userId as userId',
      ])
      .where('a.id', '=', applicationId)
      .executeTakeFirst();
  }

  /** Makes the card, or moves it to match the company's step. Does nothing without an account. */
  async refresh(tx: Executor, applicationId: string, reason: LinkReason): Promise<void> {
    const facts = await this.facts(tx, applicationId);
    if (!facts?.userId) return;
    const { userId } = facts;
    const status = STATUS_OF[facts.stageKind];
    const label = `${facts.companyName}: ${LABELS[facts.stageKind]}`;

    let card = await tx
      .selectFrom('trackedApplications')
      .selectAll()
      .where('companyApplicationId', '=', applicationId)
      .forUpdate()
      .executeTakeFirst();

    if (!card) {
      // A card is only ever made when the person proved who they are while applying. A later
      // move by the company must not make one, or anyone could fill a board by typing an email.
      if (reason !== 'applied') return;
      const hash = jobHash(facts.title, facts.companyName, facts.location);
      const same = await tx
        .selectFrom('trackedApplications')
        .selectAll()
        .where('userId', '=', userId)
        .where('jobHash', '=', hash)
        .forUpdate()
        .executeTakeFirst();
      // A card the person made by hand for the same job is joined, not copied.
      if (same?.companyApplicationId) return;
      if (same) {
        await tx
          .updateTable('trackedApplications')
          .set({ companyApplicationId: applicationId })
          .where('id', '=', same.id)
          .execute();
        card = { ...same, companyApplicationId: applicationId };
      } else {
        const created = await tx
          .insertInto('trackedApplications')
          .values({
            userId,
            title: facts.title,
            companyName: facts.companyName,
            jobUrl: `${this.config.env.APP_URL}/c/${facts.companySlug}/jobs/${facts.jobSlug}`,
            location: facts.location,
            source: 'HireFlow',
            salaryMin: null,
            salaryMax: null,
            currency: null,
            status,
            appliedAt: facts.appliedAt,
            skills: facts.skills,
            description: facts.description,
            tags: [],
            jobHash: hash,
            resumeId: null,
            companyApplicationId: applicationId,
            archivedAt: null,
          })
          .returning(['id', 'title', 'companyName'])
          .executeTakeFirstOrThrow();
        await this.writeEvent(tx, created.id, null, status, label);
        if (status === 'applied') await this.scheduleFollowUp(tx, userId, created);
        await this.notify(tx, userId, created.id, this.sentence(facts, 'applied'));
        return;
      }
    }

    if (card.status === status) {
      // Hired looks like an offer on the board. The person still hears the good news once.
      if (facts.stageKind === 'hired') await this.announceHired(tx, userId, card, facts, label);
      return;
    }
    const firstApply = status !== 'saved' && card.appliedAt === null;
    await tx
      .updateTable('trackedApplications')
      .set({ status, ...(firstApply ? { appliedAt: facts.appliedAt } : {}) })
      .where('id', '=', card.id)
      .execute();
    await this.writeEvent(tx, card.id, card.status, status, label);
    if (status === 'applied' && firstApply) await this.scheduleFollowUp(tx, userId, card);
    if (CANCELS_FOLLOW_UP.includes(status)) {
      await tx
        .deleteFrom('reminders')
        .where('trackedApplicationId', '=', card.id)
        .where('kind', '=', 'follow_up')
        .where('sentAt', 'is', null)
        .execute();
    }
    // A card the person archived stays quiet.
    if (reason === 'moved' && card.archivedAt === null) {
      await this.notify(tx, userId, card.id, this.sentence(facts, facts.stageKind));
    }
  }

  private async announceHired(
    tx: Executor,
    userId: string,
    card: { id: string; archivedAt: Date | null },
    facts: { title: string; companyName: string },
    label: string,
  ) {
    const last = await tx
      .selectFrom('applicationEvents')
      .select('note')
      .where('trackedApplicationId', '=', card.id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (last?.note === label) return;
    await this.writeEvent(tx, card.id, 'offer', 'offer', label);
    if (card.archivedAt === null) {
      await this.notify(tx, userId, card.id, this.sentence(facts, 'hired'));
    }
  }

  private sentence(
    facts: { title: string; companyName: string },
    kind: StageKind | 'applied',
  ): string {
    const job = `${facts.title} at ${facts.companyName}`;
    const company = facts.companyName;
    switch (kind) {
      case 'applied':
        return `Your application for ${job} is on your job board.`;
      case 'screening':
        return `${company} moved your application for ${facts.title} to the first round.`;
      case 'interview':
        return `${company} moved your application for ${facts.title} to the interview step.`;
      case 'offer':
        return `${company} moved your application for ${facts.title} to the offer step.`;
      case 'hired':
        return `Congratulations! ${company} marked your application for ${facts.title} as hired.`;
      case 'rejected':
        return `${company} did not select your application for ${facts.title}.`;
    }
  }

  private writeEvent(
    tx: Executor,
    id: string,
    from: TrackerStatus | null,
    to: TrackerStatus,
    note: string,
  ) {
    return tx
      .insertInto('applicationEvents')
      .values({ trackedApplicationId: id, fromStatus: from, toStatus: to, note })
      .execute();
  }

  private scheduleFollowUp(
    tx: Executor,
    userId: string,
    card: { id: string; title: string; companyName: string },
  ) {
    return tx
      .insertInto('reminders')
      .values({
        userId,
        trackedApplicationId: card.id,
        interviewId: null,
        kind: 'follow_up',
        remindAt: new Date(Date.now() + this.config.env.FOLLOW_UP_DAYS * DAY_MS),
        message: `Time to follow up on ${card.title} at ${card.companyName}.`,
        sentAt: null,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  private notify(tx: Executor, userId: string, cardId: string, message: string) {
    return tx
      .insertInto('notifications')
      .values({
        userId,
        type: 'application-update',
        payload: JSON.stringify({
          message,
          trackedApplicationId: cardId,
          link: `/app/tracker/${cardId}`,
        }),
      })
      .execute();
  }
}
