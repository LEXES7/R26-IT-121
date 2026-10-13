import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { LiveAlert } from "../api/monitor";
import { account, money, score } from "./format";

/**
 * Alert notifications, raised on the device from what the monitor reports.
 *
 * These are local notifications: the app polls the monitor and posts one for
 * each new HIGH or CRITICAL verdict. They work in Expo Go and in a release
 * build alike, but only while the app is running. Delivery to a phone that is
 * asleep needs server push, which needs an EAS build with a project ID and a
 * sender on the backend, and is not claimed here.
 */

const CHANNEL = "alerts";

/** MEDIUM is a band the system will not commit on; it is not worth a buzz. */
export const NOTIFY_SEVERITIES = new Set(["CRITICAL", "HIGH"]);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Ask once. Returns whether notifications may be shown. */
export async function enableNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Fraud alerts",
        description: "HIGH and CRITICAL verdicts from the live monitor",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        lightColor: "#ef4444",
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function notifyAlert(alert: LiveAlert): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${alert.severity} · ${money(alert.amount)}`,
        body:
          `${account(alert.from)} → ${account(alert.to)} · fused ${score(alert.fused_score)}` +
          (alert.pattern && alert.pattern !== "UNKNOWN"
            ? ` · ${alert.pattern.replace(/_/g, " ").toLowerCase()}`
            : ""),
        data: { transaction_id: alert.transaction_id },
        ...(Platform.OS === "android" ? { color: "#ef4444" } : {}),
      },
      trigger: Platform.OS === "android" ? { channelId: CHANNEL } : null,
    });
  } catch {
    // A notification that cannot be shown must never break the feed.
  }
}

/** Called with the transaction a tapped notification was about. */
export function onNotificationTap(fn: (transactionId: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = response.notification.request.content.data?.transaction_id;
    if (typeof id === "string") fn(id);
  });
  return () => sub.remove();
}
