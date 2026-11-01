/** Checklist tab: default items users can tick, delete, and add to. */
import { isArrayOf, load, save } from "./store";

type Item = { id: string; text: string; done: boolean };

const KEY = "contraction-timer:checklist:v2";

const DEFAULTS = [
  // Documents
  "ID for you and your partner",
  "Pregnancy tracking card, complete and in order",
  "Folder with pregnancy test results and scans",
  "Health fund / insurance card and any forms the hospital needs",
  "Birth plan (a few copies)",
  // Medicines
  "Medicines you take regularly, with doses",
  "Any medicines or supplements your doctor said to bring",
  "List of drug allergies",
  // Arrangements
  "Babysitter or family lined up for other children",
  "Pet sitter or someone to feed and walk pets",
  "Car fuelled, route to hospital known, car seat installed",
  "Phone numbers saved: midwife, hospital, partner, family",
  // Labour bag
  "Phone, long charger, headphones or speaker",
  "Pillow and spare pillowcase",
  "Towel or robe",
  "Warm socks for you and your partner",
  "Flip-flops for the shower",
  "Bags for dirty clothes",
  "Toiletries, toothbrush, hair ties, lip balm, wipes",
  "Water bottle with a straw",
  "Light snacks: dates, nuts, fruit, crackers",
  "Comfort items: small lamp, fan, heat pack, massage ball, playlist",
  "Partner: change of clothes, snacks, charger",
  "Partner: zip-up hoodie or button shirt for skin-to-skin",
  // Hospital stay bag
  "Loose comfy clothes and slippers",
  "Absorbent underwear or pads",
  "Nursing bra and breast pads",
  "Going-home outfit for you",
  "Baby going-home outfit: two layers, hat, blanket, cloth nappy",
  "Newborn nappies and wipes",
  "Leave valuables and jewellery at home",
].map((text, i) => ({ id: `d${i}`, text, done: false }));

const valid = isArrayOf<Item>(
  (r) => typeof r.id === "string" && typeof r.text === "string" && typeof r.done === "boolean",
);

export function initChecklist(): void {
  const list = document.getElementById("check-list") as HTMLElement;
  const count = document.getElementById("check-count") as HTMLElement;
  const form = document.getElementById("check-form") as HTMLFormElement;
  const input = document.getElementById("check-input") as HTMLInputElement;
  let items = load(KEY, () => structuredClone(DEFAULTS), valid);

  const render = () => {
    count.textContent = `${items.filter((i) => i.done).length} of ${items.length} packed`;
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement("li");
        li.className = item.done ? "done" : "";
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = item.done;
        box.addEventListener("change", () => {
          item.done = box.checked;
          save(KEY, items);
          render();
        });
        const text = document.createElement("span");
        text.textContent = item.text;
        label.append(box, text);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "del";
        del.textContent = "✕";
        del.setAttribute("aria-label", `Delete ${item.text}`);
        del.addEventListener("click", () => {
          items = items.filter((i) => i.id !== item.id);
          save(KEY, items);
          render();
        });
        li.append(label, del);
        return li;
      }),
    );
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    items.push({ id: crypto.randomUUID(), text, done: false });
    input.value = "";
    save(KEY, items);
    render();
  });

  document.getElementById("check-untick")?.addEventListener("click", () => {
    items.forEach((i) => (i.done = false));
    save(KEY, items);
    render();
  });

  document.getElementById("check-reset")?.addEventListener("click", () => {
    if (confirm("Restore the default list? Your own items will be removed.")) {
      items = structuredClone(DEFAULTS);
      save(KEY, items);
      render();
    }
  });

  render();
}
