/** Tips view: breathing pacer and encouraging phrases. */

const PHRASES = [
  "You are doing it. I am right here.",
  "Every contraction brings you closer to meeting your baby.",
  "Let your shoulders drop. Breathe out slowly.",
  "You are stronger than you know.",
  "One at a time. Just this one.",
  "This one will pass, and you have handled every one so far.",
  "I'm not going anywhere. I've got you.",
  "You're doing so well. I'm so proud of you.",
  "Rest now. Let your body go soft between them.",
];

const IN_MS = 4000;
const OUT_MS = 6000;

export function initTips(): void {
  const phrase = document.getElementById("phrase") as HTMLElement;
  let last = 0;
  document.getElementById("phrase-btn")?.addEventListener("click", () => {
    let next = last;
    while (next === last) next = Math.floor(Math.random() * PHRASES.length);
    last = next;
    phrase.textContent = PHRASES[next];
  });

  const pacer = document.getElementById("pacer") as HTMLElement;
  const text = document.getElementById("pacer-text") as HTMLElement;
  const btn = document.getElementById("pacer-btn") as HTMLButtonElement;
  let timer: number | undefined;

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    pacer.classList.remove("in");
    text.textContent = "Ready";
    btn.textContent = "Start breathing guide";
  };

  const phase = (breatheIn: boolean) => {
    pacer.style.setProperty("--dur", `${breatheIn ? IN_MS : OUT_MS}ms`);
    pacer.classList.toggle("in", breatheIn);
    text.textContent = breatheIn ? "Breathe in" : "Slowly out";
    timer = window.setTimeout(() => phase(!breatheIn), breatheIn ? IN_MS : OUT_MS);
  };

  btn.addEventListener("click", () => {
    if (timer === undefined) {
      btn.textContent = "Stop";
      phase(true);
    } else {
      stop();
    }
  });

  // Stop the pacer when leaving the Tips view so it doesn't run unseen.
  document.addEventListener("viewchange", (e) => {
    if ((e as CustomEvent<string>).detail !== "tips") stop();
  });
}
