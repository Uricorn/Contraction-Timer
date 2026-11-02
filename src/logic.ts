export interface Contraction {
  id: string;
  /** Epoch ms when the contraction began. */
  start: number;
  /** Epoch ms when it ended, or null while in progress. */
  end: number | null;
  /** Optional free-text note. */
  note?: string;
}

/** A pause: the timer is deliberately stopped (e.g. a nap or a shower). */
export interface Break {
  start: number;
  end: number | null;
}

export type RuleKey = "5-1-1" | "4-1-1" | "3-1-1";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/** Common "call your midwife/hospital" guidelines: apart (min), length (min), for an hour. */
export const RULES: Record<RuleKey, { interval: number; duration: number }> = {
  "5-1-1": { interval: 5, duration: 1 },
  "4-1-1": { interval: 4, duration: 1 },
  "3-1-1": { interval: 3, duration: 1 },
};

export interface Data {
  contractions: Contraction[];
  breaks: Break[];
  rule: RuleKey;
  /** Epoch ms when the waters broke, or null. */
  watersBroke: number | null;
}

export const emptyData = (): Data => ({
  contractions: [],
  breaks: [],
  rule: "5-1-1",
  watersBroke: null,
});

export interface DangerSigns {
  /** A contraction (finished or ongoing) has lasted over 2 minutes. */
  long: boolean;
  /** 6 or more contractions started within the last 10 minutes. */
  frequent: boolean;
}

/** Warning signs that mean "call now", whatever the 5-1-1 pattern says. */
export function dangerSigns(list: Contraction[], now: number): DangerSigns {
  const recent = list.filter((c) => c.start >= now - HOUR && c.start <= now);
  return {
    long: recent.some((c) => (c.end ?? now) - c.start > 2 * MINUTE),
    frequent: list.filter((c) => c.start >= now - 10 * MINUTE && c.start <= now).length >= 6,
  };
}

export interface Stats {
  count: number;
  /** Average contraction length in ms, or null if none completed. */
  avgDuration: number | null;
  /** Average start-to-start interval in ms, or null if fewer than two. */
  avgInterval: number | null;
}

export const sortByStart = (list: Contraction[]): Contraction[] =>
  [...list].sort((a, b) => a.start - b.start);

/** True if any break overlaps the span between two contraction starts. */
function crossesBreak(from: number, to: number, breaks: Break[]): boolean {
  return breaks.some((b) => b.start < to && (b.end ?? Infinity) > from);
}

/**
 * Start-to-start gaps (ms) between consecutive contractions. Gaps that span
 * a pause are left out, since they would wrongly inflate the average.
 */
export function intervals(list: Contraction[], breaks: Break[] = []): number[] {
  const s = sortByStart(list);
  const gaps: number[] = [];
  for (let i = 1; i < s.length; i++) {
    if (!crossesBreak(s[i - 1].start, s[i].start, breaks)) {
      gaps.push(s[i].start - s[i - 1].start);
    }
  }
  return gaps;
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** Stats for contractions that started within `windowMs` before `now`. */
export function windowStats(
  list: Contraction[],
  now: number,
  windowMs = HOUR,
  breaks: Break[] = [],
): Stats {
  const inWindow = sortByStart(list).filter((c) => c.start >= now - windowMs && c.start <= now);
  const durations = inWindow.filter((c) => c.end !== null).map((c) => (c.end as number) - c.start);
  return {
    count: inWindow.length,
    avgDuration: mean(durations),
    avgInterval: mean(intervals(inWindow, breaks)),
  };
}

export interface RuleResult {
  /** The last hour's averages currently match the rule. */
  patternOk: boolean;
  /** Pattern matches AND has held for the full hour. */
  met: boolean;
  /** 0..1 of the hour for which the pattern has held. */
  progress: number;
}

/**
 * "5-1-1"-style guidance: contractions at most `interval` minutes apart, at
 * least `duration` minutes long, sustained for an hour. A prompt to call your
 * midwife/hospital, not medical advice.
 */
export function checkRule(
  list: Contraction[],
  now: number,
  rule: RuleKey = "5-1-1",
  breaks: Break[] = [],
): RuleResult {
  const { interval, duration } = RULES[rule];
  const stats = windowStats(list, now, HOUR, breaks);
  const first = sortByStart(list).find((c) => c.start >= now - HOUR && c.start <= now);
  const span = first ? now - first.start : 0;
  const gaps = intervals(
    sortByStart(list).filter((c) => c.start >= now - HOUR && c.start <= now),
    breaks,
  );
  // An average alone can hide a very uneven pattern (2 min, 8 min, 2 min...).
  const steady = gaps.every((g) => g <= interval * MINUTE * 1.5);
  const patternOk =
    steady &&
    stats.avgInterval !== null &&
    stats.avgDuration !== null &&
    stats.avgInterval <= interval * MINUTE &&
    stats.avgDuration >= duration * MINUTE;
  const progress = patternOk ? Math.min(1, span / HOUR) : 0;
  return { patternOk, met: patternOk && progress >= 1, progress };
}

export interface Meter {
  /** Measured value in ms, or null when there is not enough data yet. */
  value: number | null;
  /** The rule's target in ms. */
  goal: number;
  /** 0..1 fullness for a progress bar. */
  fill: number;
  ok: boolean;
}

export interface RuleMeters {
  /** Average start-to-start gap vs "at most N minutes apart". */
  apart: Meter;
  /** Average length vs "at least 1 minute". */
  length: Meter;
  /** How long both goals have held vs one hour. */
  hour: Meter;
  met: boolean;
}

/** Everything the guideline panel shows, one meter per digit of "5-1-1". */
export function ruleMeters(
  list: Contraction[],
  now: number,
  rule: RuleKey = "5-1-1",
  breaks: Break[] = [],
): RuleMeters {
  const { interval, duration } = RULES[rule];
  const stats = windowStats(list, now, HOUR, breaks);
  const r = checkRule(list, now, rule, breaks);
  const apartGoal = interval * MINUTE;
  const lengthGoal = duration * MINUTE;
  const a = stats.avgInterval;
  const l = stats.avgDuration;
  return {
    apart: {
      value: a,
      goal: apartGoal,
      fill: a === null ? 0 : Math.min(1, apartGoal / a),
      ok: a !== null && a <= apartGoal,
    },
    length: {
      value: l,
      goal: lengthGoal,
      fill: l === null ? 0 : Math.min(1, l / lengthGoal),
      ok: l !== null && l >= lengthGoal,
    },
    hour: { value: r.progress * HOUR, goal: HOUR, fill: r.progress, ok: r.met },
    met: r.met,
  };
}

/** Format ms as m:ss (or h:mm:ss from one hour). Truncates, like a stopwatch. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const isTime = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Defensively parse stored JSON (current object format, or the original
 * plain array). Drops malformed rows and keeps at most one in-progress
 * contraction and one open break (the latest).
 */
export function parseStored(raw: string | null): Data {
  const out = emptyData();
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  const obj = (Array.isArray(data) ? { contractions: data } : data) as Record<string, unknown>;
  if (typeof obj !== "object" || obj === null) return out;

  const rawC = Array.isArray(obj.contractions) ? obj.contractions : [];
  const cs = rawC.filter(
    (c): c is Contraction =>
      typeof c === "object" &&
      c !== null &&
      typeof c.id === "string" &&
      isTime(c.start) &&
      (c.end === null || (isTime(c.end) && c.end >= c.start)),
  );
  for (const c of cs) {
    delete (c as { pain?: unknown }).pain; // pain ratings were removed; drop old stored values
    if (typeof c.note !== "string" || !c.note) delete c.note;
    else c.note = c.note.slice(0, 200);
  }
  const open = sortByStart(cs).filter((c) => c.end === null);
  const keep = open.at(-1);
  out.contractions = cs.filter((c) => c.end !== null || c === keep);

  const rawB = Array.isArray(obj.breaks) ? obj.breaks : [];
  const bs = rawB.filter(
    (b): b is Break =>
      typeof b === "object" &&
      b !== null &&
      isTime(b.start) &&
      (b.end === null || (isTime(b.end) && b.end >= b.start)),
  );
  const openB = [...bs]
    .sort((a, b) => a.start - b.start)
    .filter((b) => b.end === null)
    .at(-1);
  out.breaks = bs.filter((b) => b.end !== null || b === openB);

  if (isTime(obj.watersBroke)) out.watersBroke = obj.watersBroke;
  if (typeof obj.rule === "string" && obj.rule in RULES) out.rule = obj.rule as RuleKey;
  return out;
}
