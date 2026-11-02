/** A small bar chart of the gaps between contractions, with the guideline as a dashed line. */
import { intervals, MINUTE, sortByStart, type Break, type Contraction } from "./logic";

const NS = "http://www.w3.org/2000/svg";
const W = 300;
const H = 100;
const MAX_BARS = 24;

const el = (name: string, attrs: Record<string, string | number>): SVGElement => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** Returns the number of bars drawn (0 = not enough data, svg left empty). */
export function drawTrend(
  svg: SVGSVGElement,
  list: Contraction[],
  breaks: Break[],
  goalMin: number,
): number {
  const gaps = intervals(sortByStart(list), breaks)
    .slice(-MAX_BARS)
    .map((g) => g / MINUTE);
  svg.replaceChildren();
  if (gaps.length === 0) return 0;
  const top = goalMin * 3; // longer gaps are clamped so one outlier does not flatten the rest
  const bw = W / MAX_BARS;
  gaps.forEach((g, i) => {
    const h = Math.max(2, (Math.min(g, top) / top) * H);
    svg.append(
      el("rect", {
        x: i * bw + 1,
        y: H - h,
        width: bw - 2,
        height: h,
        rx: 2,
        fill: "var(--accent)",
        opacity: g <= goalMin ? 1 : 0.45,
      }),
    );
  });
  const y = H - (goalMin / top) * H;
  svg.append(
    el("line", {
      x1: 0,
      x2: W,
      y1: y,
      y2: y,
      stroke: "var(--ink)",
      "stroke-dasharray": "4 3",
      "stroke-width": 1,
    }),
  );
  return gaps.length;
}
