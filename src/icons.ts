/** Line icons (24x24, stroked with currentColor) used instead of emoji. */
const svg = (body: string) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  contracting: svg(
    '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8" stroke-opacity=".55"/>',
  ),
  paused: svg('<path d="M7 18.5a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a5 5 0 0 1 .5 10z"/>'),
  resting: svg('<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z"/><path d="M5 19 13 11"/>'),
} as const;
