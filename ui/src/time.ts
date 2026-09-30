/**
 * How long ago an ISO time was, the way the reference phrases it: "just now",
 * "6 min ago", "3 h ago", "yesterday", "3 days ago", then a date.
 *
 * One phrasing for every age on screen — a commit, an entry's last change, a
 * folder row — so "3 h" never sits beside "3 hours" on the same page. `now` is
 * a parameter so a test can hold the clock still.
 */
export function age(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((now - then) / 60_000);
  // A clock a little ahead of this one is not the future, it is now.
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
