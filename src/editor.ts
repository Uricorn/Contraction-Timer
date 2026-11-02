/** Edit / add dialog for a single contraction. */
import type { Contraction } from "./logic";

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e as T;
};

/** Epoch ms -> value for <input type="datetime-local"> in local time. */
export const toLocalInput = (ms: number): string =>
  new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export interface EditorHandlers {
  onSave: (c: Contraction) => void;
  onDelete: (c: Contraction) => void;
}

export function openEditor(existing: Contraction | null, h: EditorHandlers): void {
  const dialog = $<HTMLDialogElement>("editor");
  const form = $<HTMLFormElement>("editor-form");
  const start = $<HTMLInputElement>("ed-start");
  const end = $<HTMLInputElement>("ed-end");
  const pain = $<HTMLSelectElement>("ed-pain");
  const note = $<HTMLTextAreaElement>("ed-note");
  const del = $<HTMLButtonElement>("ed-delete");
  const error = $("ed-error");

  const now = Date.now();
  const base: Contraction = existing ?? { id: crypto.randomUUID(), start: now - 60_000, end: now };
  const startVal = toLocalInput(base.start);
  const endVal = base.end === null ? "" : toLocalInput(base.end);
  start.value = startVal;
  end.value = endVal;
  end.required = base.end !== null;
  pain.value = base.pain ? String(base.pain) : "";
  note.value = base.note ?? "";
  del.hidden = !existing;
  error.hidden = true;

  // Only overwrite a time the user actually changed, so seconds are not lost.
  const pick = (input: HTMLInputElement, original: string, ms: number | null) =>
    input.value === original ? ms : input.value ? new Date(input.value).getTime() : null;

  form.onsubmit = (e) => {
    e.preventDefault();
    const s = pick(start, startVal, base.start);
    const en = pick(end, endVal, base.end);
    if (s === null || Number.isNaN(s) || (en !== null && (Number.isNaN(en) || en < s))) {
      error.hidden = false;
      return;
    }
    const out: Contraction = { id: base.id, start: s, end: en };
    if (pain.value) out.pain = Number(pain.value);
    if (note.value.trim()) out.note = note.value.trim().slice(0, 200);
    dialog.close();
    h.onSave(out);
  };
  del.onclick = () => {
    dialog.close();
    h.onDelete(base);
  };
  $("ed-cancel").onclick = () => dialog.close();
  dialog.showModal();
}
