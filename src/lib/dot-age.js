/**
 * Age across a DOT production week.
 *
 * 49 CFR 574.5 counts a manufacture week as Sunday through Saturday, not as
 * one day and not as an ISO week (ISO weeks start on Monday). The age is the
 * span from the Saturday that ends the week to the Sunday that starts it.
 * Adding years uses the same month and day, or the last day of that month
 * when the day does not exist (a February 29 anniversary in a non-leap year).
 */

import { ageBetween } from "./tin.js";

export const REMINDER_YEARS = [5, 6, 10];

const BEFORE_WEEK = "before this production week";
const INSIDE_WEEK = "inside this production week";

export function parseIsoDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return "";
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function utcDay(iso) {
  const day = parseIsoDay(iso);
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

export function addCalendarYears(iso, years) {
  const day = parseIsoDay(iso);
  if (!day || !Number.isInteger(years)) return "";
  const [year, month, date] = day.split("-").map(Number);
  const target = year + years;
  const last = new Date(Date.UTC(target, month, 0)).getUTCDate();
  const clamped = Math.min(date, last);
  return `${String(target).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export function addCalendarDays(iso, days) {
  const day = parseIsoDay(iso);
  if (!day || !Number.isInteger(days)) return "";
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

export function ageSpan(startIso, endIso, asOf) {
  const when = asOf instanceof Date ? asOf : utcDay(asOf);
  return {
    start: startIso,
    end: endIso,
    older: ageBetween(startIso, when),
    younger: ageBetween(endIso, when),
  };
}

function yearMonthParts(age, withDays) {
  if (!age || age.future) return "";
  const parts = [];
  if (age.years) parts.push(`${age.years} year${age.years === 1 ? "" : "s"}`);
  if (age.months) parts.push(`${age.months} month${age.months === 1 ? "" : "s"}`);
  if (withDays && age.days) parts.push(`${age.days} day${age.days === 1 ? "" : "s"}`);
  if (parts.length) return parts.join(", ");
  if (age.totalDays === 0) return "0 days";
  return `${age.days} day${age.days === 1 ? "" : "s"}`;
}

export function formatAgeSpan(span) {
  if (!span?.older || !span?.younger) return "";
  if (span.older.future) return BEFORE_WEEK;
  if (span.younger.future) return INSIDE_WEEK;
  const sameMonth = span.younger.years === span.older.years && span.younger.months === span.older.months;
  const young = yearMonthParts(span.younger, sameMonth);
  const old = yearMonthParts(span.older, sameMonth);
  if (young === old) return young;
  return `${young} to ${old}`;
}

export function ageTodaySentence(spanText) {
  if (spanText === BEFORE_WEEK) return "Age today is before this production week.";
  if (spanText === INSIDE_WEEK) return "Age today falls inside this production week.";
  return `Age today is ${spanText}, from the Saturday that ends the week to the Sunday that starts it.`;
}

export function ageAtPurchaseSentence(spanText, purchaseLabel) {
  if (spanText === BEFORE_WEEK) return `Age on ${purchaseLabel} is before this production week.`;
  if (spanText === INSIDE_WEEK) return `Age on ${purchaseLabel} falls inside this production week.`;
  return `Age on ${purchaseLabel} is ${spanText}, from the Saturday that ends the week to the Sunday that starts it.`;
}

export function purchaseNote(value) {
  const raw = String(value ?? "").trim();
  if (!raw || parseIsoDay(raw)) return "";
  return "That purchase date is not a calendar day.";
}

export function candidateAgeCopy(candidate, now, purchaseIso = "", formatDay = (iso) => iso, formatPurchaseDay = (iso) => iso) {
  if (!candidate?.validWeek) {
    return [`Week ${candidate?.week} of ${candidate?.year} does not start in that year under the Sunday-start rule.`];
  }
  const label = candidate.triangleYear ? `${candidate.year} (1990s triangle)` : String(candidate.year);
  const sentences = [
    `Week ${candidate.week} of ${label}: ${formatDay(candidate.start)} through ${formatDay(candidate.end)}.`,
    ageTodaySentence(formatAgeSpan(ageSpan(candidate.start, candidate.end, now))),
  ];
  const purchase = parseIsoDay(purchaseIso);
  if (purchase) {
    const purchaseLabel = formatPurchaseDay(purchase);
    sentences.push(
      ageAtPurchaseSentence(formatAgeSpan(ageSpan(candidate.start, candidate.end, utcDay(purchase))), purchaseLabel),
    );
  }
  return sentences;
}
