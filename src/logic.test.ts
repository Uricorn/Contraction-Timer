import { describe, expect, it } from "vitest";
import {
  checkRule,
  dangerSigns,
  formatDuration,
  HOUR,
  intervals,
  MINUTE,
  parseStored,
  ruleMeters,
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
  it("is not met when gaps alternate 2 and 8 minutes despite a 5-minute average", () => {
    const starts = [0, 2, 10, 12, 20, 22, 30, 32, 40, 42, 50, 52, 60];
    const uneven = starts.map((m) => mk(m, 65));
    expect(checkRule(uneven, 61 * MINUTE).patternOk).toBe(false);
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

describe("ruleMeters", () => {
  const steady = Array.from({ length: 13 }, (_, i) => mk(i * 5, 65));
  it("maps each digit of the rule to its own meter", () => {
    const m = ruleMeters(steady, HOUR, "5-1-1");
    expect(m.apart).toMatchObject({ goal: 5 * MINUTE, ok: true, fill: 1 });
    expect(m.length).toMatchObject({ goal: MINUTE, ok: true, fill: 1 });
    expect(m.hour.ok).toBe(true);
    expect(m.met).toBe(true);
  });
  it("shows 3-1-1 against the same data as not yet reached", () => {
    const m = ruleMeters(steady, HOUR, "3-1-1");
    expect(m.apart.ok).toBe(false);
    expect(m.apart.fill).toBeCloseTo(0.6);
    expect(m.length.ok).toBe(true);
    expect(m.met).toBe(false);
  });
  it("is empty with no data", () => {
    const m = ruleMeters([], 0);
    expect(m.apart.value).toBeNull();
    expect(m.apart.fill).toBe(0);
    expect(m.hour.fill).toBe(0);
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

describe("dangerSigns", () => {
  it("flags a contraction longer than 2 minutes", () => {
    expect(dangerSigns([mk(0, 130)], 5 * MINUTE).long).toBe(true);
    expect(dangerSigns([mk(0, 90)], 5 * MINUTE).long).toBe(false);
  });
  it("flags an ongoing contraction once it passes 2 minutes", () => {
    expect(dangerSigns([mk(0, null)], 3 * MINUTE).long).toBe(true);
    expect(dangerSigns([mk(0, null)], 1 * MINUTE).long).toBe(false);
  });
  it("flags 6 contractions in 10 minutes but not 5", () => {
    const six = [0, 1, 2, 3, 4, 5].map((m) => mk(m, 30));
    expect(dangerSigns(six, 6 * MINUTE).frequent).toBe(true);
    expect(dangerSigns(six.slice(1), 6 * MINUTE).frequent).toBe(false);
  });
});

describe("parseStored extras", () => {
  it("keeps valid note and waters; drops invalid ones and old pain values", () => {
    const raw = JSON.stringify({
      contractions: [
        { id: "a", start: 1, end: 2, pain: 3, note: "ok" },
        { id: "b", start: 3, end: 4, note: 5 },
      ],
      watersBroke: 100,
    });
    const d = parseStored(raw);
    expect(d.contractions[0]).toMatchObject({ note: "ok" });
    expect(d.contractions[0]).not.toHaveProperty("pain");
    expect(d.contractions[1].note).toBeUndefined();
    expect(d.watersBroke).toBe(100);
  });
});
