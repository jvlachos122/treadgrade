const KEEP_UPPER = new Set(["USA", "LP", "LTD", "CO", "INC", "LLC"]);

export function cleanSpace(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * All-caps source strings are hard to read. Sentence-case those, and leave
 * mixed-case source strings alone. Spelling is not corrected.
 */
export function softenCaps(value) {
  const trimmed = cleanSpace(value);
  if (!trimmed) return "";
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return trimmed;
  return trimmed.replace(/[A-Za-z]+/g, (word) => {
    if (KEEP_UPPER.has(word) || word.length <= 2) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  });
}

export function formatVerified(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso ?? "");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatUtcDay(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) return String(iso ?? "");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

export function wearRange(min, max) {
  if (min == null || max == null) return "Not reported";
  if (min === max) return String(min);
  return `${min}–${max}`;
}

export function formatAge(age) {
  if (!age) return "";
  if (age.future) return "That week has not started yet.";
  if (age.totalDays === 0) return "The Sunday that starts that week is today.";
  const parts = [];
  if (age.years) parts.push(`${age.years} year${age.years === 1 ? "" : "s"}`);
  if (age.months) parts.push(`${age.months} month${age.months === 1 ? "" : "s"}`);
  if (age.days || parts.length === 0) parts.push(`${age.days} day${age.days === 1 ? "" : "s"}`);
  return `${parts.join(", ")} before today, counted from the Sunday that starts the week (${formatNumber(age.totalDays)} days).`;
}

export function percent(count, total) {
  if (!total) return "0%";
  return `${((count / total) * 100).toFixed(1)}%`;
}
