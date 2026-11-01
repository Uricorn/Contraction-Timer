import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { he } from "./locales/he";
import { ar } from "./locales/ar";
import { DEFAULT_ITEMS } from "./checklist";
import { DEFAULT_FIELDS } from "./notes";
import { PHRASES } from "./tips";

const html = readFileSync("index.html", "utf8");
const body = html.slice(html.indexOf("<body")).replace(/<!--[\s\S]*?-->/g, "");
const norm = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Every user-visible English string: HTML text nodes, labels, and the data-driven lists. */
const sources = new Set<string>();
for (const m of body.matchAll(/>([^<]+)</g)) sources.add(norm(m[1]));
for (const m of body.matchAll(/(?:aria-label|placeholder)="([^"]+)"/g)) sources.add(m[1]);
for (const i of DEFAULT_ITEMS) sources.add(i.text);
for (const f of DEFAULT_FIELDS) [f.label, f.hint].forEach((s) => sources.add(s));
PHRASES.forEach((p) => sources.add(p));
// Digits, symbols, emoji and language names need no translation.
const needsTranslation = [...sources].filter((s) => /[A-Za-z]{2}/.test(s));

describe.each([
  ["he", he],
  ["ar", ar],
])("%s translations", (_name, dict) => {
  it("covers every English string in the app", () => {
    const skip = new Set(["5-1-1", "4-1-1", "3-1-1", "English", "0 of 0 packed"]);
    expect(needsTranslation.filter((s) => !skip.has(s) && !dict[s])).toEqual([]);
  });

  it("keeps the same {placeholders} as the English key", () => {
    for (const [en, tr] of Object.entries(dict)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(tr), en).toBe(ph(en));
    }
  });
});
