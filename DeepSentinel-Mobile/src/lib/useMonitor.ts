import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { alertKey, getMonitorState, type MonitorState } from "../api/monitor";
import { NOTIFY_SEVERITIES, notifyAlert } from "./notify";

/**
 * The live monitor, polled once for the whole app.
 *
 * Held at the top rather than in the Live tab so that an alert raises a
 * notification whichever tab is open. Polling pauses while the app is in the
 * background: the OS suspends it there anyway, and the session lock takes
 * over after a minute.
 *
 * The first answer only marks what is already on the board as seen. Opening
 * the app should show the alerts, not announce twenty of them at once.
 */

const POLL_MS = 5_000;

export function useMonitor(active: boolean, notify: boolean) {
  const [state, setState] = useState<MonitorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!active) {
      seen.current = null;
      setState(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (AppState.currentState === "active") {
        try {
          const next = await getMonitorState();
          if (cancelled) return;
          const keys = next.alerts.map(alertKey);
          if (seen.current === null) {
            seen.current = new Set(keys);
          } else {
            // Oldest first, so the notification shade reads in the order they fired.
            const fresh = next.alerts.filter((a) => !seen.current!.has(alertKey(a))).reverse();
            for (const a of fresh) {
              seen.current.add(alertKey(a));
              if (notifyRef.current && NOTIFY_SEVERITIES.has(a.severity)) await notifyAlert(a);
            }
          }
          setState(next);
          setError(null);
        } catch (err) {
          if (!cancelled) setError((err as Error).message);
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active]);

  return { state, error };
}
