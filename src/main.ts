import "./style.css";
import {
  fiveOneOne,
  formatDuration,
  sortByStart,
  toCsv,
  windowStats,
  parseStored,
  type Contraction,
} from "./logic";

const KEY = "contraction-timer:v1";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

let items: Contraction[] = parseStored(localStorage.getItem(KEY));

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked: keep running in memory */
  }
};

const active = () => items.find((c) => c.end === null);
const latest = () => sortByStart(items).at(-1);

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
  const current = active();
  if (current) {
    current.end = now;
    void holdScreen(false);
  } else {
    items.push({ id: crypto.randomUUID(), start: now, end: null });
    void holdScreen(true);
  }
  save();
  render();
  navigator.vibrate?.(30);
}

const clock = $("clock");
const label = $("state-label");
const sub = $("clock-sub");
const button = $<HTMLButtonElement>("toggle");
const list = $("list");
const empty = $("empty");
const rule = $("rule");
const time = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Cheap per-second update: clock, label and stats. */
function tick() {
  const now = Date.now();
  const cur = active();
  const last = latest();
  if (cur) {
    document.body.dataset.state = "contracting";
    label.textContent = "Contraction";
    clock.textContent = formatDuration(now - cur.start);
    const prev = sortByStart(items)
      .filter((c) => c !== cur)
      .at(-1);
    sub.textContent = prev
      ? `${formatDuration(cur.start - prev.start)} since the previous started`
      : "\u00a0";
    button.textContent = "Stop";
  } else if (last && last.end !== null) {
    document.body.dataset.state = "resting";
    label.textContent = "Resting";
    clock.textContent = formatDuration(now - last.end);
    sub.textContent = `${formatDuration(now - last.start)} since last started`;
    button.textContent = "Start contraction";
  } else {
    document.body.dataset.state = "idle";
    label.textContent = "Ready";
    clock.textContent = "0:00";
    sub.textContent = "\u00a0";
    button.textContent = "Start contraction";
  }

  const s = windowStats(items, now);
  $("stat-count").textContent = String(s.count || "–");
  $("stat-duration").textContent = s.avgDuration === null ? "–" : formatDuration(s.avgDuration);
  $("stat-interval").textContent = s.avgInterval === null ? "–" : formatDuration(s.avgInterval);

  const r = fiveOneOne(items, now);
  rule.hidden = !(r.met || r.progress > 0);
  rule.textContent = r.met
    ? "Contractions have been about 5 minutes apart and 1 minute long for an hour (the 5-1-1 guideline). Consider calling your midwife or hospital."
    : `Pattern is nearing 5-1-1: ${Math.round(r.progress * 100)}% of an hour so far.`;
}

/** Heavier rebuild of the history list, only when data changes. */
function renderList() {
  const rows = sortByStart(items).reverse();
  empty.hidden = rows.length > 0;
  const all = sortByStart(items);
  list.replaceChildren(
    ...rows.map((c) => {
      const idx = all.indexOf(c);
      const gap = idx > 0 ? c.start - all[idx - 1].start : null;
      const li = document.createElement("li");
      const when = document.createElement("div");
      when.innerHTML = '<div class="t"></div><div class="m"></div>';
      when.children[0].textContent =
        c.end === null
          ? `${time(c.start)} · in progress`
          : `${time(c.start)} · ${formatDuration(c.end - c.start)}`;
      when.children[1].textContent =
        gap === null ? "first" : `${formatDuration(gap)} after previous`;
      const del = document.createElement("button");
      del.className = "del";
      del.type = "button";
      del.textContent = "✕";
      del.setAttribute("aria-label", `Delete contraction at ${time(c.start)}`);
      del.addEventListener("click", () => {
        items = items.filter((x) => x.id !== c.id);
        save();
        render();
      });
      li.append(when, document.createElement("span"), del);
      return li;
    }),
  );
}

function render() {
  renderList();
  tick();
}

button.addEventListener("click", toggle);

$("clear").addEventListener("click", () => {
  if (items.length && confirm("Delete all contractions? This cannot be undone.")) {
    items = [];
    save();
    void holdScreen(false);
    render();
  }
});

$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([toCsv(items)], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "contractions.csv" });
  a.click();
  URL.revokeObjectURL(url);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    tick();
    if (active()) void holdScreen(true);
  }
});

render();
setInterval(tick, 1000);
if (active()) void holdScreen(true);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
