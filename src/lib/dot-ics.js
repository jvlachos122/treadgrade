/**
 * Client-side iCalendar text for a span N years after a production week.
 * The caller writes the file in the browser. This module does not store or send it.
 */

import { addCalendarDays, addCalendarYears, REMINDER_YEARS } from "./dot-age.js";

function orderedWeeks(weeks) {
  return (weeks || [])
    .filter((item) => item?.start && item?.end && Number.isInteger(item.year) && Number.isInteger(item.week))
    .map((item) => ({ year: item.year, week: item.week, start: item.start, end: item.end }))
    .sort((a, b) => a.year - b.year || a.week - b.week);
}

export function reminderWeeks(result) {
  return orderedWeeks((result?.date?.candidates || []).filter((item) => item.validWeek));
}

function icsEscape(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let index = 75;
  while (index < line.length) {
    parts.push(` ${line.slice(index, index + 74)}`);
    index += 74;
  }
  return parts.join("\r\n");
}

function icsStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function uidPart(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "") || "na";
}

export function buildAgeReminderIcs({ years, plantCode = "", dateCode = "", weeks = [], dtstamp = new Date() } = {}) {
  if (!REMINDER_YEARS.includes(years)) return null;
  const events = [];
  for (const week of orderedWeeks(weeks)) {
    const start = addCalendarYears(week.start, years);
    const end = addCalendarYears(week.end, years);
    const endExclusive = addCalendarDays(end, 1);
    if (!start || !end || !endExclusive) continue;
    const code = dateCode || `${String(week.week).padStart(2, "0")}${String(week.year).slice(-2)}`;
    const summary = `${years} years after production week ${code} (${week.year})`;
    const description = `Production week ${week.week} of ${week.year} is ${week.start} through ${week.end}. This calendar span is ${years} years after that week, ${start} through ${end}. It is not a finding about a tire.`;
    events.push(
      [
        "BEGIN:VEVENT",
        `UID:dot-${uidPart(code)}-${week.year}-${years}y-${uidPart(plantCode)}@treadgrade.com`,
        `DTSTAMP:${icsStamp(dtstamp instanceof Date ? dtstamp : new Date(dtstamp))}`,
        `DTSTART;VALUE=DATE:${start.replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${endExclusive.replaceAll("-", "")}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(description)}`,
        "END:VEVENT",
      ].map(fold),
    );
  }
  if (!events.length) return null;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TreadGrade//DOT production week//EN", "CALSCALE:GREGORIAN"];
  for (const event of events) lines.push(...event);
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
