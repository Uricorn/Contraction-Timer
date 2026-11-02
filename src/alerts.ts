/**
 * Local, silent notifications. Nothing leaves the device: on Android they use
 * the Capacitor local-notifications plugin (low-importance channel, so no
 * sound); on the web they use the Notification API with `silent: true`.
 * They fire while the app is running; a fully closed app cannot notify.
 */
import { Capacitor } from "@capacitor/core";

const KEY = "contraction-timer:alerts";
const CHANNEL = "alerts";

const native = () => Capacitor.isNativePlatform();

export const alertsEnabled = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

const remember = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
};

/** Ask for permission and switch alerts on. Resolves to false if denied or unsupported. */
export async function enableAlerts(): Promise<boolean> {
  let granted = false;
  if (native()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    granted = (await LocalNotifications.requestPermissions()).display === "granted";
    if (granted) {
      // Importance 2 (low) = shown in the shade without any sound.
      await LocalNotifications.createChannel({
        id: CHANNEL,
        name: "Contraction alerts",
        importance: 2,
        vibration: true,
      });
    }
  } else if ("Notification" in window) {
    granted = (await Notification.requestPermission()) === "granted";
  }
  remember(granted);
  return granted;
}

export function disableAlerts(): void {
  remember(false);
}

export async function notify(title: string, body: string): Promise<void> {
  if (!alertsEnabled()) return;
  try {
    if (native()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          { id: Math.floor(Date.now() % 2_000_000_000), title, body, channelId: CHANNEL },
        ],
      });
    } else if ("Notification" in window && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration();
      const options = { body, silent: true, icon: "icon-192.png" };
      if (reg) await reg.showNotification(title, options);
      else new Notification(title, options);
    }
  } catch {
    /* notifications unavailable: the on-screen banner still shows */
  }
}
