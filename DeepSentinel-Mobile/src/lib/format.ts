/** Formatting shared by every screen, so a number never reads two ways. */

/**
 * Money, grouped and always to two decimals.
 *
 * Currency is deliberately absent: PaySim carries none, and inventing a symbol
 * would assert something the data does not say.
 */
export function money(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Scores to three decimals — the precision the fusion engine reports. */
export function score(value: number | null | undefined, places = 3): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(places);
}

export function percent(value: number | null | undefined, places = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(places)}%`;
}

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * "2h ago" is more useful on a list than a timestamp, and the exact time is a
 * tap away. Timestamps arrive UTC-aware from the backend, which takes care of
 * them being read as local time by mistake.
 */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";

  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d ago`;
  return new Date(then).toLocaleDateString();
}

/**
 * Shorten an account identifier for a cramped row.
 *
 * Keeps both ends: C1231006815 and C1231007811 differ at the end, so trimming
 * only the tail would make two different accounts look identical.
 */
export function account(id: string | null | undefined, keep = 5): string {
  if (!id) return "—";
  if (id.length <= keep * 2 + 1) return id;
  return `${id.slice(0, keep)}…${id.slice(-keep)}`;
}

/** Feature and dimension names as the model emits them, made readable. */
export function readable(name: string): string {
  return name
    .replace(/^F\d+_/, "")
    .replace(/^dim_/, "dimension ")
    .replace(/_/g, " ");
}
