import { formatTreadwearMedian, treadwearMedian } from "./answers.js";
import { formatNumber, formatUtcDate, formatVerified } from "./format.js";
import { nameKey } from "./normalize.js";
import { flattenGradeRows, ratingsTableHref } from "./ratings-table.js";
import { article, dataset } from "./structured.js";
import { bandLabel, bandStart } from "./treadwear-numbers.js";

/**
 * Traction grades counted from the committed NHTSA UTQG rows.
 * Letter thresholds are the words printed in 49 CFR 575.104 on the eCFR
 * page retrieved on ECFR_RETRIEVED. Counts are computed at build time.
 * Do not hard-code them.
 */

export const TRACTION_GRADES_PATH = "/guides/traction-grades/";

export const TRACTION_LETTERS = ["AA", "A", "B", "C"];

export const ECFR_TRACTION_URL =
  "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-575/section-575.104";
export const ECFR_RETRIEVED = "2026-11-14";

export const FR_TRACTION_URL = "https://www.govinfo.gov/content/pkg/FR-1996-09-09/html/96-22761.htm";
export const FR_RETRIEVED = "2026-11-14";

/**
 * Watched line. The page names it only when the committed file contains it,
 * and it states the traction letters that file actually stores.
 */
export const WATCHED_LINE = { brand: "Michelin", line: "CrossClimate2" };

/** Verdicts and buying language this page must not use. */
export const BANNED_VERDICT =
  /\b(best|top-rated|top rated|recommend(?:ed|s|ing)?|better|winner|safest|good tire|bad tire|worth buying)\b/i;

/** Figure 2, Part II, traction explanation, as printed on the eCFR page. */
export const FIGURE_2_TRACTION =
  "The traction grades, from highest to lowest, are AA, A, B, and C. Those grades represent the tire's ability to stop on wet pavement as measured under controlled conditions on specified government test surfaces of asphalt and concrete. A tire marked C may have poor traction performance. Warning: The traction grade assigned to this tire is based on straight-ahead braking traction tests, and does not include acceleration, cornering, hydroplaning, or peak traction characteristics.";

export const LOCKED_WHEEL_QUOTE =
  "Tow the trailer on the asphalt test surface specified in paragraph (f)(1)(i) of this section at a speed of 40 mph, lock one trailer wheel, and record the locked-wheel traction coefficient on the tire associated with that wheel between 0.5 and 1.5 seconds after lockup.";

export const CONCRETE_REPEAT_QUOTE = "Repeat the test on the concrete surface, locking the same wheel.";

export const WETTING_QUOTE =
  "The pavement surface is wetted in accordance with paragraph 4.7, “Pavement Wetting System,” of ASTM E 274 (incorporated by reference, see § 575.3).";

export const SURFACE_COEFFICIENT_QUOTE =
  "The surfaces have locked wheel traction coefficients when evaluated in accordance with paragraphs (f)(2)(i) through (f)(2)(vii) of this section of 0.50 ±0.10 for the asphalt and 0.35 ±0.10 for the concrete.";

export const SNOW_EXCLUSION_QUOTE =
  "this section does not apply to deep tread, winter-type snow tires, space-saver or temporary use spare tires, tires with nominal rim diameters of 12 inches or less, or to limited production tires as defined in paragraph (c)(2) of this section.";

export const ASPHALT_FORMULA =
  "(μa) = Measured candidate tire coefficient for asphalt + 0.50 − Measured standard tire coefficient for asphalt";

export const CONCRETE_FORMULA =
  "μc = Measured candidate tire coefficient for concrete + 0.35μ Measured standard tire coefficient for concrete";

/** Footnote in the September 9, 1996 final rule, 61 FR 47437. */
export const FR_PEAK_TRACTION =
  "Peak traction is the primary traction force in anti-lock braking systems in which maximum braking action is obtained while the tire is still rolling.";

/**
 * Paragraph (d)(2)(ii), as printed. The AA paragraphs include the Greek
 * letter μ that the eCFR page prints after 0.54 and 0.38.
 */
export const TRACTION_RULES = [
  {
    id: "C",
    verb: "shall be graded C when either figure is met",
    asphalt: "0.38 or less",
    concrete: "0.26 or less",
    quotes: [
      "The tire shall be graded C when the adjusted traction coefficient is either:",
      "0.38 or less when tested in accordance with paragraph (f)(2) of this section on the asphalt surface specified in paragraph (f)(1)(i) of this section, or",
      "0.26 or less when tested in accordance with paragraph (f)(2) of this section on the concrete surface specified in paragraph (f)(1)(i) of this section.",
    ],
  },
  {
    id: "B",
    verb: "may be graded B only when both figures are met",
    asphalt: "more than 0.38",
    concrete: "more than 0.26",
    quotes: [
      "The tire may be graded B only when its adjusted traction coefficient is both:",
      "More than 0.38 when tested in accordance with paragraph (f)(2) of this section on the asphalt surface specified in paragraph (f)(1)(i) of this section, and",
      "More than 0.26 when tested in accordance with paragraph (f)(2) of this section on the concrete surface specified in paragraph (f)(1)(i) of this section.",
    ],
  },
  {
    id: "A",
    verb: "may be graded A only when both figures are met",
    asphalt: "more than 0.47",
    concrete: "more than 0.35",
    quotes: [
      "The tire may be graded A only when its adjusted traction coefficient is both:",
      "More than 0.47 when tested in accordance with paragraph (f)(2) of this section on the asphalt surface specified in paragraph (f)(1)(i) of this section, and",
      "More than 0.35 when tested in accordance with paragraph (f)(2) of this section on the concrete surface specified in paragraph (f)(1)(i) of this section.",
    ],
  },
  {
    id: "AA",
    verb: "may be graded AA only when both figures are met",
    asphalt: "more than 0.54μ",
    concrete: "more than 0.38μ",
    quotes: [
      "The tire may be graded AA only when its adjusted traction coefficient is both:",
      "More than 0.54μ when tested in accordance with paragraph (f)(2) of this section on the asphalt surface specified in paragraph (f)(1)(i) of this section; and",
      "More than 0.38μ when tested in accordance with paragraph (f)(2) of this section on the concrete surface specified in paragraph (f)(1)(i) of this section.",
    ],
  },
];

const GRADE_ORDER = [...TRACTION_LETTERS, "outside"];

function noun(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function listJoin(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function tractionLetter(value) {
  const text = value == null ? "" : String(value).trim();
  return TRACTION_LETTERS.includes(text) ? text : "outside";
}

export function gradeLabel(id) {
  return id === "outside" ? "Outside AA–C" : id;
}

function parseWear(row) {
  const raw = row?.wear;
  if (raw == null || String(raw).trim() === "") return { kind: "missing" };
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return { kind: "nonnumeric" };
  const wearN = Number(text);
  if (wearN === 0) return { kind: "zero", wearN };
  return { kind: "number", wearN };
}

function emptyGrade(id) {
  return {
    id,
    label: gradeLabel(id),
    rows: 0,
    shown: 0,
    linesAtLeast: 0,
    linesOnly: 0,
    href: id === "outside" ? "" : ratingsTableHref({ traction: [id] }),
    wears: [],
    excludedMissing: 0,
    excludedZero: 0,
    excludedNonnumeric: 0,
  };
}

function lineIndex(catalog) {
  const byId = new Map();
  for (const line of catalog?.lines || []) {
    for (const id of line.sourceIds || []) byId.set(id, line);
  }
  return byId;
}

function isWatched(line) {
  return nameKey(line?.brand) === nameKey(WATCHED_LINE.brand) && nameKey(line?.line) === nameKey(WATCHED_LINE.line);
}

function uniqueInOrder(values) {
  const seen = [];
  for (const value of values) {
    if (!seen.includes(value)) seen.push(value);
  }
  return seen;
}

function valuePhrase(rows, field) {
  const values = uniqueInOrder(
    rows.map((row) => {
      const raw = row[field];
      if (raw == null || String(raw).trim() === "") return "not reported";
      return String(raw).trim();
    }),
  );
  return listJoin(values);
}

export function ecfrRetrievedLabel(iso = ECFR_RETRIEVED) {
  return formatUtcDate(iso);
}

export function frRetrievedLabel(iso = FR_RETRIEVED) {
  return formatUtcDate(iso);
}

function watchedFacts(line, sourceRows) {
  const rows = (line.rows || []).map((row) => ({
    size: row.size == null || String(row.size).trim() === "" ? "Not reported" : String(row.size),
    wear: row.wear == null || String(row.wear).trim() === "" ? "Not reported" : String(row.wear),
    trac: row.trac == null || String(row.trac).trim() === "" ? "Not reported" : String(row.trac),
    temp: row.temp == null || String(row.temp).trim() === "" ? "Not reported" : String(row.temp),
  }));
  const traction = uniqueInOrder(rows.map((row) => row.trac));
  const only = traction.length === 1 ? traction[0] : "";
  return {
    brand: line.brand,
    line: line.line,
    url: line.url,
    rows,
    sourceRows,
    traction,
    only,
    tableHref: ratingsTableHref({
      q: line.line,
      traction: only && TRACTION_LETTERS.includes(only) ? [only] : [],
    }),
  };
}

export function tractionGradesReport(ratings, catalog) {
  const source = ratings || [];
  const bySourceId = lineIndex(catalog);
  const grades = new Map(GRADE_ORDER.map((id) => [id, emptyGrade(id)]));
  const lineGrades = new Map();
  const outsideRows = [];
  let unmapped = 0;
  let zeroRows = 0;

  for (const row of source) {
    const id = tractionLetter(row.trac);
    const grade = grades.get(id);
    grade.rows += 1;
    const wear = parseWear(row);
    if (wear.kind === "missing") grade.excludedMissing += 1;
    else if (wear.kind === "nonnumeric") grade.excludedNonnumeric += 1;
    else if (wear.kind === "zero") {
      grade.excludedZero += 1;
      zeroRows += 1;
      grade.wears.push(0);
    } else {
      grade.wears.push(wear.wearN);
    }
    const line = bySourceId.get(row.id);
    if (!line) {
      unmapped += 1;
      if (id === "outside") {
        outsideRows.push({
          brand: row.brand == null ? "" : String(row.brand),
          line: row.tireline == null ? "" : String(row.tireline),
          url: "",
          size: row.size == null ? "" : String(row.size),
          trac: row.trac == null ? "" : String(row.trac),
          wear: row.wear == null ? "" : String(row.wear),
          temp: row.temp == null ? "" : String(row.temp),
        });
      }
      continue;
    }
    if (!lineGrades.has(line.url)) lineGrades.set(line.url, new Set());
    lineGrades.get(line.url).add(id);
    if (id === "outside") {
      outsideRows.push({
        brand: line.brand,
        line: line.line,
        url: line.url,
        size: row.size == null ? "" : String(row.size),
        trac: row.trac == null ? "" : String(row.trac),
        wear: row.wear == null ? "" : String(row.wear),
        temp: row.temp == null ? "" : String(row.temp),
      });
    }
  }

  let mixedLines = 0;
  for (const letters of lineGrades.values()) {
    if (letters.size > 1) mixedLines += 1;
    for (const id of letters) grades.get(id).linesAtLeast += 1;
    if (letters.size === 1) grades.get([...letters][0]).linesOnly += 1;
  }

  for (const row of catalog?.lines ? flattenGradeRows(catalog) : []) {
    grades.get(tractionLetter(row.trac)).shown += 1;
  }

  const gradeList = GRADE_ORDER.map((id) => {
    const grade = grades.get(id);
    const positive = grade.wears.filter((value) => value > 0);
    const medianValue = treadwearMedian(positive);
    return {
      ...grade,
      medianValue,
      medianText: formatTreadwearMedian(medianValue),
      medianMin: positive.length ? Math.min(...positive) : null,
      medianMax: positive.length ? Math.max(...positive) : null,
      medianRows: positive.length,
      wears: undefined,
    };
  });

  let maxWear = null;
  for (const grade of grades.values()) {
    for (const value of grade.wears) {
      if (maxWear == null || value > maxWear) maxWear = value;
    }
  }
  const bandCounts = new Map();
  for (const grade of grades.values()) {
    for (const value of grade.wears) {
      const start = bandStart(value);
      if (!bandCounts.has(start)) bandCounts.set(start, Object.fromEntries(GRADE_ORDER.map((id) => [id, 0])));
      bandCounts.get(start)[grade.id] += 1;
    }
  }
  const bands = [];
  if (maxWear != null) {
    for (let start = 0; start <= bandStart(maxWear); start += 100) {
      const counts = bandCounts.get(start) || Object.fromEntries(GRADE_ORDER.map((id) => [id, 0]));
      const end = start + 99;
      const hrefs = {};
      for (const id of TRACTION_LETTERS) {
        hrefs[id] = ratingsTableHref({ wearMin: String(start), wearMax: String(end), traction: [id] });
      }
      bands.push({
        start,
        end,
        label: bandLabel(start),
        counts,
        total: GRADE_ORDER.reduce((sum, id) => sum + counts[id], 0),
        href: ratingsTableHref({ wearMin: String(start), wearMax: String(end) }),
        hrefs,
      });
    }
  }

  const watched = [];
  for (const line of catalog?.lines || []) {
    if (!isWatched(line)) continue;
    const sourceRows = (line.sourceIds || []).reduce((sum, id) => {
      const owner = bySourceId.get(id);
      return owner?.url === line.url ? sum + 1 : sum;
    }, 0);
    watched.push(watchedFacts(line, sourceRows || line.rows?.length || 0));
  }

  const shownRows = gradeList.reduce((sum, grade) => sum + grade.shown, 0);
  return {
    sourceRows: source.length,
    shownRows,
    lineCount: (catalog?.lines || []).length,
    mappedLines: lineGrades.size,
    mixedLines,
    unmapped,
    zeroRows,
    aaLines: grades.get("AA").linesAtLeast,
    grades: gradeList,
    bands,
    outsideRows,
    watched,
    verifiedAt: catalog?.meta?.verifiedAt || "",
    ratingsSource: catalog?.meta?.ratings?.source || "",
  };
}

export function tractionGradesAnswer(report) {
  const measure =
    "UTQG traction grades are AA, A, B, and C, assigned by the manufacturer under 49 CFR 575.104 from a locked-wheel braking test on wet asphalt and wet concrete.";
  const excluded =
    "Figure 2 of that section says the test is straight-ahead braking on wet pavement and does not include acceleration, cornering, hydroplaning, or peak traction.";
  if (!report.sourceRows) {
    return [measure, excluded, "NHTSA's committed UTQG file lists no source rows."];
  }
  const verified = formatVerified(report.verifiedAt);
  const letters = report.grades.filter((grade) => grade.id !== "outside");
  const outside = report.grades.find((grade) => grade.id === "outside");
  const outsideVerb = outside.rows === 1 ? "is" : "are";
  const letterList = listJoin([
    ...letters.map((grade) => `${grade.id} is ${noun(grade.rows, "row")}`),
    `${noun(outside.rows, "row")} ${outsideVerb} outside those letters`,
  ]);
  const lines = `${noun(report.aaLines, "tire line")} ${report.aaLines === 1 ? "has" : "have"} at least one AA row`;
  return [
    measure,
    `In NHTSA's committed file of ${noun(report.sourceRows, "source row")}, last verified ${verified} (UTC), ${letterList}.`,
    `${lines}. Figure 2 of that section says the test is straight-ahead braking on wet pavement and does not include acceleration, cornering, hydroplaning, or peak traction.`,
  ];
}

export function duplicateParagraph(report) {
  const dropped = report.sourceRows - report.shownRows;
  if (dropped === 0) return "The ratings table lists every source row in this pull.";
  return `The ratings table drops exact duplicate grade rows. It lists ${noun(report.shownRows, "grade row")} from these ${noun(report.sourceRows, "source row")}, so a traction link can show fewer rows than the source count.`;
}

export function lineNote(report) {
  const overlap = report.mixedLines
    ? `${noun(report.mixedLines, "tire line")} ${report.mixedLines === 1 ? "lists" : "list"} more than one traction value, so the “at least one row” counts overlap and the “only that value” column leaves those lines out.`
    : "No tire line lists more than one traction value, so the two line columns match.";
  return `${noun(report.lineCount, "tire line")} ${report.lineCount === 1 ? "is" : "are"} in this pull. ${noun(report.aaLines, "tire line")} ${report.aaLines === 1 ? "has" : "have"} at least one AA row. ${overlap}`;
}

export function unmappedNote(report) {
  if (!report.unmapped) return "";
  return `${noun(report.unmapped, "source row")} ${report.unmapped === 1 ? "is" : "are"} not attached to a tire line on this site. ${report.unmapped === 1 ? "That row is" : "Those rows are"} in the source-row counts and not in the tire-line counts.`;
}

export function medianNote(report) {
  const parts = [];
  for (const grade of report.grades) {
    const bits = [];
    if (grade.excludedMissing) bits.push(`${noun(grade.excludedMissing, "row")} with no treadwear number`);
    if (grade.excludedZero) bits.push(`${noun(grade.excludedZero, "row")} with treadwear 0`);
    if (grade.excludedNonnumeric) bits.push(`${noun(grade.excludedNonnumeric, "row")} whose treadwear is not a whole number`);
    if (bits.length) parts.push(`${grade.label} leaves out ${listJoin(bits)}`);
  }
  if (!parts.length) return "Every source row in this pull has a positive whole-number treadwear, and the median uses those values.";
  const zero = report.grades.some((grade) => grade.excludedZero)
    ? " Treadwear 0 stays in the band table."
    : "";
  return `The median uses positive whole-number treadwear. ${listJoin(parts)}.${zero}`;
}

export function bandNote(report) {
  if (!report.bands.length) return "This pull has no whole-number treadwear to place in a band.";
  const zero = report.zeroRows
    ? ` Treadwear 0 is in the 0–99 band (${noun(report.zeroRows, "source row")}).`
    : "";
  return `Each band is the same hundred-wide group used on the treadwear page. A cell counts source rows.${zero}`;
}

export function thresholdCaption() {
  return `Adjusted traction coefficients in 49 CFR 575.104(d)(2)(ii), retrieved ${ecfrRetrievedLabel()} from the eCFR. C applies when either figure is met. B, A, and AA are permitted only when both figures are met. The AA figures include the μ printed on that page.`;
}

export function rowCaption(report) {
  return `Traction values in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Source rows are the committed file. The ratings table drops exact duplicate grade rows. Shares use the source rows.`;
}

export function lineCaption(report) {
  return `Tire lines by traction value in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). A line with more than one value is counted in each “at least one row” cell.`;
}

export function medianCaption(report) {
  return `Median treadwear by traction value in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). The median uses source rows with a positive whole-number treadwear.`;
}

export function bandCaption(report) {
  return `Whole-number treadwear by traction value in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Counts are source rows, including treadwear 0.`;
}

export function outsideCaption(report) {
  return `Source rows whose traction value is outside AA, A, B, and C in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). The published value is quoted. It is not restated as a traction grade.`;
}

export function watchedCaption(item, report) {
  const letters = item.traction.length ? item.traction.join(", ") : "not reported";
  return `${item.brand} ${item.line} size rows in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Traction on these rows: ${letters}.`;
}

function bRuleSentence() {
  const rule = TRACTION_RULES.find((item) => item.id === "B");
  return `A tire may be graded B only when its adjusted traction coefficient is ${rule.asphalt} on the asphalt surface and ${rule.concrete} on the concrete surface.`;
}

export function tractionGradesFaqs(report) {
  const b = report.grades.find((grade) => grade.id === "B");
  const medianBits = report.grades.map((grade) =>
    grade.medianValue == null ? `not reported for ${grade.label}` : `${grade.medianText} for ${grade.label}`,
  );
  const faqs = [
    {
      name: "What does the UTQG traction test measure?",
      text: "49 CFR 575.104 grades traction with a trailer towed at 40 mph. The procedure locks one wheel and records the locked-wheel traction coefficient between 0.5 and 1.5 seconds after lockup, on asphalt and then on concrete. The pavement is wetted. Figure 2 says the grades represent the tire's ability to stop on wet pavement, and that the test does not include acceleration, cornering, hydroplaning, or peak traction.",
    },
    {
      name: "What does a traction grade of B mean?",
      text: `${bRuleSentence()} Figure 2 says a tire marked C may have poor traction performance. It does not use that sentence for B. In this file, traction B is ${noun(b.rows, "source row")} of ${noun(report.sourceRows, "source row")}.`,
    },
  ];
  for (const item of report.watched) {
    const each = item.only
      ? `Each of those rows lists traction ${item.only}.`
      : `Traction on those rows is ${listJoin(item.traction)}.`;
    const name = item.only
      ? `Why does ${item.brand} ${item.line} list traction ${item.only}?`
      : `What traction value does NHTSA list for ${item.brand} ${item.line}?`;
    const rule = item.only === "B"
      ? "A tire may be graded B only when both of those B figures are met. A or AA is permitted only when both surfaces also clear that letter's figures."
      : "The letter on the row is the letter assigned for that tire under 49 CFR 575.104(d)(2)(ii).";
    const duplicates = item.sourceRows === item.rows.length
      ? ""
      : ` The committed file has ${noun(item.sourceRows, "source row")} for this line before exact duplicate grade rows are dropped.`;
    faqs.push({
      name,
      text: `NHTSA lists ${item.brand} ${item.line} on ${noun(item.rows.length, "size row")} in the committed UTQG file. ${each} Treadwear on those rows is ${valuePhrase(item.rows, "wear")}. Temperature on those rows is ${valuePhrase(item.rows, "temp")}. The file does not record the measured coefficients. ${rule}${duplicates}`,
      url: item.url,
      tableHref: item.tableHref,
      linkLabel: `${item.brand} ${item.line}`,
    });
  }
  faqs.push({
    name: "How does treadwear sit next to each traction grade in this file?",
    text: `On source rows with a positive whole-number treadwear, the median treadwear is ${listJoin(medianBits)}. The median leaves out treadwear 0 and rows with no whole-number treadwear. A traction letter and a treadwear number are separate grades in the file.`,
  });
  return faqs;
}

export function tractionGradesText(report) {
  const faqs = tractionGradesFaqs(report);
  return [
    ...tractionGradesAnswer(report),
    duplicateParagraph(report),
    lineNote(report),
    unmappedNote(report),
    medianNote(report),
    bandNote(report),
    thresholdCaption(),
    rowCaption(report),
    lineCaption(report),
    medianCaption(report),
    bandCaption(report),
    outsideCaption(report),
    ...report.watched.map((item) => watchedCaption(item, report)),
    FIGURE_2_TRACTION,
    LOCKED_WHEEL_QUOTE,
    CONCRETE_REPEAT_QUOTE,
    WETTING_QUOTE,
    SURFACE_COEFFICIENT_QUOTE,
    SNOW_EXCLUSION_QUOTE,
    ASPHALT_FORMULA,
    CONCRETE_FORMULA,
    FR_PEAK_TRACTION,
    ...TRACTION_RULES.flatMap((rule) => rule.quotes),
    ...faqs.flatMap((item) => [item.name, item.text]),
    ECFR_TRACTION_URL,
    ecfrRetrievedLabel(),
    FR_TRACTION_URL,
    frRetrievedLabel(),
  ].join(" ");
}

export function tractionGradesJsonLd(report) {
  const answers = tractionGradesAnswer(report);
  const description = answers.join(" ");
  const faqs = tractionGradesFaqs(report);
  return [
    dataset({
      name: "UTQG traction grade counts in NHTSA's published list",
      description,
      path: TRACTION_GRADES_PATH,
      dateModified: report.verifiedAt,
      isBasedOn: report.ratingsSource,
      keywords: ["UTQG", "traction", "NHTSA"],
    }),
    article({
      headline: "What UTQG traction grades mean",
      description,
      path: TRACTION_GRADES_PATH,
      dateModified: report.verifiedAt,
    }),
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.name,
        acceptedAnswer: { "@type": "Answer", text: item.text },
      })),
    },
  ];
}
