/**
 * Tiny offline i18n. English text is the key: the HTML and code stay in English,
 * and `he` / `ar` map the exact English string to its translation. Anything
 * missing from a dictionary falls back to English.
 */
import { he } from "./locales/he";
import { ar } from "./locales/ar";
import { ru } from "./locales/ru";
import { es } from "./locales/es";
import { uk } from "./locales/uk";
import { it } from "./locales/it";
import { tr } from "./locales/tr";
import { pl } from "./locales/pl";

export type Lang = "en" | "he" | "ar" | "ru" | "es" | "uk" | "it" | "tr" | "pl";

export const LANGS: Record<Lang, { name: string; dir: "ltr" | "rtl"; locale: string }> = {
  en: { name: "English", dir: "ltr", locale: "en" },
  he: { name: "עברית", dir: "rtl", locale: "he-IL" },
  // Latin digits so the timer matches the clock and common usage in Israel.
  ar: { name: "العربية", dir: "rtl", locale: "ar-u-nu-latn" },
  ru: { name: "Русский", dir: "ltr", locale: "ru-RU" },
  es: { name: "Español", dir: "ltr", locale: "es" },
  uk: { name: "Українська", dir: "ltr", locale: "uk-UA" },
  it: { name: "Italiano", dir: "ltr", locale: "it-IT" },
  tr: { name: "Türkçe", dir: "ltr", locale: "tr-TR" },
  pl: { name: "Polski", dir: "ltr", locale: "pl-PL" },
};

const DICTS: Record<Lang, Record<string, string>> = { en: {}, he, ar, ru, es, uk, it, tr, pl };
const KEY = "contraction-timer:lang";

let lang: Lang = "en";

const isLang = (v: unknown): v is Lang => typeof v === "string" && v in LANGS;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export const getLang = (): Lang => lang;
export const isRtl = (): boolean => LANGS[lang].dir === "rtl";
export const getLocale = (): string => LANGS[lang].locale;

/** Translate an English string. `{name}` placeholders are filled from `params`. */
export function t(en: string, params?: Record<string, string | number>): string {
  const text = DICTS[lang][en] ?? en;
  if (!params) return text;
  // In right-to-left text, isolate inserted values so digits and names keep their own order.
  const wrap = (v: string) => (isRtl() ? `\u2068${v}\u2069` : v);
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? wrap(String(params[k])) : m));
}

const textOriginals = new WeakMap<Text, string>();
const ATTRS = ["aria-label", "placeholder", "title"] as const;

/** Translate (or restore) every text node and label under `root` using the current language. */
function applyDom(root: ParentNode = document.body): void {
  const dict = DICTS[lang];
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const orig = textOriginals.get(n) ?? n.data;
    const key = norm(orig);
    if (!key) continue;
    const tr = dict[key];
    if (tr !== undefined) {
      textOriginals.set(n, orig);
      const lead = /^\s*/.exec(orig)?.[0] ?? "";
      const trail = /\s*$/.exec(orig)?.[0] ?? "";
      n.data = lead + tr + trail;
    } else if (textOriginals.has(n)) {
      n.data = orig;
    }
  }
  root.querySelectorAll<HTMLElement>("[aria-label],[placeholder],[title]").forEach((el) => {
    for (const attr of ATTRS) {
      const stash = `i18n${attr.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}`;
      const current = el.getAttribute(attr);
      if (current === null) continue;
      const orig = el.dataset[stash] ?? current;
      const tr = dict[norm(orig)];
      if (tr !== undefined) {
        el.dataset[stash] = orig;
        el.setAttribute(attr, tr);
      } else if (el.dataset[stash] !== undefined) {
        el.setAttribute(attr, orig);
      }
    }
  });
}

function detect(): Lang {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: fall through to the browser language */
  }
  if (isLang(stored)) return stored;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0];
    // Old ISO code "iw" is still reported by some Android WebViews.
    const code = base === "iw" ? "he" : base;
    if (isLang(code)) return code;
  }
  return "en";
}

/** Switch language, update the document direction, and tell the views to redraw. */
export function setLang(next: Lang, remember = true): void {
  lang = next;
  const root = document.documentElement;
  root.lang = next;
  root.dir = LANGS[next].dir;
  document.title = t("Contraction Timer");
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", t("Offline contraction timer for labour. No account, no tracking."));
  if (remember) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }
  applyDom();
  document.dispatchEvent(new CustomEvent("langchange", { detail: next }));
}

export function initI18n(): void {
  const select = document.getElementById("lang") as HTMLSelectElement | null;
  if (select) {
    select.replaceChildren(
      ...(Object.keys(LANGS) as Lang[]).map((l) => new Option(LANGS[l].name, l)),
    );
    select.addEventListener("change", () => isLang(select.value) && setLang(select.value));
  }
  const initial = detect();
  if (select) select.value = initial;
  setLang(initial, false);
}
