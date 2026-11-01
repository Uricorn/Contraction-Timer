/** Hospital notes tab: answers to questions staff ask, with fill-in spots. */
import { isArrayOf, load, save } from "./store";

type Field = { id: string; label: string; hint: string; value: string; long?: boolean };

const KEY = "contraction-timer:notes:v1";

const DEFAULTS: Field[] = [
  ["Full name", ""],
  ["Date of birth", ""],
  ["Due date and weeks pregnant", "e.g. 14 Nov, 39 weeks"],
  ["Doctor or midwife", "name and phone"],
  ["Contractions started", "time they began"],
  ["Waters broken?", "time, and colour (clear is normal)"],
  ["Baby's movements", "normal, or less than usual"],
  ["Any bleeding?", ""],
  ["Last ate or drank", "time and what"],
  ["Previous births", "how many, how they went"],
  ["Allergies", "medicines, latex, food"],
  ["Medicines and supplements", ""],
  ["Medical conditions", "e.g. diabetes, blood pressure"],
  ["Blood type", ""],
  ["Group B strep result", "positive, negative or unknown"],
  ["Pain relief wishes", "what you want to try first"],
  ["Birth preferences", "e.g. movement, who is present, delayed cord clamping"],
  ["Feeding plan", "breast, bottle, not sure"],
  ["Emergency contact", "name and phone"],
  ["Baby's name ideas", ""],
].map(([label, hint], i) => ({
  id: `d${i}`,
  label,
  hint,
  value: "",
  long: ["Birth preferences", "Pain relief wishes", "Medical conditions"].includes(label),
}));

const valid = isArrayOf<Field>(
  (r) => typeof r.id === "string" && typeof r.label === "string" && typeof r.value === "string",
);

export function initNotes(): void {
  const host = document.getElementById("notes-list") as HTMLElement;
  const form = document.getElementById("notes-form") as HTMLFormElement;
  const input = document.getElementById("notes-input") as HTMLInputElement;
  let fields = load(KEY, () => structuredClone(DEFAULTS), valid);

  const render = () =>
    host.replaceChildren(
      ...fields.map((f) => {
        const wrap = document.createElement("div");
        wrap.className = "field";
        const head = document.createElement("div");
        head.className = "field-head";
        const label = document.createElement("label");
        label.textContent = f.label;
        const id = `note-${f.id}`;
        label.htmlFor = id;
        const del = document.createElement("button");
        del.type = "button";
        del.className = "del";
        del.textContent = "✕";
        del.setAttribute("aria-label", `Delete ${f.label}`);
        del.addEventListener("click", () => {
          fields = fields.filter((x) => x.id !== f.id);
          save(KEY, fields);
          render();
        });
        head.append(label, del);
        const el = f.long ? document.createElement("textarea") : document.createElement("input");
        el.id = id;
        el.value = f.value;
        el.placeholder = f.hint ?? "";
        if (el instanceof HTMLTextAreaElement) el.rows = 3;
        el.addEventListener("input", () => {
          f.value = el.value;
          save(KEY, fields);
        });
        wrap.append(head, el);
        return wrap;
      }),
    );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const label = input.value.trim();
    if (!label) return;
    fields.push({ id: crypto.randomUUID(), label, hint: "", value: "", long: true });
    input.value = "";
    save(KEY, fields);
    render();
  });

  document.getElementById("notes-reset")?.addEventListener("click", () => {
    if (confirm("Restore the default questions? Your answers will be cleared.")) {
      fields = structuredClone(DEFAULTS);
      save(KEY, fields);
      render();
    }
  });

  render();
}
