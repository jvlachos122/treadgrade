/**
 * DOT Tire Identification Number parser.
 *
 * Week numbering follows 49 CFR 574.5: week 01 is the first full Sunday–Saturday
 * calendar week of the year. The regulation's own example is 0109, the week of
 * Sunday, January 4, 2009 through Saturday, January 10, 2009.
 *
 * Three-digit dates are the pre-2000 form (week + a single year digit). The
 * decade is not encoded. Candidate years run from 1971, when the TIN was
 * adopted, through 1999.
 */

const ALLOWED = new Set("ABCDEFHJKLMNPRTVWXY0123456789");

export function indexPlants(plants) {
  const byCode = new Map();
  const byOld = new Map();
  for (const plant of plants) {
    const code = String(plant.code || "")
      .trim()
      .toUpperCase();
    if (!code) continue;
    byCode.set(code, plant);
    const oldCode = String(plant.oldCode || "")
      .trim()
      .toUpperCase();
    if (!oldCode) continue;
    if (!byOld.has(oldCode)) byOld.set(oldCode, []);
    byOld.get(oldCode).push(plant);
  }
  return { byCode, byOld };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function nhtsaWeekRange(year, week) {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const daysUntilSunday = jan1.getUTCDay() === 0 ? 0 : 7 - jan1.getUTCDay();
  const start = new Date(Date.UTC(year, 0, 1 + daysUntilSunday + (week - 1) * 7));
  const end = new Date(start.getTime() + 6 * 86400000);
  return {
    year,
    week,
    start: isoDate(start),
    end: isoDate(end),
    validWeek: start.getUTCFullYear() === year,
  };
}

export function ageBetween(startIso, now) {
  const [year, month, day] = startIso.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const totalDays = Math.round((today - start) / 86400000);
  if (totalDays < 0) return { future: true, years: 0, months: 0, days: 0, totalDays };
  let years = now.getUTCFullYear() - year;
  let months = now.getUTCMonth() - (month - 1);
  let days = now.getUTCDate() - day;
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { future: false, years, months, days, totalDays };
}

function candidateYears(digit) {
  const years = [];
  for (let year = 1971; year <= 1999; year += 1) {
    if (year % 10 === digit) years.push(year);
  }
  return years;
}

function parseInput(raw) {
  const upper = String(raw ?? "")
    .trim()
    .toUpperCase();
  let body = upper;
  let hadDot = false;
  if (body.startsWith("DOT")) {
    hadDot = true;
    body = body.slice(3).replace(/^[\s\-./:]+/, "");
  }
  const invalid = [];
  let compact = "";
  for (const ch of body) {
    if (" -./:".includes(ch)) continue;
    if (!ALLOWED.has(ch)) {
      invalid.push(ch);
      continue;
    }
    compact += ch;
  }
  return { hadDot, invalid: [...new Set(invalid)], compact };
}

function splitDate(compact) {
  if (/^\d{3}$/.test(compact)) {
    const week = Number(compact.slice(0, 2));
    return { head: "", date: compact, style: "three", week, weekOk: week >= 1 && week <= 53, invalidTrailing: null };
  }
  if (/^\d{4}$/.test(compact)) {
    const week = Number(compact.slice(0, 2));
    return { head: "", date: compact, style: "four", week, weekOk: week >= 1 && week <= 53, invalidTrailing: null };
  }
  if (compact.length > 4 && /\d{4}$/.test(compact)) {
    const date = compact.slice(-4);
    const week = Number(date.slice(0, 2));
    if (week >= 1 && week <= 53) {
      return { head: compact.slice(0, -4), date, style: "four", week, weekOk: true, invalidTrailing: null };
    }
    return { head: compact, date: null, style: null, week: null, weekOk: false, invalidTrailing: date };
  }
  if (compact.length > 3 && /\d{3}$/.test(compact) && !/\d/.test(compact.at(-4))) {
    const date = compact.slice(-3);
    const week = Number(date.slice(0, 2));
    if (week >= 1 && week <= 53) {
      return { head: compact.slice(0, -3), date, style: "three", week, weekOk: true, invalidTrailing: null };
    }
  }
  return { head: compact, date: null, style: null, week: null, weekOk: false, invalidTrailing: null };
}

function selectPlant(head, style, index) {
  if (!head) return { plantCode: null, matches: [], middle: "", assumed: null, oldPrefix: [] };
  const three = head.length >= 3 ? head.slice(0, 3) : "";
  const two = head.length >= 2 ? head.slice(0, 2) : "";
  const threeMatch = three ? index.byCode.get(three) : null;
  const twoMatches = two && index.byOld.has(two) ? index.byOld.get(two) : [];
  const preferTwo = style === "three";

  if (preferTwo && twoMatches.length) {
    return {
      plantCode: two,
      matches: twoMatches.map((plant) => ({ ...plant, matchedOn: "old" })),
      middle: head.slice(2),
      assumed: "two",
      oldPrefix: [],
      alsoCurrent: threeMatch || null,
    };
  }
  if (!preferTwo && threeMatch) {
    return {
      plantCode: three,
      matches: [{ ...threeMatch, matchedOn: "current" }],
      middle: head.slice(3),
      assumed: "three",
      oldPrefix: twoMatches,
      alsoCurrent: null,
    };
  }
  if (twoMatches.length) {
    return {
      plantCode: two,
      matches: twoMatches.map((plant) => ({ ...plant, matchedOn: "old" })),
      middle: head.slice(2),
      assumed: "two",
      oldPrefix: [],
      alsoCurrent: threeMatch || null,
    };
  }
  if (threeMatch) {
    return {
      plantCode: three,
      matches: [{ ...threeMatch, matchedOn: "current" }],
      middle: head.slice(3),
      assumed: "three",
      oldPrefix: [],
      alsoCurrent: null,
    };
  }
  const use = !head ? 0 : preferTwo ? Math.min(head.length, 2) : head.length >= 3 ? 3 : head.length;
  return {
    plantCode: head.slice(0, use) || null,
    matches: [],
    middle: head.slice(use),
    assumed: "unknown",
    oldPrefix: [],
    alsoCurrent: null,
  };
}

function classify(style, assumed, middle, matches) {
  if (!style && matches.length && !middle) return "plant-only";
  if (style === "three") return "pre-2000";
  if (style === "four" && !matches.length && !middle && assumed == null) return "date-only";
  if (style === "four" && assumed === "three" && middle.length === 6 && matches.length) return "new-13";
  if (style === "four" && assumed === "three" && middle.length === 0 && matches.length) return "retread-7";
  if (style === "four" && assumed === "two" && matches.length) return "old-two-symbol";
  if (!style && !matches.length) return "unknown";
  return "partial";
}

function dateCandidates(style, date, week, now) {
  if (style === "four") {
    const year = 2000 + Number(date.slice(2));
    const range = nhtsaWeekRange(year, week);
    if (!range) return [];
    return [{ ...range, age: range.validWeek ? ageBetween(range.start, now) : null }];
  }
  const digit = Number(date.slice(2));
  return candidateYears(digit).map((year) => {
    const range = nhtsaWeekRange(year, week);
    return { ...range, age: range?.validWeek ? ageBetween(range.start, now) : null };
  });
}

export function decodeTin(raw, plantsIndex, now = new Date()) {
  const notes = [];
  const parsed = parseInput(raw);
  if (!parsed.compact) {
    return {
      ok: false,
      normalized: "",
      hadDot: parsed.hadDot,
      format: "unknown",
      plantCode: null,
      matches: [],
      middle: "",
      date: null,
      notes: [{ level: "error", text: "Enter a plant code, a date code, or a longer tire identification number." }],
    };
  }

  if (parsed.hadDot) {
    notes.push({
      level: "info",
      text: "The leading DOT mark was set aside. DOT is a certification symbol, not part of the plant code.",
    });
  }
  if (parsed.invalid.length) {
    notes.push({
      level: "warn",
      text: `Left out characters that 49 CFR 574.5 does not allow in a TIN: ${parsed.invalid.join(", ")}. Allowed symbols are A, B, C, D, E, F, H, J, K, L, M, N, P, R, T, U, V, W, X, Y, and digits.`,
    });
  }

  const split = splitDate(parsed.compact);
  if (split.invalidTrailing) {
    notes.push({
      level: "warn",
      text: `The last four digits are ${split.invalidTrailing}. The first two are not a manufacture week from 01 to 53, so they were not read as a date code.`,
    });
  }

  let date = null;
  if (split.style && !split.weekOk) {
    notes.push({
      level: "error",
      text: `${split.date} is not a manufacture week from 01 to 53.`,
    });
  } else if (split.style && split.weekOk) {
    const candidates = dateCandidates(split.style, split.date, split.week, now).filter(Boolean);
    date = { style: split.style, raw: split.date, week: split.week, candidates };
    if (split.style === "four") {
      const candidate = candidates[0];
      notes.push({
        level: "info",
        text: "The last four digits are the date code in 49 CFR 574.5: two digits for the week, then the last two digits of the year. Week 01 is the first Sunday–Saturday week that falls entirely in that year. Years 00 through 99 are read as 2000 through 2099.",
      });
      if (candidate && !candidate.validWeek) {
        notes.push({
          level: "warn",
          text: `Week ${split.week} does not start during ${candidate.year} under that Sunday-start rule.`,
        });
      }
      if (candidate?.age?.future) {
        notes.push({
          level: "warn",
          text: "That week has not started yet. A digit may have been misread.",
        });
      }
    } else {
      notes.push({
        level: "info",
        text: "This is a three-digit date code, the form used before 2000: two digits for the week and one digit for the year. The decade is not in the code. Each year from 1971 through 1999 that ends in that digit is listed. 1971 is the year the tire identification number was adopted.",
      });
    }
  }

  const plant = selectPlant(split.head, split.style, plantsIndex);
  if (plant.matches.length === 0 && plant.plantCode) {
    notes.push({
      level: "warn",
      text: `Plant code ${plant.plantCode} is not in the NHTSA equipment plant list this site loaded.`,
    });
  } else if (plant.matches.length === 1) {
    const match = plant.matches[0];
    if (match.matchedOn === "old") {
      notes.push({
        level: "info",
        text: `${plant.plantCode} matches a former two-symbol plant code. The current code for that plant is ${match.code}.`,
      });
    }
  } else if (plant.matches.length > 1) {
    notes.push({
      level: "warn",
      text: `Former plant code ${plant.plantCode} is on more than one plant record. Each match is listed.`,
    });
  }

  if (plant.oldPrefix?.length && plant.assumed === "three") {
    const others = plant.oldPrefix
      .map((item) => item.code)
      .filter((code) => code !== plant.plantCode);
    if (others.length) {
      notes.push({
        level: "info",
        text: `The first two symbols also match former code ${split.head.slice(0, 2)} on ${others.join(", ")}. The three-symbol code is used because it matches a current plant code.`,
      });
    }
  }
  if (plant.alsoCurrent && plant.assumed === "two" && split.style === "three") {
    notes.push({
      level: "info",
      text: `The first three symbols also match current plant code ${plant.alsoCurrent.code}. A three-digit date belongs to the older two-symbol layout, so the two-symbol code is used.`,
    });
  }
  if (split.style === "three" && plant.assumed === "three" && plant.matches.length) {
    notes.push({
      level: "warn",
      text: `A three-digit date usually goes with a two-symbol plant code. The first two symbols do not match a former code, and the first three match current plant ${plant.plantCode}, so that plant is shown.`,
    });
  }

  const format = classify(split.style, plant.plantCode ? plant.assumed : null, plant.middle, plant.matches);
  if (format === "new-13") {
    notes.push({
      level: "info",
      text: "This reading is 13 symbols: a 3-symbol plant code, a 6-symbol manufacturer code, and a 4-digit date code. That is the current new-tire TIN length in 49 CFR 574.5.",
    });
  } else if (format === "retread-7") {
    notes.push({
      level: "info",
      text: "This reading is 7 symbols: a 3-symbol plant code and a 4-digit date code. That is the retreaded-tire TIN length in 49 CFR 574.5. The separate R mark is not part of the TIN. Matching this length does not prove the tire was retreaded.",
    });
  } else if (format === "old-two-symbol") {
    notes.push({
      level: "info",
      text: "This matches the older layout in 49 CFR 574.5(g): a two-symbol plant code, then up to two size symbols and up to four optional descriptive symbols, then a four-digit date. The regulation ended optional use of that layout on April 13, 2025. Tires made earlier can still show it.",
    });
  } else if (format === "partial") {
    notes.push({
      level: "warn",
      text: "This does not match a complete TIN length. The plant and date below are the closest reading of what was entered.",
    });
  } else if (format === "unknown") {
    notes.push({
      level: "error",
      text: "No plant code or date code could be read from that entry.",
    });
  }

  if (plant.middle) {
    notes.push({
      level: "info",
      text: `Symbols between the plant code and the date code: ${plant.middle}. On a current TIN those six symbols are the manufacturer code. On the older layout they are the size code and an optional descriptive code. NHTSA does not publish what they mean.`,
    });
  }

  const ages = (date?.candidates || []).map((item) => item.age).filter((age) => age && !age.future);
  const oldestRecent = ages.length ? Math.min(...ages.map((age) => age.years)) : null;
  if (oldestRecent != null && oldestRecent >= 6) {
    notes.push({
      level: "info",
      text: "NHTSA says some vehicle and tire manufacturers recommend replacing tires that are six to 10 years old, regardless of treadwear. This page calculates a date. It does not decide whether a tire is safe to use.",
    });
  }

  const hasUseful = plant.matches.length > 0 || Boolean(date && date.candidates.some((item) => item.validWeek));
  const hasError = notes.some((note) => note.level === "error");
  return {
    ok: hasUseful && !hasError,
    normalized: parsed.compact,
    hadDot: parsed.hadDot,
    format,
    plantCode: plant.plantCode,
    matches: plant.matches,
    middle: plant.middle,
    date,
    notes,
  };
}
