import type { ResumeMatch } from '@hireflow/shared';
import { Check, Plus } from 'lucide-react';

const SECTIONS = ['experience', 'education', 'skills', 'projects'];
const percent = (share: number) => Math.round(share * 100);

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      data-testid="match-score"
      role="img"
      aria-label={`Score: ${score} out of 100`}
      className="grid size-40 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--color-accent) ${score * 3.6}deg, var(--color-overlay) 0)`,
      }}
    >
      <div className="grid size-32 place-items-center rounded-full bg-sunken text-center">
        <span>
          <span className="font-display block text-5xl font-extrabold tracking-tight">{score}</span>
          <span className="text-xs font-semibold text-muted">out of 100</span>
        </span>
      </div>
    </div>
  );
}

function Part({ label, hint, share }: { label: string; hint: string; share: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-semibold text-muted">{percent(share)}%</span>
      </div>
      <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-overlay">
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent(share)}%` }} />
      </div>
      <p className="mt-1 text-[13px] text-muted">{hint}</p>
    </div>
  );
}

function SkillList({
  title,
  skills,
  empty,
  tone,
}: {
  title: string;
  skills: string[];
  empty: string;
  tone: 'have' | 'need';
}) {
  const Icon = tone === 'have' ? Check : Plus;
  return (
    <section className="rounded-[20px] border border-line bg-raised/60 p-5">
      <h3 className="font-display text-xl font-extrabold tracking-tight">
        {title} <span className="text-muted">({skills.length})</span>
      </h3>
      {skills.length === 0 ? (
        <p className="mt-3 text-[15px] text-muted">{empty}</p>
      ) : (
        <ul aria-label={title} className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li
              key={skill}
              className="inline-flex items-center gap-1 rounded-full bg-overlay px-3 py-1 text-[13px] font-semibold"
            >
              <Icon aria-hidden className={tone === 'have' ? 'size-3.5 text-accent' : 'size-3.5'} />
              {skill}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MatchReport({ match }: { match: ResumeMatch }) {
  const noSkills = match.matched.length + match.missing.length === 0;
  const missingSections = SECTIONS.filter((name) => !match.sectionsFound.includes(name));
  return (
    <div data-testid="match-report" className="space-y-3">
      <section className="flex flex-wrap items-center gap-6 rounded-[20px] border border-line bg-raised/60 p-5 sm:gap-10 sm:p-6">
        <ScoreRing score={match.score} />
        <div className="min-w-0 flex-1 basis-72 space-y-4">
          <h2 className="font-display text-2xl font-extrabold tracking-tight break-words">
            {match.jobRef ?? 'This job'}
          </h2>
          <Part
            label="Skills the job asks for"
            hint="This counts the most. Skills under headings like Requirements count double."
            share={match.breakdown.coverage}
          />
          <Part
            label="Shared words"
            hint="How much your resume and the job use the same important words."
            share={match.breakdown.keywordSim}
          />
          <Part
            label="Resume sections"
            hint={
              missingSections.length === 0
                ? 'We found all four usual headings.'
                : `We did not find these headings: ${missingSections.join(', ')}.`
            }
            share={match.breakdown.sections}
          />
        </div>
      </section>

      {noSkills && (
        <p
          role="status"
          className="rounded-2xl border border-line-strong bg-raised p-4 text-[15px]"
        >
          We did not find any skills we know in this job, so the score can only use shared words and
          resume sections. It will look low for that reason.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <SkillList
          title="You have"
          tone="have"
          skills={match.matched}
          empty="None of the job's skills are in your resume yet."
        />
        <SkillList
          title="Missing from your resume"
          tone="need"
          skills={match.missing}
          empty="Your resume has every skill we found in this job."
        />
      </div>

      {match.suggestions.length > 0 && (
        <section className="rounded-[20px] border border-line bg-raised/60 p-5">
          <h3 className="font-display text-xl font-extrabold tracking-tight">What to do next</h3>
          <ul className="mt-3 space-y-2 text-[15px] text-muted">
            {match.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
