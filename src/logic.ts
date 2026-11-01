export interface Contraction {
  id: string;
  /** Epoch ms when the contraction began. */
  start: number;
  /** Epoch ms when it ended, or null while in progress. */
  end: number | null;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export interface Stats {
  count: number;
  /** Average contraction length in ms, or null if none completed. */
  avgDuration: number | null;
  /** Average start-to-start interval in ms, or null if fewer than two. */
  avgInterval: number | null;
}

export const sortByStart = (list: Contraction[]): Contraction[] =>
  [...list].sort((a, b) => a.start - b.start);

/** Start-to-start gaps (ms) between consecutive contractions. */
export function intervals(list: Contraction[]): number[] {
  const s = sortByStart(list);
  return s.slice(1).map((c, i) => c.start - s[i].start);
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** Stats for contractions that started within `windowMs` before `now`. */
export function windowStats(list: Contraction[], now: number, windowMs = HOUR): Stats {
  const inWindow = sortByStart(list).filter((c) => c.start >= now - windowMs && c.start <= now);
  const durations = inWindow.filter((c) => c.end !== null).map((c) => (c.end as number) - c.start);
  return {
    count: inWindow.length,
    avgDuration: mean(durations),
    avgInterval: mean(intervals(inWindow)),
  };
}

export interface RuleResult {
  met: boolean;
  /** 0..1 progress towards the rule being sustained for the full hour. */
  progress: number;
}

/**
 * The common "5-1-1" guidance: contractions about every 5 minutes, lasting
 * about 1 minute, for at least 1 hour. This is a prompt to call your
 * midwife/hospital, not medical advice.
 */
export function fiveOneOne(
  list: Contraction[],
  now: number,
  maxInterval = 5 * MINUTE,
  minDuration = MINUTE,
): RuleResult {
  const stats = windowStats(list, now);
  const inWindow = sortByStart(list).filter((c) => c.start >= now - HOUR);
  const span = inWindow.length ? now - inWindow[0].start : 0;
  const patternOk =
    stats.avgInterval !== null &&
    stats.avgDuration !== null &&
    stats.avgInterval <= maxInterval &&
    stats.avgDuration >= minDuration;
  // Allow a little slack: data covering ~55 min of the hour counts.
  const progress = patternOk ? Math.min(1, span / (55 * MINUTE)) : 0;
  return { met: patternOk && progress >= 1, progress };
}

/** Format ms as m:ss (or h:mm:ss from one hour). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function toCsv(list: Contraction[]): string {
  const rows = sortByStart(list);
  const lines = ["start,end,duration_seconds,interval_seconds"];
  rows.forEach((c, i) => {
    const dur = c.end === null ? "" : Math.round((c.end - c.start) / 1000);
    const gap = i === 0 ? "" : Math.round((c.start - rows[i - 1].start) / 1000);
    lines.push(
      [
        new Date(c.start).toISOString(),
        c.end === null ? "" : new Date(c.end).toISOString(),
        dur,
        gap,
      ].join(","),
    );
  });
  return lines.join("\n") + "\n";
}

/** Defensively parse stored JSON; drops anything malformed. */
export function parseStored(raw: string | null): Contraction[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (c): c is Contraction =>
        typeof c === "object" &&
        c !== null &&
        typeof c.id === "string" &&
        Number.isFinite(c.start) &&
        (c.end === null || (Number.isFinite(c.end) && c.end >= c.start)),
    );
  } catch {
    return [];
  }
}
