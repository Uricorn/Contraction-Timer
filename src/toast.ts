/** A short-lived message at the bottom of the screen, with an optional action button. */
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, action?: { label: string; run: () => void }): void {
  document.querySelector(".toast")?.remove();
  clearTimeout(timer);
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  const msg = document.createElement("span");
  msg.textContent = message;
  toast.append(msg);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      action.run();
      toast.remove();
    });
    toast.append(btn);
  }
  document.body.append(toast);
  timer = setTimeout(() => toast.remove(), 8000);
}
