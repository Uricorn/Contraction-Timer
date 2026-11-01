/** Hospital notes tab: answers to questions staff ask, with fill-in spots. */
import { isArrayOf, load, save } from "./store";

type Field = { id: string; label: string; hint: string; value: string; long?: boolean };

const KEY = "contraction-timer:notes:v2";
const OLD_KEY = "contraction-timer:notes:v1";

const LONG = [
  "Birth preferences",
  "Pain relief wishes",
  "Medical conditions",
  "Problems this pregnancy",
  "Newborn choices",
  "Companions allowed in the delivery room",
];

const DEFAULTS: Field[] = [
  ["Full name", ""],
  ["ID number", ""],
  ["Date of birth", ""],
  ["Health fund and member number", ""],
  ["Due date and weeks pregnant", "e.g. 14 Nov, 39 weeks"],
  ["Doctor or midwife", "name and phone"],
  ["Contractions started", "time they began"],
  ["Waters broken?", "time, and colour (clear is normal)"],
  ["Baby's movements", "normal, or less than usual"],
  ["Any bleeding?", ""],
  ["Last ate or drank", "time and what"],
  ["Previous births", "how many, how they went, any caesarean"],
  ["Problems this pregnancy", "e.g. diabetes, blood pressure, low placenta"],
  ["Allergies", "medicines, latex, food"],
  ["Medicines and supplements", ""],
  ["Medical conditions and past surgeries", ""],
  ["Blood type", ""],
  ["Group B strep result", "positive, negative or unknown"],
  [
    "Companions allowed in the delivery room",
    "names, ID numbers, relationship (hospitals limit how many)",
  ],
  ["Pain relief wishes", "e.g. natural, epidural, open to options"],
  ["Birth preferences", "e.g. movement, music, delayed cord clamping"],
  [
    "Newborn choices",
    "first bath, delayed cord clamping, vitamin K, vaccines, cord blood, rooming-in",
  ],
  ["Feeding plan", "breast, bottle, not sure"],
  ["Emergency contact", "name and phone"],
].map(([label, hint], i) => ({
  id: `d${i}`,
  label,
  hint,
  value: "",
  long: LONG.includes(label),
}));

const valid = isArrayOf<Field>(
  (r) => typeof r.id === "string" && typeof r.label === "string" && typeof r.value === "string",
);

/** First run of v2: keep anything typed in v1, drop the retired field, add new defaults. */
function migrate(): Field[] {
  const typed = load<Field[]>(OLD_KEY, () => [], valid).filter(
    (f) => f.value && f.label !== "Baby's name ideas",
  );
  const merged = structuredClone(DEFAULTS).map((d) => typed.find((f) => f.label === d.label) ?? d);
  return merged.concat(typed.filter((f) => !DEFAULTS.some((d) => d.label === f.label)));
}

export function initNotes(): void {
  const host = document.getElementById("notes-list") as HTMLElement;
  const form = document.getElementById("notes-form") as HTMLFormElement;
  const input = document.getElementById("notes-input") as HTMLInputElement;
  let fields = load(KEY, migrate, valid);
  // Keep placeholder hints current for default questions (answers are untouched).
  for (const f of fields) f.hint = DEFAULTS.find((d) => d.label === f.label)?.hint ?? f.hint;

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
