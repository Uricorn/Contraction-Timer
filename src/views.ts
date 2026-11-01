/** Bottom tab navigation between Timer / Tips / History. */

const views = ["timer", "tips", "list", "notes", "history"] as const;
export type View = (typeof views)[number];

export function showView(name: View): void {
  for (const v of views) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.hidden = v !== name;
  }
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => {
    if (b.dataset.view === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0 });
  const shown = document.getElementById(`view-${name}`);
  shown?.setAttribute("tabindex", "-1");
  shown?.focus({ preventScroll: true });
  document.dispatchEvent(new CustomEvent("viewchange", { detail: name }));
}

export function initViews(): void {
  document
    .querySelectorAll<HTMLElement>("[data-view],[data-goto]")
    .forEach((el) =>
      el.addEventListener("click", () => showView((el.dataset.view ?? el.dataset.goto) as View)),
    );
}
