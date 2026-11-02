/** Tiny localStorage helpers for the editable lists (checklist, hospital notes). */

export function load<T>(key: string, fallback: () => T, valid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v: unknown = JSON.parse(raw);
      if (valid(v)) return v;
    }
  } catch {
    /* corrupt or blocked storage: use defaults */
  }
  return fallback();
}

/** Fires "savefail" on the document when storage is full or blocked. */
export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    document.dispatchEvent(new CustomEvent("savefail"));
  }
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export const isArrayOf =
  <T>(shape: (r: Record<string, unknown>) => boolean) =>
  (v: unknown): v is T[] =>
    Array.isArray(v) && v.every((r) => isRec(r) && shape(r));
