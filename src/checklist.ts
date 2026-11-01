/** Checklist tab: default items users can tick, delete, and add to. */
import { isArrayOf, load, save } from "./store";

type Item = { id: string; text: string; done: boolean };

const KEY = "contraction-timer:checklist:v1";

const DEFAULTS = [
  "ID and insurance or health card",
  "Birth plan / preferences (a few copies)",
  "Phone and charger (long cable)",
  "Comfy loose clothes or nightdress",
  "Dressing gown and slippers",
  "Socks and a warm layer",
  "Toiletries, lip balm, hair ties",
  "Snacks and drinks for you both",
  "Maternity pads",
  "Nursing bra",
  "Going-home outfit for you",
  "Baby clothes, hat and blanket",
  "Newborn nappies",
  "Car seat installed",
  "Pillow from home",
  "Partner: change of clothes, snacks, charger",
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
