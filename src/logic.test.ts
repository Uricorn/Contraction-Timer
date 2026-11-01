import { describe, expect, it } from "vitest";
import {
  fiveOneOne,
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
});

describe("windowStats", () => {
  it("only counts the last hour", () => {
    const list = [mk(0, 30), mk(70, 60), mk(75, 90)];
    const s = windowStats(list, 80 * MINUTE);
    expect(s.count).toBe(2);
    expect(s.avgDuration).toBe(75_000);
    expect(s.avgInterval).toBe(5 * MINUTE);
  });
  it("ignores in-progress contractions for duration", () => {
    const s = windowStats([mk(0, 60), mk(5, null)], 6 * MINUTE);
    expect(s.avgDuration).toBe(60_000);
    expect(s.count).toBe(2);
  });
  it("returns nulls when empty", () => {
    expect(windowStats([], 0)).toEqual({ count: 0, avgDuration: null, avgInterval: null });
  });
});

describe("fiveOneOne", () => {
  const steady = Array.from({ length: 13 }, (_, i) => mk(i * 5, 65));
  it("is met after a full hour of 5-minute, 1-minute contractions", () => {
    expect(fiveOneOne(steady, 60 * MINUTE).met).toBe(true);
  });
  it("is not met with only 20 minutes of data", () => {
    const r = fiveOneOne(steady.slice(0, 5), 20 * MINUTE);
    expect(r.met).toBe(false);
    expect(r.progress).toBeGreaterThan(0);
  });
  it("is not met when contractions are too short", () => {
    const short = Array.from({ length: 13 }, (_, i) => mk(i * 5, 30));
    expect(fiveOneOne(short, HOUR).met).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
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
    expect(parseStored(null)).toEqual([]);
    expect(parseStored("nope")).toEqual([]);
    expect(parseStored('{"a":1}')).toEqual([]);
    expect(parseStored('[{"id":"a","start":1,"end":null},{"id":3}]')).toHaveLength(1);
  });
});
