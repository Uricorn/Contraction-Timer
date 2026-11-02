import "./style.css";
import { initTips } from "./tips";
import { initViews } from "./views";
import { initChecklist } from "./checklist";
import { initNotes } from "./notes";
import { getLocale, initI18n, t } from "./i18n";
import { alertsEnabled, disableAlerts, enableAlerts, notify } from "./alerts";
import { drawTrend } from "./chart";
import { openEditor } from "./editor";
import { downloadJson, summaryText } from "./share";
import { showToast } from "./toast";
import {
  formatDuration,
  parseStored,
  RULES,
  dangerSigns,
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

/** Last seen alert conditions, so a notification fires once when one turns on. */
let prevAlert: { met: boolean; long: boolean; frequent: boolean } | null = null;

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

  const danger = dangerSigns(data.contractions, now);
  const dangerBox = $("danger");
  const warnings = [
    danger.long && t("A contraction has lasted over 2 minutes. Call your midwife or hospital."),
    danger.frequent && t("6 or more contractions in 10 minutes. Call your midwife or hospital."),
  ].filter((w): w is string => !!w);
  dangerBox.hidden = warnings.length === 0;
  dangerBox.textContent = warnings.join(" ");
  const metText = t(
    "Contractions have matched {rule} for a full hour. It may be time to head to the hospital or birth centre. Call ahead to let them know you are coming.",
    { rule: data.rule },
  );
  if (prevAlert) {
    if (m.met && !prevAlert.met) void notify(t("Contraction Timer"), metText);
    if (danger.long && !prevAlert.long) void notify(t("Contraction Timer"), warnings[0]);
    else if (danger.frequent && !prevAlert.frequent)
      void notify(t("Contraction Timer"), warnings.at(-1) ?? "");
  }
  prevAlert = { met: m.met, ...danger };

  rule.className = m.met ? "rule go" : "rule";
  if (m.met) {
    rule.textContent = metText;
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
        const when = document.createElement("button");
        when.type = "button";
        when.className = "row-main";
        when.addEventListener("click", () => edit(c));
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
        if (c.pain || c.note) {
          const extra = document.createElement("div");
          extra.className = "m";
          extra.textContent = [c.pain ? t("pain {n}/5", { n: c.pain }) : "", c.note ?? ""]
            .filter(Boolean)
            .join(" · ");
          when.append(extra);
        }
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
  renderHistoryExtras();
}

const watersNote = $("waters-note");
function renderHistoryExtras() {
  watersNote.hidden = data.watersBroke === null;
  if (data.watersBroke !== null) {
    watersNote.textContent = t("Waters broke at {time}", { time: time(data.watersBroke) });
  }
  const goal = Number(data.rule.split("-")[0]);
  const svg = $("trend-svg") as unknown as SVGSVGElement;
  const bars = drawTrend(svg, data.contractions, data.breaks, goal);
  $("trend").hidden = bars === 0;
  svg.setAttribute("aria-label", t("Minutes between contractions"));
  $("trend-cap").textContent = t("Gaps between contractions (dashed line = {n} min goal)", {
    n: goal,
  });
}

function edit(c: Contraction | null) {
  openEditor(c, {
    onSave: (next) => {
      const i = data.contractions.findIndex((x) => x.id === next.id);
      if (i >= 0) data.contractions[i] = next;
      else data.contractions.push(next);
      save();
      render();
    },
    onDelete: remove,
  });
}

function remove(c: Contraction) {
  data.contractions = data.contractions.filter((x) => x.id !== c.id);
  if (c.end === null) void holdScreen(false);
  save();
  render();
  showToast(t("Contraction deleted"), {
    label: t("Undo"),
    run: () => {
      if (!data.contractions.some((x) => x.id === c.id)) data.contractions.push(c);
      save();
      render();
    },
  });
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

$("add-missed").addEventListener("click", () => edit(null));

$("waters").addEventListener("click", () => {
  data.watersBroke = Date.now();
  save();
  render();
});

$("share").addEventListener("click", async () => {
  const text = summaryText(data, Date.now(), t, getLocale());
  try {
    if (navigator.share) await navigator.share({ title: t("Contraction Timer"), text });
    else {
      await navigator.clipboard.writeText(text);
      showToast(t("Copied to clipboard"));
    }
  } catch {
    /* share cancelled */
  }
});

$("backup").addEventListener("click", () => downloadJson(data));

const restoreFile = $<HTMLInputElement>("restore-file");
$("restore").addEventListener("click", () => restoreFile.click());
restoreFile.addEventListener("change", async () => {
  const file = restoreFile.files?.[0];
  restoreFile.value = "";
  if (!file) return;
  const text = await file.text();
  let valid = false;
  try {
    const raw: unknown = JSON.parse(text);
    valid =
      Array.isArray(raw) || (typeof raw === "object" && raw !== null && "contractions" in raw);
  } catch {
    /* not JSON */
  }
  if (!valid) {
    showToast(t("That file is not a valid backup"));
    return;
  }
  const restored = parseStored(text);
  if (!confirm(t("Replace your current timing with this backup?"))) return;
  data = restored;
  save();
  render();
  showToast(t("Backup restored"));
});

// Alerts opt-in (local, silent notifications only).
const alertsBox = $<HTMLInputElement>("alerts");
const alertsNote = $("alerts-note");
alertsBox.checked = alertsEnabled();
alertsBox.addEventListener("change", async () => {
  alertsNote.hidden = true;
  if (alertsBox.checked) {
    alertsBox.checked = await enableAlerts();
    if (!alertsBox.checked) {
      alertsNote.textContent = t(
        "Notifications are blocked. Allow them in your browser or phone settings.",
      );
      alertsNote.hidden = false;
    }
  } else disableAlerts();
});

// First-run welcome card.
const WELCOME_KEY = "contraction-timer:welcome";
const welcome = $("welcome");
try {
  welcome.hidden = localStorage.getItem(WELCOME_KEY) === "1";
} catch {
  welcome.hidden = true;
}
$("welcome-ok").addEventListener("click", () => {
  welcome.hidden = true;
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* ignore */
  }
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
