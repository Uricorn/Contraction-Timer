import "./style.css";
import { initTips } from "./tips";
import { initViews } from "./views";
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
    /* storage full or blocked: keep running in memory */
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
      wakeLock.addEventListener("release", () => (wakeLock = null));
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
const time = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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

  pauseBtn.hidden = !!cur;
  pauseBtn.textContent = pause ? "Resume" : "Pause";

  if (cur) {
    setState("contracting", "🫧 Contraction", "Stop");
    clock.textContent = formatDuration(now - cur.start);
    const prev = sortByStart(data.contractions)
      .filter((c) => c !== cur)
      .at(-1);
    sub.textContent = prev
      ? `${formatDuration(cur.start - prev.start)} since the last one began`
      : "\u00a0";
  } else if (pause) {
    setState("paused", "☁️ Paused", "Start");
    clock.textContent = formatDuration(last?.end ? pause.start - last.end : 0);
    sub.textContent = `paused for ${formatDuration(now - pause.start)}`;
  } else if (last?.end) {
    setState("resting", "🌿 Resting", "Start");
    clock.textContent = formatDuration(now - last.end);
    sub.textContent = `${formatDuration(now - last.start)} since the last one began`;
  } else {
    setState("idle", "Ready when you are", "Start");
    clock.textContent = "0:00";
    sub.textContent = "\u00a0";
  }

  const s = windowStats(data.contractions, now, undefined, data.breaks);
  $("stat-count").textContent = String(s.count);
  const m = ruleMeters(data.contractions, now, data.rule, data.breaks);
  $("d-apart").textContent = data.rule.split("-")[0];
  setMeter("apart", m.apart, (v) => `avg ${formatDuration(v)}`);
  setMeter("length", m.length, (v) => `avg ${formatDuration(v)}`);
  setMeter("hour", m.hour, (v) => `${Math.floor(v / MINUTE)} of 60 min`, true);

  rule.className = m.met ? "rule go" : "rule";
  if (m.met) {
    rule.textContent = `Contractions have matched ${data.rule} for a full hour. Consider calling your midwife or hospital.`;
  } else if (s.count < 3) {
    rule.textContent = "Keep timing. A few more contractions will show your pattern.";
  } else if (m.apart.ok && m.length.ok) {
    rule.textContent = `Matching ${data.rule}. Keep going until all three are ticked.`;
  } else {
    rule.textContent = `Not at ${data.rule} yet. Keep going, you're doing great.`;
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
        const t = document.createElement("div");
        t.className = "t";
        t.textContent =
          c.end === null
            ? `${time(c.start)} · in progress`
            : `${time(c.start)} · ${formatDuration(c.end - c.start)}`;
        const m = document.createElement("div");
        m.className = "m";
        m.textContent = gap === null ? "first" : `${formatDuration(gap)} after the previous began`;
        when.append(t, m);
        const del = document.createElement("button");
        del.className = "del";
        del.type = "button";
        del.textContent = "✕";
        del.setAttribute("aria-label", `Delete contraction at ${time(c.start)}`);
        del.addEventListener("click", () => remove(c));
        li.append(when, del);
        return li;
      })
      .reverse(),
  );
}

function remove(c: Contraction) {
  if (c.end === null) void holdScreen(false);
  data.contractions = data.contractions.filter((x) => x.id !== c.id);
  save();
  render();
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
  if (data.contractions.length && confirm("Delete all contractions? This cannot be undone.")) {
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

initViews();
initTips();
render();
setInterval(tick, 1000);
if (activeContraction()) void holdScreen(true);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
