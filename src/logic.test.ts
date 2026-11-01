import { describe, expect, it } from "vitest";
import {
  checkRule,
  formatDuration,
  HOUR,
  intervals,
  MINUTE,
  parseStored,
  toCsv,
  windowStats,
  type Contraction,
} from "./logic";

const mk = (startMin: number, durSec: number | null, id = String(startMin)): Contraction => ({
  id,
  start: startMin * MINUTE,
  end: durSec === null ? null : startMin * MINUTE + durSec * 1000,
});

describe("intervals", () => {
  it("is start-to-start, regardless of input order", () => {
    expect(intervals([mk(10, 60), mk(0, 60), mk(5, 60)])).toEqual([5 * MINUTE, 5 * MINUTE]);
  });
  it("skips gaps that span a pause", () => {
    const list = [mk(0, 60), mk(5, 60), mk(60, 60), mk(65, 60)];
    const breaks = [{ start: 10 * MINUTE, end: 55 * MINUTE }];
    expect(intervals(list, breaks)).toEqual([5 * MINUTE, 5 * MINUTE]);
  });
  it("skips a gap when a pause is still open", () => {
    expect(intervals([mk(0, 60), mk(30, 60)], [{ start: 10 * MINUTE, end: null }])).toEqual([]);
  });
});

describe("windowStats", () => {
  it("only counts the last hour", () => {
    const s = windowStats([mk(0, 30), mk(70, 60), mk(75, 90)], 80 * MINUTE);
    expect(s.count).toBe(2);
    expect(s.avgDuration).toBe(75_000);
    expect(s.avgInterval).toBe(5 * MINUTE);
  });
  it("ignores in-progress contractions for duration", () => {
    const s = windowStats([mk(0, 60), mk(5, null)], 6 * MINUTE);
    expect(s.avgDuration).toBe(60_000);
    expect(s.count).toBe(2);
  });
  it("returns nulls when empty or single", () => {
    expect(windowStats([], 0)).toEqual({ count: 0, avgDuration: null, avgInterval: null });
    expect(windowStats([mk(0, 60)], MINUTE).avgInterval).toBeNull();
  });
});

describe("checkRule", () => {
  const steady = Array.from({ length: 13 }, (_, i) => mk(i * 5, 65));
  it("is met after a full hour of 5-minute, 1-minute contractions", () => {
    expect(checkRule(steady, 60 * MINUTE).met).toBe(true);
  });
  it("is not met at 54 minutes (no hidden slack)", () => {
    const r = checkRule(steady.slice(0, 11), 54 * MINUTE);
    expect(r.patternOk).toBe(true);
    expect(r.met).toBe(false);
  });
  it("shows progress with only 20 minutes of data", () => {
    const r = checkRule(steady.slice(0, 5), 20 * MINUTE);
    expect(r.met).toBe(false);
    expect(r.progress).toBeCloseTo(1 / 3, 1);
  });
  it("is not met when contractions are too short, even if one shows 1:00", () => {
    const short = Array.from({ length: 13 }, (_, i) => mk(i * 5, 59.6));
    expect(checkRule(short, HOUR).patternOk).toBe(false);
    expect(formatDuration(59_600)).toBe("0:59");
  });
  it("respects the chosen rule", () => {
    expect(checkRule(steady, HOUR, "3-1-1").patternOk).toBe(false);
    expect(checkRule(steady, HOUR, "5-1-1").patternOk).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats and truncates", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_599_999)).toBe("59:59");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("toCsv", () => {
  it("has header and one row per contraction", () => {
    const lines = toCsv([mk(0, 60), mk(5, 45)])
      .trim()
      .split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith(",45,300")).toBe(true);
  });
});

describe("parseStored", () => {
  it("handles junk", () => {
    for (const bad of [null, "nope", '{"a":1}', "5"]) {
      expect(parseStored(bad).contractions).toEqual([]);
    }
  });
  it("migrates the original array format", () => {
    const d = parseStored('[{"id":"a","start":1,"end":null},{"id":3}]');
    expect(d.contractions).toHaveLength(1);
    expect(d.rule).toBe("5-1-1");
  });
  it("drops rows whose end precedes start", () => {
    expect(parseStored('[{"id":"a","start":100,"end":50}]').contractions).toEqual([]);
  });
  it("keeps only the latest in-progress contraction and open break", () => {
    const d = parseStored(
      JSON.stringify({
        contractions: [
          { id: "a", start: 1, end: null },
          { id: "b", start: 2, end: null },
          { id: "c", start: 0, end: 1 },
        ],
        breaks: [
          { start: 1, end: null },
          { start: 5, end: null },
        ],
        rule: "3-1-1",
      }),
    );
    expect(d.contractions.map((c) => c.id).sort()).toEqual(["b", "c"]);
    expect(d.breaks).toEqual([{ start: 5, end: null }]);
    expect(d.rule).toBe("3-1-1");
  });
});
