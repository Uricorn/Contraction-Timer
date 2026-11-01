import "./style.css";
import { initTips } from "./tips";
import { initViews } from "./views";
import { initChecklist } from "./checklist";
import { initNotes } from "./notes";
import { getLocale, initI18n, t } from "./i18n";
import {
  formatDuration,
  parseStored,
  RULES,
  MINUTE,
  sortByStart,
  toCsv,
  windowStats,
  ruleMeters,
  type Meter,
  type Contraction,
  type RuleKey,
} from "./logic";

const KEY = "contraction-timer:v1";
/** Ignore taps this soon after the last one (double taps). */
const DEBOUNCE_MS = 400;
/** A "contraction" shorter than this is treated as an accidental tap and dropped. */
const MIN_CONTRACTION_MS = 1000;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

let data = parseStored(localStorage.getItem(KEY));
let lastTap = 0;

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    document.dispatchEvent(new CustomEvent("savefail"));
  }
};

const activeContraction = () => data.contractions.find((c) => c.end === null);
const openBreak = () => data.breaks.find((b) => b.end === null);
const lastFinished = () =>
  sortByStart(data.contractions)
    .filter((c) => c.end !== null)
    .at(-1);

let wakeLock: WakeLockSentinel | null = null;
async function holdScreen(on: boolean) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        if (activeContraction() && document.visibilityState === "visible") void holdScreen(true);
      });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    /* not supported or denied: ignore */
  }
}

function toggle() {
  const now = Date.now();
  if (now - lastTap < DEBOUNCE_MS) return;
  lastTap = now;
  const current = activeContraction();
  if (current) {
    if (now - current.start < MIN_CONTRACTION_MS) {
      data.contractions = data.contractions.filter((c) => c !== current);
    } else {
      // Never let a backwards clock change produce a negative duration.
      current.end = Math.max(now, current.start);
    }
    void holdScreen(false);
  } else {
    const pause = openBreak();
    if (pause) pause.end = Math.max(now, pause.start);
    data.contractions.push({ id: crypto.randomUUID(), start: now, end: null });
    void holdScreen(true);
  }
  save();
  render();
  navigator.vibrate?.(30);
}

function togglePause() {
  const now = Date.now();
  if (activeContraction()) return;
  const pause = openBreak();
  if (pause) pause.end = Math.max(now, pause.start);
  else data.breaks.push({ start: now, end: null });
  save();
  render();
}

const clock = $("clock");
const label = $("state-label");
const sub = $("clock-sub");
const button = $<HTMLButtonElement>("toggle");
const pauseBtn = $<HTMLButtonElement>("pause");
const list = $("list");
const empty = $("empty");
const rule = $("rule");
const segButtons = document.querySelectorAll<HTMLButtonElement>(".seg button");
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });

function setState(state: string, text: string, btn: string) {
  document.body.dataset.state = state;
  label.textContent = text;
  button.textContent = btn;
}

/** Cheap per-second update: clock, label and stats. */
function tick() {
  const now = Date.now();
  const cur = activeContraction();
  const pause = openBreak();
  const last = lastFinished();

  pauseBtn.hidden = !!cur || data.contractions.length === 0;
  pauseBtn.textContent = pause ? t("Resume") : t("Pause");

  if (cur) {
    setState("contracting", t("🫧 Contraction"), t("Stop"));
    clock.textContent = formatDuration(now - cur.start);
    const prev = sortByStart(data.contractions)
      .filter((c) => c !== cur)
      .at(-1);
    sub.textContent = prev
      ? t("{time} since the last one began", { time: formatDuration(cur.start - prev.start) })
      : "\u00a0";
  } else if (pause) {
    setState("paused", t("☁️ Paused"), t("Start"));
    clock.textContent = formatDuration(last?.end ? pause.start - last.end : 0);
    sub.textContent = t("paused for {time}", { time: formatDuration(now - pause.start) });
  } else if (last?.end) {
    setState("resting", t("🌿 Resting"), t("Start"));
    clock.textContent = formatDuration(now - last.end);
    sub.textContent = t("{time} since the last one began", {
      time: formatDuration(now - last.start),
    });
  } else {
    setState("idle", t("Ready when you are"), t("Start"));
    clock.textContent = "0:00";
    sub.textContent = "\u00a0";
  }

  const s = windowStats(data.contractions, now, undefined, data.breaks);
  $("stat-count").textContent = String(s.count);
  const m = ruleMeters(data.contractions, now, data.rule, data.breaks);
  $("d-apart").textContent = data.rule.split("-")[0];
  setMeter("apart", m.apart, (v) => t("avg {time}", { time: formatDuration(v) }));
  setMeter("length", m.length, (v) => t("avg {time}", { time: formatDuration(v) }));
  setMeter("hour", m.hour, (v) => t("{n} of 60 min", { n: Math.floor(v / MINUTE) }), true);

  rule.className = m.met ? "rule go" : "rule";
  if (m.met) {
    rule.textContent = t(
      "Contractions have matched {rule} for a full hour. It may be time to head to the hospital or birth centre. Call ahead to let them know you are coming.",
      { rule: data.rule },
    );
  } else if (s.count < 3) {
    rule.textContent = t("Keep timing. A few more contractions will show your pattern.");
  } else if (m.apart.ok && m.length.ok) {
    rule.textContent = t("Matching {rule}. Keep going until all three are ticked.", {
      rule: data.rule,
    });
  } else {
    rule.textContent = t("Not at {rule} yet. Keep going, you're doing great.", { rule: data.rule });
  }
}

function setMeter(name: string, m: Meter, label: (v: number) => string, always = false) {
  $(`m-${name}`).classList.toggle("ok", m.ok);
  $(`b-${name}`).style.width = `${Math.round(m.fill * 100)}%`;
  $(`v-${name}`).textContent =
    m.value === null ? "–" : `${m.ok ? "✓ " : ""}${always || m.value > 0 ? label(m.value) : "–"}`;
}

/** Heavier rebuild of the history list, only when data changes. */
function renderList() {
  const asc = sortByStart(data.contractions);
  empty.hidden = asc.length > 0;
  list.replaceChildren(
    ...asc
      .map((c, i) => {
        const gap = i > 0 ? c.start - asc[i - 1].start : null;
        const li = document.createElement("li");
        const when = document.createElement("div");
        const when1 = document.createElement("div");
        when1.className = "t";
        when1.textContent =
          c.end === null
            ? `${time(c.start)} · ${t("in progress")}`
            : `${time(c.start)} · ${formatDuration(c.end - c.start)}`;
        const m = document.createElement("div");
        m.className = "m";
        m.textContent =
          gap === null
            ? t("first")
            : t("{time} after the previous began", { time: formatDuration(gap) });
        when.append(when1, m);
        const del = document.createElement("button");
        del.className = "del";
        del.type = "button";
        del.textContent = "✕";
        del.setAttribute("aria-label", t("Delete contraction at {time}", { time: time(c.start) }));
        del.addEventListener("click", () => remove(c));
        li.append(when, del);
        return li;
      })
      .reverse(),
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showUndo(c: Contraction) {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  const msg = document.createElement("span");
  msg.textContent = t("Contraction deleted");
  const undo = document.createElement("button");
  undo.type = "button";
  undo.textContent = t("Undo");
  undo.addEventListener("click", () => {
    if (!data.contractions.some((x) => x.id === c.id)) data.contractions.push(c);
    toast.remove();
    save();
    render();
  });
  toast.append(msg, undo);
  document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), 8000);
}

function remove(c: Contraction) {
  data.contractions = data.contractions.filter((x) => x.id !== c.id);
  if (c.end === null) void holdScreen(false);
  save();
  render();
  showUndo(c);
}

function render() {
  segButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.rule === data.rule)));
  renderList();
  tick();
}

button.addEventListener("click", toggle);
pauseBtn.addEventListener("click", togglePause);

segButtons.forEach((b) =>
  b.addEventListener("click", () => {
    const key = b.dataset.rule ?? "";
    if (key in RULES) data.rule = key as RuleKey;
    save();
    render();
  }),
);

$("clear").addEventListener("click", () => {
  if (data.contractions.length && confirm(t("Delete all contractions? This cannot be undone."))) {
    data.contractions = [];
    data.breaks = [];
    save();
    void holdScreen(false);
    render();
  }
});

$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([toCsv(data.contractions)], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "contractions.csv" });
  a.click();
  URL.revokeObjectURL(url);
});

document.addEventListener("langchange", render);
document.addEventListener("savefail", () => {
  $("save-warning").hidden = false;
});

// Stay in sync if the app is open in another tab/window.
addEventListener("storage", (e) => {
  if (e.key === KEY) {
    data = parseStored(e.newValue);
    render();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    tick();
    if (activeContraction()) void holdScreen(true);
  }
});

initI18n();
initViews();
initTips();
initChecklist();
initNotes();
render();
setInterval(tick, 1000);
if (activeContraction()) void holdScreen(true);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    // A new version took over: reload onto it, but never mid-contraction.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !activeContraction()) location.reload();
    });
  });
}
