/** Plain-text summary for sharing, and JSON backup helpers. */
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { formatDuration, sortByStart, windowStats, HOUR, type Data } from "./logic";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function summaryText(data: Data, now: number, t: Translate, locale: string): string {
  const time = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const rows = sortByStart(data.contractions);
  const lines = [t("Contraction summary")];
  if (rows.length === 0) return `${lines[0]}\n${t("No contractions recorded yet")}`;
  const s = windowStats(data.contractions, now, HOUR, data.breaks);
  if (s.avgInterval !== null && s.avgDuration !== null) {
    lines.push(
      t("{count} contractions in the last hour, about {gap} apart, about {len} long.", {
        count: s.count,
        gap: formatDuration(s.avgInterval),
        len: formatDuration(s.avgDuration),
      }),
    );
  }
  if (data.watersBroke !== null) {
    lines.push(t("Waters broke at {time}", { time: time(data.watersBroke) }));
  }
  lines.push("");
  for (const c of rows.slice(-30)) {
    const parts = [time(c.start), c.end === null ? "…" : formatDuration(c.end - c.start)];
    if (c.note) parts.push(c.note);
    lines.push(parts.join(" · "));
  }
  return lines.join("\n");
}

/** Save a text file: share sheet inside the Android app (WebView ignores downloads), download elsewhere. */
export async function saveFile(name: string, type: string, content: string): Promise<void> {
  const file = new File([content], name, { type });
  if (Capacitor.isNativePlatform()) {
    try {
      const written = await Filesystem.writeFile({
        path: name,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: name, url: written.uri, dialogTitle: name });
    } catch (e) {
      // User dismissing the sheet is fine; any other failure must not be silent.
      const msg = String((e as { message?: string })?.message ?? e);
      if (!/cancel/i.test(msg)) alert(`Could not save ${name}: ${msg}`);
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadJson(data: Data & { extras?: Record<string, unknown> }): Promise<void> {
  return saveFile("contractions-backup.json", "application/json", JSON.stringify(data, null, 2));
}
