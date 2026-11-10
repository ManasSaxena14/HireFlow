import skills from './skills.json' with { type: 'json' };

interface SkillEntry {
  name: string;
  aliases: string[];
  /** Short names that are also normal words, so they only count with these exact capitals. */
  exact?: string[];
}

export interface MatchBreakdown {
  coverage: number;
  keywordSim: number;
  sections: number;
}

export interface MatchResult {
  score: number;
  matched: string[];
  missing: string[];
  sectionsFound: string[];
  suggestions: string[];
  breakdown: MatchBreakdown;
}

const STOP_WORDS = new Set(
  `a about above after again all also am an and any are as at be because been before being below
  between both but by can could did do does doing down during each few for from further had has
  have having he her here hers him his how i if in into is it its itself just me more most my no
  nor not now of off on once only or other our ours out over own same she should so some such than
  that the their theirs them then there these they this those through to too under until up very
  was we were what when where which while who whom why will with would you your yours us etc`.split(
    /\s+/,
  ),
);

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Lowercase, no punctuation, single spaces. Only + and # and a dot inside a word stay,
 * because they are part of names like C++, C# and Node.js.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\s]/gu, ' ')
    .replace(/\.(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DICTIONARY = skills as SkillEntry[];

type SkillPattern = { name: string; pattern: RegExp };

// The patterns are built on first use, not at start, so the server starts faster after sleep.
let patterns: { aliases: SkillPattern[]; exact: SkillPattern[] } | undefined;

// The longest goes first and is blanked out once found, so "React Native" is not also "React".
const buildAliases = (): SkillPattern[] =>
  DICTIONARY.flatMap(({ name, aliases }) =>
    aliases.map((alias) => ({ name, alias: normalizeText(alias) })),
  )
    .sort((a, b) => b.alias.length - a.alias.length || compare(a.alias, b.alias))
    .map(({ name, alias }) => ({
      name,
      pattern: new RegExp(`(?<![\\p{L}\\p{N}+#.])${escapeRegExp(alias)}(?![\\p{L}\\p{N}+#])`, 'gu'),
    }));

const buildExact = (): SkillPattern[] =>
  DICTIONARY.flatMap(({ name, exact }) =>
    (exact ?? []).map((word) => ({
      name,
      pattern: new RegExp(
        `(?<![\\p{L}\\p{N}+#.&-])${escapeRegExp(word)}(?![\\p{L}\\p{N}+#&-])(?! to\\b)`,
        'u',
      ),
    })),
  );

/** Every known skill in the text, by its main name, in a fixed order. */
export function findSkills(text: string): string[] {
  patterns ??= { aliases: buildAliases(), exact: buildExact() };
  const found = new Set<string>();
  let rest = normalizeText(text);
  for (const { name, pattern } of patterns.aliases) {
    rest = rest.replace(pattern, (whole) => {
      found.add(name);
      return ' '.repeat(whole.length);
    });
  }
  for (const { name, pattern } of patterns.exact) {
    if (pattern.test(text)) found.add(name);
  }
  return [...found].sort(compare);
}

const REQUIRED_HEADING =
  /^(requirements?|required( skills| qualifications)?|must[- ]haves?|minimum qualifications|basic qualifications|qualifications|what you( will)? need|what we('| a)re looking for|what you bring|you have|skills required)\b/i;
const OPTIONAL_HEADING = /\b(nice|bonus|preferred|plus|desirable|optional|good to have)\b/i;
const OTHER_HEADING =
  /^(responsibilities|what you('ll| will) do|about( us| the (role|job|team|company))?|benefits|perks|what we offer|the role|overview|how to apply|nice to have|bonus|preferred|good to have)\b/i;

const stripLine = (line: string) =>
  line
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The text under headings like "Requirements", where a skill counts double. */
function requiredPart(jobText: string): string {
  const kept: string[] = [];
  let inside = false;
  for (const rawLine of jobText.split(/\r?\n/)) {
    const line = stripLine(rawLine);
    if (!line) continue;
    const short = line.length <= 60;
    const opensRequired = REQUIRED_HEADING.test(line) && !OPTIONAL_HEADING.test(line);
    if (opensRequired && (short || line.includes(':'))) {
      inside = true;
      // Handles "Requirements: Python and SQL" on one line.
      kept.push(line.slice(line.indexOf(':') + 1));
      continue;
    }
    const endsWithColon = short && line.endsWith(':');
    const allCapitals = short && /\p{L}/u.test(line) && line === line.toUpperCase();
    if ((short && OTHER_HEADING.test(line)) || endsWithColon || allCapitals) {
      inside = false;
      continue;
    }
    if (inside) kept.push(line);
  }
  return kept.join('\n');
}

const SECTION_HEADINGS: [string, RegExp][] = [
  ['experience', /^(\w+ )?(experience|employment( history)?|work history)$/],
  ['education', /^(education|academic background|academics|qualifications)$/],
  ['skills', /^(\w+ )?(skills|technologies|skills and tools)$/],
  ['projects', /^(\w+ )?projects$/],
];

/** Which of the four usual headings the resume has. They must be alone on their line. */
function findSections(resumeText: string): string[] {
  const lines = resumeText
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter((line) => line.length > 0 && line.length <= 40);
  return SECTION_HEADINGS.filter(([, heading]) => lines.some((line) => heading.test(line))).map(
    ([name]) => name,
  );
}

function termCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of normalizeText(text).split(' ')) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

/** Cosine similarity of TF-IDF vectors, using the two texts as the whole set of documents. */
function keywordSimilarity(first: string, second: string): number {
  const a = termCounts(first);
  const b = termCounts(second);
  if (a.size === 0 || b.size === 0) return 0;
  const idf = (term: string) => {
    const documents = (a.has(term) ? 1 : 0) + (b.has(term) ? 1 : 0);
    return Math.log(3 / (1 + documents)) + 1;
  };
  const length = (counts: Map<string, number>) =>
    Math.sqrt([...counts].reduce((sum, [term, n]) => sum + (n * idf(term)) ** 2, 0));
  let dot = 0;
  for (const [term, n] of a) {
    const other = b.get(term);
    if (other) dot += n * other * idf(term) ** 2;
  }
  return Math.min(1, dot / (length(a) * length(b)));
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The resume score. It uses only its two inputs and no clock or random value, so the same
 * resume and job always give the same answer, and each part can be explained to the person.
 * A job with no skills we know gets a coverage of 0, because there is nothing to compare.
 */
export function matchResume(resumeText: string, jobText: string): MatchResult {
  const resumeSkills = new Set(findSkills(resumeText));
  const required = new Set(findSkills(requiredPart(jobText)));
  const weight = (skill: string) => (required.has(skill) ? 2 : 1);
  const byWeight = (a: string, b: string) => weight(b) - weight(a) || compare(a, b);

  const jobSkills = findSkills(jobText);
  const matched = jobSkills.filter((skill) => resumeSkills.has(skill)).sort(byWeight);
  const missing = jobSkills.filter((skill) => !resumeSkills.has(skill)).sort(byWeight);

  const totalOf = (list: string[]) => list.reduce((sum, skill) => sum + weight(skill), 0);
  const total = totalOf(jobSkills);
  const coverage = total === 0 ? 0 : totalOf(matched) / total;
  const keywordSim = keywordSimilarity(resumeText, jobText);
  const sectionsFound = findSections(resumeText);
  const sections = sectionsFound.length / SECTION_HEADINGS.length;

  return {
    score: Math.round(100 * (0.65 * coverage + 0.25 * keywordSim + 0.1 * sections)),
    matched,
    missing,
    sectionsFound,
    suggestions: missing
      .filter((skill) => weight(skill) === 2)
      .map(
        (skill) =>
          `The job asks for ${skill}. Add it only if you have real experience with ${skill}.`,
      ),
    breakdown: {
      coverage: round4(coverage),
      keywordSim: round4(keywordSim),
      sections: round4(sections),
    },
  };
}
