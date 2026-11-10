import { USUAL_TEMPERATURE, USUAL_TRACTION } from "./grade-quality.js";
import { formatNumber, formatUtcDate, percent } from "./format.js";
import { compareToolHref, recallRowsForLine } from "./compare.js";
import { nhtsaCampaignUrl, recallAnchor, recallStatement, recallWording } from "./recalls.js";
import { plantsMatchingFilings } from "./who-makes.js";

/**
 * A thin tire-line page has one grade row after the catalog drops exact
 * duplicate rows. That row is the only size string and the only UTQG
 * combination on the page.
 *
 * Ranks use lines that publish one usable value, counted from the file.
 * A usable treadwear number is a positive whole number on every row in the
 * group being ranked. A line with two treadwear numbers, or a blank, is
 * counted as excluded and is not given a stand-in number. Traction order
 * is AA, then A, then B, then C. Temperature order is A, then B, then C.
 * The percent is the stated count divided by the stated group size.
 *
 * Size groups use a metric or flotation size read from the size text, or
 * the exact size text after removing spaces and letter case. "All sizes"
 * and other text without a specific size are not a group. The ratings file
 * has no category field, and none is invented here.
 *
 * Recall rows match the full brand and the full line. Letter case and
 * extra spaces are ignored. Punctuation is not. A plant is listed only
 * when one of those recall rows names a company that matches a registrant.
 */

export const THIN_LINK_LIMIT = 6;

const METRIC_SOURCE = "(LT|ST|P)?(\\d{2,3})\\/(\\d{2,3})Z?R(\\d{2}(?:\\.\\d)?)";
const FLOTATION_SOURCE = "(\\d{2}(?:\\.\\d+)?)X(\\d{1,2}(?:\\.\\d{1,2})?)R(\\d{2}(?:\\.\\d)?)";
const TRACTION_ORDER = USUAL_TRACTION;
const TEMPERATURE_ORDER = USUAL_TEMPERATURE;
const LOOSE_COMPARE = "Grades from different brands are only loosely comparable.";

function cleanSize(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function matchOne(compact, source) {
  const found = new RegExp(source, "i").exec(compact);
  if (!found) return null;
  const later = new RegExp(source, "i").exec(compact.slice(found.index + found[0].length));
  if (later) return { multi: true };
  return found;
}

/**
 * One metric or flotation size read from a published size string.
 * Null when the text has none, or more than one.
 */
export function parsePublishedSize(size) {
  const compact = cleanSize(size).toUpperCase().replace(/\s+/g, "");
  if (!compact) return null;
  const metric = matchOne(compact, METRIC_SOURCE);
  const flotation = matchOne(compact, FLOTATION_SOURCE);
  const hits = [metric, flotation].filter(Boolean);
  if (hits.length !== 1 || hits[0].multi) return null;
  if (metric) {
    const prefix = metric[1] ? metric[1].toUpperCase() : "";
    return { kind: "metric", token: `${prefix}${metric[2]}/${metric[3]}R${metric[4]}` };
  }
  return {
    kind: "flotation",
    token: `${flotation[1].toUpperCase()}X${flotation[2].toUpperCase()}R${flotation[3]}`,
  };
}

/**
 * Key for size text that is a specific string, such as "14 & 15", and not
 * a parsed size or an all-sizes label. Empty when the text should not be grouped.
 */
export function sizeTextKey(size) {
  if (parsePublishedSize(size)) return "";
  const text = cleanSize(size).toLowerCase();
  if (!text || /^all\b/.test(text) || !/\d/.test(text)) return "";
  return text.replace(/\s+/g, "");
}

export function isThinLine(line) {
  return Array.isArray(line?.rows) && line.rows.length === 1;
}

function singleWearOn(rows) {
  const values = new Set();
  for (const row of rows || []) {
    if (!(row.wearN > 0)) return null;
    values.add(row.wearN);
  }
  if (values.size !== 1) return null;
  return [...values][0];
}

function singleLetterOn(rows, field, allowed) {
  const values = new Set();
  for (const row of rows || []) {
    const value = row[field];
    if (!allowed.includes(value)) return null;
    values.add(value);
  }
  if (values.size !== 1) return null;
  return [...values][0];
}

function numericPlacement(counts, value) {
  let higher = 0;
  let same = 0;
  let lower = 0;
  for (const [grade, count] of counts) {
    if (grade > value) higher += count;
    else if (grade < value) lower += count;
    else same += count;
  }
  const n = higher + same + lower;
  return { n, rank: higher + 1, higher, same, lower, wear: value };
}

function letterPlacement(counts, value, order) {
  const index = order.indexOf(value);
  let before = 0;
  let same = 0;
  let after = 0;
  for (const [grade, count] of counts) {
    const other = order.indexOf(grade);
    if (other < index) before += count;
    else if (other > index) after += count;
    else same += count;
  }
  const n = before + same + after;
  return { n, rank: before + 1, before, same, after, letter: value };
}

function histogram(lines, pick) {
  const counts = new Map();
  const rankable = [];
  for (const line of lines) {
    const value = pick(line);
    if (value == null) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
    rankable.push(line);
  }
  return { counts, rankable };
}

function quote(value) {
  return `“${value}”`;
}

function visibleSentence(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function faq(name, text) {
  return { name: visibleSentence(name), text: visibleSentence(text) };
}

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function countVerb(count, singular, plural) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function wearDistance(target, wear) {
  if (target == null || wear == null) return null;
  return Math.abs(wear - target);
}

function byDistance(target, wearOf, nameOf) {
  return (a, b) => {
    const left = wearDistance(target, wearOf(a));
    const right = wearDistance(target, wearOf(b));
    if (left == null && right == null) return nameOf(a, b);
    if (left == null) return 1;
    if (right == null) return -1;
    return left - right || nameOf(a, b);
  };
}

function lineNameOrder(a, b) {
  return a.brand.localeCompare(b.brand, "en") || a.line.localeCompare(b.line, "en") || a.lineSlug.localeCompare(b.lineSlug);
}

function memberNameOrder(a, b) {
  return lineNameOrder(a.line, b.line);
}

function lineWearText(line) {
  const values = [...new Set(line.rows.map((row) => row.wearN).filter((value) => value > 0))].sort((a, b) => a - b);
  const positiveRows = line.rows.filter((row) => row.wearN > 0).length;
  if (!values.length) return "no usable treadwear number";
  if (values.length === 1 && positiveRows === line.rows.length) return `treadwear ${values[0]}`;
  if (values.length === 1) return `treadwear ${values[0]} on ${formatNumber(positiveRows)} of ${formatNumber(line.rows.length)} rows`;
  return `treadwear ${values[0]}–${values.at(-1)}`;
}

function placeSentence(wear, placement, subject) {
  return `Among ${formatNumber(placement.n)} ${subject}, treadwear ${wear} ranks ${formatNumber(placement.rank)} of ${formatNumber(placement.n)} when a higher number is ordered first.`;
}

function wearDetail(placement) {
  const share = percent(placement.lower, placement.n);
  return `${countVerb(placement.higher, "line lists", "lines list")} a higher number, ${countVerb(placement.same, "line lists", "lines list")} ${placement.wear}, including this line, and ${countVerb(placement.lower, "line lists", "lines list")} a lower number, which is ${share} of the ${formatNumber(placement.n)}.`;
}

function excludedWearSentence(multi, missing, n) {
  const parts = [];
  if (multi) parts.push(`${countVerb(multi, "line lists", "lines list")} more than one usable treadwear number`);
  if (missing) parts.push(`${countVerb(missing, "line lists", "lines list")} no usable treadwear number`);
  if (!parts.length) return "";
  const joined = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts[0];
  const total = multi + missing;
  return `${joined}, so ${total === 1 ? "that line is" : "those lines are"} not in the ${formatNumber(n)}.`;
}

function letterSentence(line, kind, placement, subject, orderText) {
  const lead = `Among ${formatNumber(placement.n)} ${subject} with one usual ${kind} grade, ${line.brand} ${line.line} lists ${placement.letter}.`;
  const share = percent(placement.before, placement.n);
  const counts = `${countVerb(placement.before, "line lists", "lines list")} a grade ordered before ${placement.letter} (${share} of the ${formatNumber(placement.n)}), ${countVerb(placement.same, "line lists", "lines list")} ${placement.letter}, including this line, and ${countVerb(placement.after, "line lists", "lines list")} a grade ordered after ${placement.letter}.`;
  return `${lead} ${counts} The order is ${orderText}.`;
}

function letterExcluded(lineCount, placement, brand, kind) {
  const excluded = lineCount - placement.n;
  if (!excluded) return "";
  return `${formatNumber(excluded)} ${brand} ${noun(excluded, "line")} ${excluded === 1 ? "does" : "do"} not have one usual ${kind} grade, so ${excluded === 1 ? "it is" : "they are"} not in the ${formatNumber(placement.n)}.`;
}

function listedSentence(shown, total, label, how) {
  if (!total) return "";
  const verb = shown === 1 ? "is" : "are";
  if (shown === total) return `${formatNumber(shown)} ${label} ${verb} listed, ${how}.`;
  return `${formatNumber(shown)} of ${formatNumber(total)} ${label} ${verb} listed, ${how}.`;
}

function publishingLabel(count, prefix, sizeLabel) {
  return `${prefix} ${noun(count, "line")} that ${count === 1 ? "publishes" : "publish"} ${sizeLabel}`;
}

function takeLinks(items, labelFor) {
  return items.slice(0, THIN_LINK_LIMIT).map(labelFor);
}

function recallBits(row) {
  const verb = recallWording(row.filer, row.manufacturers) === "made-by" ? "made by" : "recall filed by";
  return `${row.campaign}, reported ${formatUtcDate(row.reportDate)}, ${formatNumber(row.units)} units, ${verb} ${row.filer}`;
}

function safetyCounts(row) {
  const parts = [
    `${formatNumber(row.complaintsCount || 0)} ${noun(row.complaintsCount || 0, "complaint")}`,
    `${formatNumber(row.recallsCount || 0)} ${noun(row.recallsCount || 0, "recall")}`,
    `${formatNumber(row.investigationsCount || 0)} ${noun(row.investigationsCount || 0, "investigation")}`,
    `${formatNumber(row.manufacturerCommunicationsCount || 0)} ${noun(row.manufacturerCommunicationsCount || 0, "manufacturer communication")}`,
  ];
  return joinList(parts);
}

function gradesSentence(line, row) {
  const wear = row.wearN > 0 ? `Treadwear is ${row.wearN}` : "Treadwear is not reported as a usable number";
  const trac = USUAL_TRACTION.includes(row.trac) ? `traction is ${row.trac}` : `traction is ${quote(row.trac || "")}, outside AA, A, B, and C`;
  const temp = USUAL_TEMPERATURE.includes(row.temp)
    ? `temperature is ${row.temp}`
    : `temperature is ${quote(row.temp || "")}, outside A, B, and C`;
  const construction = row.construction ? `, with ${row.construction} construction` : "";
  return `NHTSA lists one grade row for ${line.brand} ${line.line}. The size text is ${quote(cleanSize(row.size))}. ${wear}, ${trac}, and ${temp}${construction}.`;
}

function meaningSentence(line, row, counts) {
  const wear = row.wearN > 0
    ? `treadwear ${row.wearN} (${formatNumber(counts.wearRows.get(row.wearN) || 0)} of ${formatNumber(counts.positiveWearRows)} rows with a positive whole-number treadwear)`
    : "no usable treadwear number";
  const trac = USUAL_TRACTION.includes(row.trac)
    ? `traction ${row.trac} (${formatNumber(counts.tractionRows.get(row.trac) || 0)} rows)`
    : `traction ${quote(row.trac || "")}, outside AA, A, B, and C`;
  const temp = USUAL_TEMPERATURE.includes(row.temp)
    ? `temperature ${row.temp} (${formatNumber(counts.temperatureRows.get(row.temp) || 0)} rows)`
    : `temperature ${quote(row.temp || "")}, outside A, B, and C`;
  return `${line.brand} ${line.line} lists ${wear}, ${trac}, and ${temp}. Treadwear compares wear on the government test course under 49 CFR 575.104. It is not miles and not a mileage warranty. Traction is the wet straight-line braking grade, ordered AA, then A, then B, then C. Temperature is the laboratory heat grade, ordered A, then B, then C.`;
}

export function buildThinIndex(lines, { plants = [], recallSummary = null } = {}) {
  const list = lines || [];
  const byBrand = new Map();
  for (const line of list) {
    if (!byBrand.has(line.brandSlug)) byBrand.set(line.brandSlug, []);
    byBrand.get(line.brandSlug).push(line);
  }

  const brands = new Map();
  for (const [slug, brandLines] of byBrand) {
    let multi = 0;
    let missing = 0;
    for (const line of brandLines) {
      if (singleWearOn(line.rows) != null) continue;
      if (line.rows.some((row) => row.wearN > 0)) multi += 1;
      else missing += 1;
    }
    brands.set(slug, {
      lines: brandLines,
      wear: histogram(brandLines, (line) => singleWearOn(line.rows)),
      traction: histogram(brandLines, (line) => singleLetterOn(line.rows, "trac", TRACTION_ORDER)),
      temperature: histogram(brandLines, (line) => singleLetterOn(line.rows, "temp", TEMPERATURE_ORDER)),
      excludedWear: { multi, missing },
    });
  }

  const fileWear = histogram(list, (line) => singleWearOn(line.rows));
  const wearRows = new Map();
  const tractionRows = new Map();
  const temperatureRows = new Map();
  let positiveWearRows = 0;
  let totalRows = 0;
  const sizeTokens = new Map();
  const sizeTexts = new Map();

  for (const line of list) {
    const buckets = new Map();
    for (const row of line.rows) {
      totalRows += 1;
      if (row.wearN > 0) {
        positiveWearRows += 1;
        wearRows.set(row.wearN, (wearRows.get(row.wearN) || 0) + 1);
      }
      if (TRACTION_ORDER.includes(row.trac)) tractionRows.set(row.trac, (tractionRows.get(row.trac) || 0) + 1);
      if (TEMPERATURE_ORDER.includes(row.temp)) temperatureRows.set(row.temp, (temperatureRows.get(row.temp) || 0) + 1);

      const parsed = parsePublishedSize(row.size);
      if (parsed) {
        const key = `token:${parsed.token}`;
        if (!buckets.has(key)) buckets.set(key, { map: sizeTokens, id: parsed.token, kind: parsed.kind, rows: [] });
        buckets.get(key).rows.push(row);
        continue;
      }
      const textKey = sizeTextKey(row.size);
      if (!textKey) continue;
      const key = `text:${textKey}`;
      if (!buckets.has(key)) buckets.set(key, { map: sizeTexts, id: textKey, kind: "text", rows: [] });
      buckets.get(key).rows.push(row);
    }
    for (const bucket of buckets.values()) {
      if (!bucket.map.has(bucket.id)) bucket.map.set(bucket.id, { kind: bucket.kind, members: [] });
      bucket.map.get(bucket.id).members.push({
        line,
        wear: singleWearOn(bucket.rows),
      });
    }
  }

  return {
    lines: list,
    brands,
    fileWear,
    fileExcluded: list.length - fileWear.rankable.length,
    counts: { wearRows, tractionRows, temperatureRows, positiveWearRows, totalRows },
    sizeTokens,
    sizeTexts,
    plants,
    recallSummary,
  };
}

function sizeGroup(index, row) {
  const parsed = parsePublishedSize(row.size);
  if (parsed) {
    const group = index.sizeTokens.get(parsed.token);
    return {
      kind: parsed.kind,
      token: parsed.token,
      members: group?.members || [],
      label: parsed.token,
    };
  }
  const textKey = sizeTextKey(row.size);
  if (!textKey) return { kind: "unspecified", token: "", members: [], label: "" };
  const group = index.sizeTexts.get(textKey);
  return { kind: "text", token: textKey, members: group?.members || [], label: cleanSize(row.size) };
}

function wearRankSentence(line, placement, subject, extra) {
  const place = placeSentence(placement.wear, placement, subject);
  const lead = `For ${line.brand} ${line.line}, ${place.charAt(0).toLowerCase()}${place.slice(1)}`;
  return [lead, wearDetail(placement), extra].filter(Boolean).join(" ");
}

function brandWearText(line, brand) {
  const wear = singleWearOn(line.rows);
  if (wear == null) {
    return `${line.brand} ${line.line} has no usable treadwear number, so it is not ranked among ${line.brand} lines.`;
  }
  const placement = numericPlacement(brand.wear.counts, wear);
  if (placement.n < 2) {
    return `${line.brand} ${line.line} is the only ${line.brand} line with one usable treadwear number, so no treadwear rank is computed.`;
  }
  const extra = excludedWearSentence(brand.excludedWear.multi, brand.excludedWear.missing, placement.n);
  return wearRankSentence(line, placement, `${line.brand} lines with one usable treadwear number`, extra);
}

function fileWearText(line, index) {
  const wear = singleWearOn(line.rows);
  if (wear == null) return "";
  const placement = numericPlacement(index.fileWear.counts, wear);
  if (placement.n < 2) return "";
  const excluded = index.fileExcluded
    ? `${formatNumber(index.fileExcluded)} ${noun(index.fileExcluded, "line")} ${index.fileExcluded === 1 ? "does" : "do"} not have one usable treadwear number, so ${index.fileExcluded === 1 ? "it is" : "they are"} not in the ${formatNumber(placement.n)}.`
    : "";
  return [wearRankSentence(line, placement, "lines in NHTSA's published UTQG list with one usable treadwear number", excluded), LOOSE_COMPARE]
    .filter(Boolean)
    .join(" ");
}

function sizeTextFor(line, row, group) {
  if (group.kind === "unspecified") {
    return `None grouped by size for ${line.brand} ${line.line}. The size text on its one row is ${quote(cleanSize(row.size))}. That text does not contain a metric or flotation size, and it is not a repeated specific size string shared with another line.`;
  }
  const rankable = group.members.filter((member) => member.wear != null);
  const brands = new Set(group.members.map((member) => member.line.brandSlug));
  const what = group.kind === "text" ? "that size text" : group.label;
  const publishes = `${formatNumber(group.members.length)} ${noun(group.members.length, "line")} ${group.members.length === 1 ? "publishes" : "publish"} ${what}.`;
  const subject = group.kind === "text"
    ? `lines that match the size text ${quote(cleanSize(row.size))} aside from spaces and letter case and have one usable treadwear number on that size`
    : `lines that publish ${group.label} and have one usable treadwear number on that size`;
  const own = group.members.find((member) => member.line.url === line.url);
  const wear = own?.wear ?? null;
  if (wear == null) {
    return `${line.brand} ${line.line} publishes ${what}, and that size does not have one usable treadwear number, so no rank is computed. ${publishes}`;
  }
  if (rankable.length < 2) {
    return `${line.brand} ${line.line} is the only line with one usable treadwear number on ${what}. ${publishes} No rank is computed.`;
  }
  const counts = new Map();
  for (const member of rankable) counts.set(member.wear, (counts.get(member.wear) || 0) + 1);
  const placed = numericPlacement(counts, wear);
  const excludedCount = group.members.length - rankable.length;
  const excluded = excludedCount
    ? `${formatNumber(excludedCount)} ${noun(excludedCount, "line")} ${excludedCount === 1 ? "publishes" : "publish"} this size without one usable treadwear number on it, so ${excludedCount === 1 ? "that line is" : "those lines are"} not in the ${formatNumber(placed.n)}.`
    : "";
  const mix = brands.size > 1
    ? `The ${formatNumber(group.members.length)} lines are from ${formatNumber(brands.size)} brands. ${LOOSE_COMPARE}`
    : "";
  return [wearRankSentence(line, placed, subject, excluded), mix].filter(Boolean).join(" ");
}

function siblingBlock(line, brandLines) {
  const others = brandLines.filter((item) => item.url !== line.url);
  const target = singleWearOn(line.rows);
  const ordered = [...others].sort(byDistance(target, (item) => singleWearOn(item.rows), lineNameOrder));
  const links = takeLinks(ordered, (item) => ({ href: item.url, label: `${item.brand} ${item.line}, ${lineWearText(item)}` }));
  if (!others.length) {
    return {
      text: `${line.brand} ${line.line} is the only ${line.brand} line in this file, so there is no sibling line to link.`,
      links,
      compareHref: "",
      compareName: "",
    };
  }
  const how = target == null
    ? "ordered by line name because this row has no usable treadwear number"
    : `ordered by the smallest absolute difference from treadwear ${target}. Ties use the line name, A to Z`;
  const label = `other ${line.brand} ${noun(others.length, "line")}`;
  const closest = target == null ? null : ordered.find((item) => singleWearOn(item.rows) != null);
  return {
    text: listedSentence(links.length, others.length, label, how),
    links,
    compareHref: closest ? compareToolHref([`${line.brandSlug}/${line.lineSlug}`, `${closest.brandSlug}/${closest.lineSlug}`]) : "",
    compareName: closest ? `${closest.brand} ${closest.line}` : "",
  };
}

function peerBlocks(line, row, group) {
  const empty = { peerText: "", peerLinks: [], sameSizeText: "", sameSizeLinks: [] };
  if (group.kind === "unspecified") return empty;
  const target = singleWearOn([row]);
  const others = group.members.filter((member) => member.line.url !== line.url);
  const otherBrands = others.filter((member) => member.line.brandSlug !== line.brandSlug);
  const sameBrand = others.filter((member) => member.line.brandSlug === line.brandSlug);
  const sizeLabel = group.kind === "text" ? `the size text ${quote(cleanSize(row.size))}` : group.label;
  if (!others.length) {
    return { peerText: `No other line publishes ${sizeLabel}.`, peerLinks: [], sameSizeText: "", sameSizeLinks: [] };
  }
  const sortMembers = (members) => [...members].sort(byDistance(target, (member) => member.wear, memberNameOrder));
  const linkFor = (member) => ({
    href: member.line.url,
    label: `${member.line.brand} ${member.line.line}, ${member.wear == null ? "no usable treadwear number on this size" : `treadwear ${member.wear}`}`,
  });
  const peerLinks = takeLinks(sortMembers(otherBrands), linkFor);
  const sameSizeLinks = takeLinks(sortMembers(sameBrand), linkFor);
  const how = target == null
    ? "ordered by name because this row has no usable treadwear number on the size"
    : `ordered by the smallest absolute difference from treadwear ${target} on that size. Ties use the brand name, then the line name`;
  const sameNote = sameBrand.length
    ? ` ${formatNumber(sameBrand.length)} other ${line.brand} ${noun(sameBrand.length, "line")} also ${sameBrand.length === 1 ? "publishes" : "publish"} it.`
    : "";
  return {
    peerText: otherBrands.length
      ? `${listedSentence(peerLinks.length, otherBrands.length, publishingLabel(otherBrands.length, "other-brand", sizeLabel), how)}${sameNote}`
      : `No other brand publishes ${sizeLabel}. ${formatNumber(sameBrand.length)} other ${line.brand} ${noun(sameBrand.length, "line")} ${sameBrand.length === 1 ? "does" : "do"}.`,
    peerLinks,
    sameSizeText: sameBrand.length
      ? listedSentence(sameSizeLinks.length, sameBrand.length, publishingLabel(sameBrand.length, `other ${line.brand}`, sizeLabel), how)
      : "",
    sameSizeLinks,
  };
}

function recallBlock(line, row, recalls) {
  const id = Number.isInteger(row.id) ? ` The ratings row id is ${row.id}.` : "";
  const counts = `The ratings row lists ${safetyCounts(row)}.${id} Those counts are separate from the tire-recall file. A stored count is not a safety finding, and a match or a missing row in the tire-recall file is not a safety finding.`;
  if (!recalls.length) {
    return {
      text: `None found in the tire-recall file for ${line.brand} ${line.line}. The match is the full brand and the full line. Letter case and extra spaces are ignored, and punctuation is not. ${counts}`,
      rows: [],
      filingsHref: "",
    };
  }
  const bits = recalls.map(recallBits);
  const rows = recalls.map((item) => ({
    campaign: item.campaign,
    href: nhtsaCampaignUrl(item.campaign),
    reportDate: item.reportDate,
    reportLabel: formatUtcDate(item.reportDate),
    filer: item.filer,
    unitsLabel: formatNumber(item.units),
    note: recallStatement(item).text,
  }));
  return {
    text: `The tire-recall file has ${formatNumber(recalls.length)} ${noun(recalls.length, "row")} for ${line.brand} ${line.line}: ${bits.join("; ")}. Units are the campaign total, not a count for this line. The match is the full brand and the full line. Letter case and extra spaces are ignored, and punctuation is not. ${counts}`,
    rows,
    filingsHref: `/who-makes-it/#${recallAnchor(recalls[0].brand)}`,
  };
}

function plantBlock(line, recalls, plants) {
  if (!recalls.length) {
    return {
      text: `No DOT plant code is stored on the UTQG row for ${line.brand} ${line.line}. A plant is listed only when a recall row for this line names a company that matches a plant registrant. None found.`,
      rows: [],
    };
  }
  const matched = plantsMatchingFilings(plants, recalls);
  if (!matched.length) {
    return {
      text: `The recall rows for ${line.brand} ${line.line} name a company, and no plant registrant matches that company. None found. A plant record has no brand field.`,
      rows: [],
    };
  }
  return {
    text: `Plant codes are listed because a recall row for ${line.brand} ${line.line} names a company that matches the registrant. The match does not say the plant made the line.`,
    rows: matched.map((plant) => ({
      code: plant.code,
      url: plant.url,
      name: plant.name,
      city: plant.city || "Not reported",
      country: plant.country || "Not reported",
      status: plant.status || "Not reported",
      matchedCompany: plant.matchedCompany,
    })),
  };
}

function comparisonSentence(line, brand, index) {
  const wear = singleWearOn(line.rows);
  if (wear == null) return "";
  const brandPlacement = numericPlacement(brand.wear.counts, wear);
  if (brandPlacement.n >= 2) return placeSentence(wear, brandPlacement, `${line.brand} lines with one usable treadwear number`);
  const filePlacement = numericPlacement(index.fileWear.counts, wear);
  if (filePlacement.n >= 2) return placeSentence(wear, filePlacement, "lines in NHTSA's published UTQG list with one usable treadwear number");
  return "";
}

function letterBlock(line, brand, kind, field, order, orderText) {
  const letter = singleLetterOn(line.rows, field, order);
  const histogramName = kind === "traction" ? brand.traction : brand.temperature;
  if (letter == null) {
    const published = line.rows[0]?.[field] ?? "";
    return `${kind[0].toUpperCase()}${kind.slice(1)} on the ${line.brand} ${line.line} row is ${quote(published)}, outside the usual grades, so it is not placed in the ${kind} order.`;
  }
  const placement = letterPlacement(histogramName.counts, letter, order);
  if (placement.n < 2) {
    return `${line.brand} ${line.line} is the only ${line.brand} line with one usual ${kind} grade, ${letter}, so no ${kind} rank is computed.`;
  }
  const extra = letterExcluded(brand.lines.length, placement, line.brand, kind);
  return [letterSentence(line, kind, placement, `${line.brand} lines`, orderText), extra].filter(Boolean).join(" ");
}

export function describeThinLine(line, index) {
  if (!isThinLine(line) || !index) return null;
  const row = line.rows[0];
  const brand = index.brands.get(line.brandSlug) || {
    lines: [line],
    wear: histogram([line], (item) => singleWearOn(item.rows)),
    traction: histogram([line], (item) => singleLetterOn(item.rows, "trac", TRACTION_ORDER)),
    temperature: histogram([line], (item) => singleLetterOn(item.rows, "temp", TEMPERATURE_ORDER)),
    excludedWear: { multi: 0, missing: singleWearOn(line.rows) == null ? 1 : 0 },
  };
  const group = sizeGroup(index, row);
  const siblings = siblingBlock(line, brand.lines);
  const peers = peerBlocks(line, row, group);
  const recalls = recallRowsForLine(line, index.recallSummary);
  const recall = recallBlock(line, row, recalls);
  const plants = plantBlock(line, recalls, index.plants || []);
  const parsed = parsePublishedSize(row.size);
  const shownSize = cleanSize(row.size);
  const intro = parsed
    ? `NHTSA published one grade row for ${line.brand} ${line.line}. The size text is ${quote(shownSize)}. The size read from that text is ${parsed.token}.`
    : `NHTSA published one grade row for ${line.brand} ${line.line}. The size text is ${quote(shownSize)}.`;
  const brandFaq = faq(
    `Where does ${line.brand} ${line.line} treadwear sit among ${line.brand} lines?`,
    brandWearText(line, brand),
  );
  const sizeFaq = faq(`Which lines publish the same size as ${line.brand} ${line.line}?`, sizeTextFor(line, row, group));
  const recallFaq = faq(`Does the tire-recall file name ${line.brand} ${line.line}?`, recall.text);
  const gradesFaq = faq(`What grades does NHTSA list for ${line.brand} ${line.line}?`, gradesSentence(line, row));
  const tractionText = letterBlock(line, brand, "traction", "trac", TRACTION_ORDER, "AA, then A, then B, then C");
  const temperatureText = letterBlock(line, brand, "temperature", "temp", TEMPERATURE_ORDER, "A, then B, then C");
  const fileText = fileWearText(line, index);
  const meaningText = meaningSentence(line, row, index.counts);
  return {
    intro,
    comparisonSentence: comparisonSentence(line, brand, index),
    brandUrl: `/brands/${line.brandSlug}/`,
    brandName: line.brand,
    lineName: `${line.brand} ${line.line}`,
    brand: brandFaq,
    tractionText,
    temperatureText,
    fileText,
    size: sizeFaq,
    siblingText: siblings.text,
    siblingLinks: siblings.links,
    compareHref: siblings.compareHref,
    compareName: siblings.compareName,
    peerText: peers.peerText,
    peerLinks: peers.peerLinks,
    sameSizeText: peers.sameSizeText,
    sameSizeLinks: peers.sameSizeLinks,
    recall: recallFaq,
    recallRows: recall.rows,
    filingsHref: recall.filingsHref,
    plantText: plants.text,
    plantRows: plants.rows,
    grades: gradesFaq,
    meaningText,
    sources: plants.rows.length ? ["ratings", "recalls", "plants"] : ["ratings", "recalls"],
    faqs: [brandFaq, sizeFaq, recallFaq, gradesFaq],
  };
}
