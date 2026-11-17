import { ageSpan, ageTodaySentence, formatAgeSpan } from "./dot-age.js";
import { formatNumber, formatUtcDate, formatUtcDay, formatVerified, percent } from "./format.js";
import { formatTreadwearMedian, treadwearMedian } from "./answers.js";
import { ratingsTableHref } from "./ratings-table.js";
import { bandLabel, bandStart } from "./treadwear-numbers.js";
import { decodeTin, indexPlants } from "./tin.js";

/**
 * First-screen facts for the existing hubs. Every count is computed from
 * the committed rows passed in. These functions do not add routes.
 */

const TRACTION = ["AA", "A", "B", "C"];
const TEMPERATURE = ["A", "B", "C"];
const EXAMPLE_DATES = ["2319", "4416", "0109", "3524"];
const STAND_IN = "ABCDEF";

function noun(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function placeOf(plant) {
  return [plant.city, plant.state, plant.country].filter(Boolean).join(", ");
}

function usableWear(row) {
  return Number.isInteger(row.wearN) && row.wearN > 0;
}

export function hubFaqLd(faqs) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.name,
      acceptedAnswer: { "@type": "Answer", text: item.text },
    })),
  };
}

export function joinHubCopy(paragraphs, faqs = []) {
  return [...paragraphs, ...faqs.flatMap((item) => [item.name, item.text])].filter(Boolean).join("\n");
}

function letterCounts(rows, field, grades) {
  const counts = new Map(grades.map((grade) => [grade, 0]));
  let other = 0;
  for (const row of rows) {
    const value = String(row[field] ?? "").trim();
    if (counts.has(value)) counts.set(value, counts.get(value) + 1);
    else other += 1;
  }
  const items = grades.map((grade) => {
    const count = counts.get(grade);
    return {
      grade,
      count,
      share: percent(count, rows.length),
      href: field === "trac" ? ratingsTableHref({ traction: [grade] }) : ratingsTableHref({ temp: [grade] }),
    };
  });
  return {
    items,
    other: other ? { count: other, share: percent(other, rows.length) } : null,
  };
}

export function ratingsHubFacts(lines) {
  const list = lines || [];
  const rows = list.flatMap((line) => line.rows || []);
  const wears = [];
  const bands = new Map();
  const cells = new Map();
  let excludedWear = 0;
  for (const row of rows) {
    if (!usableWear(row)) {
      excludedWear += 1;
      continue;
    }
    wears.push(row.wearN);
    const start = bandStart(row.wearN);
    bands.set(start, (bands.get(start) || 0) + 1);
    const trac = TRACTION.includes(row.trac) ? row.trac : "other";
    const temp = TEMPERATURE.includes(row.temp) ? row.temp : "other";
    const key = `${start}|${trac}|${temp}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  wears.sort((a, b) => a - b);
  const median = treadwearMedian(wears);
  const bandRows = [...bands.keys()]
    .sort((a, b) => a - b)
    .map((start) => {
      const count = bands.get(start);
      const wearMin = start === 0 ? 1 : start;
      return {
        start,
        label: bandLabel(start),
        count,
        share: percent(count, wears.length),
        href: ratingsTableHref({ wearMin: String(wearMin), wearMax: String(start + 99) }),
      };
    });
  const bandTotal = bandRows.reduce((sum, row) => sum + row.count, 0);
  if (bandTotal !== wears.length) throw new Error(`Treadwear bands sum to ${bandTotal}, usable rows ${wears.length}`);
  const traction = letterCounts(rows, "trac", TRACTION);
  const temperature = letterCounts(rows, "temp", TEMPERATURE);
  const tractionTotal = traction.items.reduce((sum, row) => sum + row.count, 0) + (traction.other?.count || 0);
  const temperatureTotal = temperature.items.reduce((sum, row) => sum + row.count, 0) + (temperature.other?.count || 0);
  if (tractionTotal !== rows.length || temperatureTotal !== rows.length) {
    throw new Error("Grade letter counts do not match the row count");
  }
  return {
    rowCount: rows.length,
    lineCount: list.length,
    brandCount: new Set(list.map((line) => line.brandSlug || line.brand)).size,
    usableWear: wears.length,
    excludedWear,
    min: wears.length ? wears[0] : null,
    max: wears.length ? wears[wears.length - 1] : null,
    median,
    medianText: formatTreadwearMedian(median),
    bands: bandRows,
    traction,
    temperature,
    slice: {
      cells: [...cells.entries()].map(([key, count]) => {
        const [start, trac, temp] = key.split("|");
        return { start: Number(start), trac, temp, count };
      }),
    },
  };
}

export function ratingsCaptions(verifiedAt) {
  const when = formatVerified(verifiedAt);
  return {
    overview: `Counts from NHTSA's published UTQG list, verified ${when} (UTC). The median uses rows with a positive whole-number treadwear.`,
    bands: `Treadwear bands in NHTSA's published UTQG list, verified ${when} (UTC). Each band is 100 wide. Rows without a usable treadwear number are not in this table.`,
    traction: `Traction grades in NHTSA's published UTQG list, verified ${when} (UTC). Every grade row is counted. A value outside AA, A, B, and C is other.`,
    temperature: `Temperature grades in NHTSA's published UTQG list, verified ${when} (UTC). Every grade row is counted. A value outside A, B, and C is other.`,
  };
}

export function ratingsHubProse(facts) {
  const bandSentence = facts.bands.length
    ? `The file falls into ${noun(facts.bands.length, "treadwear band")}, from ${facts.bands[0].label} through ${facts.bands.at(-1).label}.`
    : "The file has no usable treadwear number to place in a band.";
  return [
    `The tables under the answer count the whole UTQG file three ways: treadwear in bands of one hundred, traction by letter, and temperature by letter. ${bandSentence} A band starts on a hundred and runs through the next ninety-nine grades. A row enters a band only when treadwear is a positive whole number. Blank treadwear, zero, and a value that is not a whole number stay out of the bands and out of the median. This file has ${noun(facts.usableWear, "usable treadwear row")} and ${noun(facts.excludedWear, "row")} left out of those bands.`,
    `Traction and temperature tables count every one of the ${noun(facts.rowCount, "grade row")}. A letter outside AA, A, B, and C for traction, or outside A, B, and C for temperature, is counted as other and is not treated as a usual grade. The median is the middle usable treadwear when that count is odd, and the mean of the two middle values when the count is even. On this file the median is ${facts.medianText}. It describes the published rows. It is not a grade to expect on a tire that has not been looked up, and it is not an ordering of brands.`,
    `Each band and each usual letter links into the row table with that limit filled in. The row table is built in the browser from the same published file. The counts in the summary tables are already in the page, so they remain if that row table does not run. A slice control, when the browser runs it, recounts rows that have a usable treadwear number and match the band and letters you pick. That recount uses the same usable rows as the band table. It does not add the ${noun(facts.excludedWear, "row")} the bands left out.`,
    `A tire-line page is one line and the size rows stored under it. This page is every line in the file at once: ${noun(facts.lineCount, "tire line")} across ${noun(facts.brandCount, "brand")}. A large count in a band means that many published rows fell in that hundred. It does not mean those tires are for sale, and it does not turn the band into a prediction of miles on a particular road. The treadwear guide explains the government course comparison. The traction guide explains the letters. The linked list beside them is the published rows at 700 or above with traction A or AA and temperature A.`,
    `Sorting the row table from high treadwear to low treadwear orders the published numbers. It does not rank brands, and a row does not say the tire is still sold. Size text is kept as published. A row is marked all sizes only when that text, with extra spaces collapsed, is all, all size, or all sizes. Any other size text stays size-specific. Invalid and suspect rows stay in the file when a filter hides them from the row table. Hiding a row here does not remove it from the NHTSA list this site loaded.`,
  ];
}

export function ratingsHubFaqs(facts) {
  const median = facts.median == null ? "not reported as a usable number" : facts.medianText;
  return [
    {
      name: "What is the median treadwear in this UTQG file?",
      text: `The median treadwear on rows with a usable number is ${median}. ${noun(facts.usableWear, "row")} enter that median. ${noun(facts.excludedWear, "row")} stay out because treadwear is blank, zero, or not a positive whole number.`,
    },
    {
      name: "How are the treadwear bands counted?",
      text: `Each band is 100 wide, the same grouping as the treadwear numbers guide. ${bandSentence(facts)} A link on a band opens the row table with that treadwear range filled in.`,
    },
    {
      name: "Do the traction and temperature counts cover every row?",
      text: `Yes. Traction and temperature tables count all ${noun(facts.rowCount, "grade row")}. Usual traction letters are AA, A, B, and C. Usual temperature letters are A, B, and C. Any other published value is counted as other.`,
    },
  ];
}

function bandSentence(facts) {
  if (!facts.bands.length) return "This file has no usable treadwear number to place in a band.";
  return `This file has ${noun(facts.bands.length, "band")}, from ${facts.bands[0].label} through ${facts.bands.at(-1).label}.`;
}

export function plantHubModel(plants, countries, defs, min) {
  const list = plants || [];
  const countryByKey = new Map((countries || []).map((country) => [country.key, country]));
  const members = new Map(defs.map((def) => [def.id, []]));
  const makerByCode = new Map();
  for (const plant of list) {
    const hits = defs.filter((def) => def.matches(plant.name));
    if (hits.length > 1) throw new Error(`Plant ${plant.code} matches ${hits.map((def) => def.id).join(" and ")}`);
    const id = hits.length === 1 ? hits[0].id : "";
    if (id) members.get(id).push(plant);
    makerByCode.set(plant.code, id);
  }
  const makers = defs
    .map((def) => {
      const group = members.get(def.id);
      const countryKeys = new Set(group.map((plant) => plant.countryKey || ""));
      return {
        id: def.id,
        label: def.linkLabel,
        rule: def.rule,
        count: group.length,
        countries: countryKeys.size,
        hubUrl: def.hub ? `/plants/manufacturer/${def.id}/` : "",
        crossUrl: `/plants/by-maker/#${def.id}`,
      };
    })
    .filter((row) => row.count >= min)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"));
  const published = new Set(makers.map((row) => row.id));
  let otherCount = 0;
  for (const plant of list) {
    const id = makerByCode.get(plant.code);
    const bucket = id && published.has(id) ? id : "other";
    if (bucket === "other") otherCount += 1;
    makerByCode.set(plant.code, bucket);
  }
  const publishedTotal = makers.reduce((sum, row) => sum + row.count, 0);
  if (publishedTotal + otherCount !== list.length) {
    throw new Error(`Maker counts sum to ${publishedTotal + otherCount}, plants ${list.length}`);
  }
  const byCountry = new Map();
  for (const plant of list) {
    const key = plant.countryKey || "";
    if (!byCountry.has(key)) byCountry.set(key, []);
    byCountry.get(key).push(plant);
  }
  const countryRows = [];
  for (const [key, group] of byCountry) {
    if (!key) {
      countryRows.push({ key: "", label: "Not stored", url: "", count: group.length });
      continue;
    }
    const country = countryByKey.get(key);
    if (!country) throw new Error(`No country page for ${key}`);
    if (country.count !== group.length) throw new Error(`Country ${key} count ${country.count} does not match ${group.length}`);
    countryRows.push({ key, label: country.label, url: country.url, count: group.length });
  }
  countryRows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"));
  const countryTotal = countryRows.reduce((sum, row) => sum + row.count, 0);
  if (countryTotal !== list.length) throw new Error(`Country counts sum to ${countryTotal}`);
  return { makers, countries: countryRows, otherCount, makerByCode, plantCount: list.length, min };
}

export function plantCaptions(verifiedAt) {
  const when = formatVerified(verifiedAt);
  return {
    makers: `Registered plant codes by maker name. A group is a registrant-name match with at least the published minimum. NHTSA's plant list was verified ${when} (UTC). Counts include closed and historic codes.`,
    countries: `Registered plant codes by country. Strings that differ by letter case, spelling, or a stored alias are one country. NHTSA's plant list was verified ${when} (UTC).`,
    plants: `NHTSA equipment plant codes, verified ${when} (UTC). Former codes are on the same record as the current code. The status field is the value vPIC stored.`,
  };
}

export function plantHubProse(model) {
  const top = model.makers[0];
  const topSentence = top
    ? `${top.label} is the largest published name group on this page, with ${noun(top.count, "registered code")} across ${noun(top.countries, "country", "countries")}.`
    : "No registrant-name group meets the minimum for a maker row.";
  return [
    `This index is the full equipment plant list, ${noun(model.plantCount, "record")}, with maker totals and country totals counted from those same records. ${topSentence} A maker row is a name match on the registrant. It is not that company's own list of factories, and a closed or historic code stays in the count. ${noun(model.otherCount, "record")} sit outside the published name groups and remain in the plant table under other registered names. The country table has ${noun(model.countries.length, "row")}. Those rows group country strings that belong together, including differences of letter case and aliases stored in the file.`,
    `The menus under the totals filter the plant table. They do not change the totals. Choosing a maker leaves the country menu free, so one name group can be limited to one country. Clearing both menus shows the full list again. The search box looks at the code, a former two-symbol code, the registrant, and the city. The status menu uses the status text stored on the record. Active in that menu is the stored word. It is not a survey of which plants are operating.`,
    `Without the browser script, every plant row stays visible and the menus do not hide anything. The totals, the country links, and the plant pages still work. With the script, a hidden row is still in the page. It is not deleted from the file. A former two-symbol code is a column, not a second page. The link on the current code opens the one record that carries both. If a sidewall shows only the older code, search that older code here and open the record it points at.`,
    `A plant page is one code, one registrant, and one address. This page is how the codes add up: which published name groups are large, which countries hold the records, and which code you meant. The cross-tab linked from each maker row is that name group split by country. It does not add codes that are absent from this table. A registration names the company on the record at the time of registration. It does not list brands, and it does not show where a given tire was made.`,
    `Use the maker total when the question is how many records carry a company name. Use the country total when the question is how many records share a country string. Use the plant table when the question is one code. The three views are the same file. A refresh of the NHTSA list can change a count, which is why the figures are computed when the site is built and are not typed in by hand.`,
  ];
}

export function plantHubFaqs(model) {
  const groups = noun(model.makers.length, "published maker group");
  return [
    {
      name: "How many plant codes are in each maker group?",
      text: `This page publishes ${groups} because each one matches at least ${formatNumber(model.min)} registrant names. ${noun(model.otherCount, "record")} are outside those groups. A group is a name match, including closed and historic codes, and it is not a company's own factory list.`,
    },
    {
      name: "How many plant codes are in each country?",
      text: `The country table counts all ${noun(model.plantCount, "record")} across ${noun(model.countries.length, "country row")}. Country strings that differ by letter case, spelling, or a stored alias are one row. A blank country stays in its own row when the file has one.`,
    },
    {
      name: "Does the maker filter remove records from the file?",
      text: "No. The maker, country, and status menus hide rows in the browser. Without that script the plant table lists every record. The count tables above the filter are the full file either way.",
    },
  ];
}

export function brandHubRows(profiles) {
  const list = profiles || [];
  const showPlants = list.some((profile) => profile.plants.length > 0);
  const rows = list
    .map((profile) => ({
      slug: profile.slug,
      name: profile.name,
      url: profile.url,
      letter: profile.indexLetter,
      lineCount: profile.lineCount,
      folded: profile.singleLine ? `${profile.singleLine.name}` : "",
      median: profile.median,
      medianText: profile.medianText,
      plants: profile.plants.map((plant) => ({ code: plant.code, url: plant.url })),
      plantCount: profile.plants.length,
      campaignCount: profile.campaignCount,
      recallHref: profile.campaignCount ? `${profile.url}#recalls` : "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug));
  return {
    showPlants,
    plantColumn: showPlants ? "linked" : "omitted",
    plantColumnReason: showPlants
      ? "Plant codes are listed when the registrant name begins with the brand after capitalization, punctuation, and a legal suffix are set aside."
      : "No brand in this file has a registrant name that begins with the brand under that rule, so the plant-code column is omitted.",
    rows,
    brands: rows.length,
    lines: rows.reduce((sum, row) => sum + row.lineCount, 0),
    withPlants: rows.filter((row) => row.plantCount).length,
    plantCodes: rows.reduce((sum, row) => sum + row.plantCount, 0),
    withRecalls: rows.filter((row) => row.campaignCount).length,
    campaigns: rows.reduce((sum, row) => sum + row.campaignCount, 0),
    withMedian: rows.filter((row) => row.median != null).length,
  };
}

export function brandCaption(model, verifiedAt, recallsRetrievedAt) {
  const when = formatVerified(verifiedAt);
  const recalls = formatVerified(recallsRetrievedAt);
  const plants = model.showPlants
    ? " Plant codes use the registrant-name rule and include closed and historic codes."
    : " The plant-code column is omitted because no registrant name met the rule.";
  return `UTQG brands, tire lines, and median treadwear in NHTSA's published list, verified ${when} (UTC). Recall campaigns are brand-string matches in the tire-recall file retrieved ${recalls} (UTC).${plants}`;
}

export function brandHubProse(model) {
  const plantSentence = model.showPlants
    ? `The plant-code column is filled for ${noun(model.withPlants, "brand")} and lists ${noun(model.plantCodes, "plant code")} in all. ${model.plantColumnReason} An empty cell means this file did not produce a match. It does not mean the brand has no factory, and a matched code does not mean that plant builds every tire of the brand.`
    : model.plantColumnReason;
  return [
    `Each row is one brand string in the UTQG file after spellings that differ only by capitalization or punctuation have been merged. This table has ${noun(model.brands, "brand")} and ${noun(model.lines, "tire line")}. Tire lines graded is the number of line names under that string. Median treadwear uses the size rows under those lines. ${noun(model.withMedian, "brand")} have a median. A brand with no positive whole-number treadwear shows no median. Sorting that column orders the file by the middle of each brand. A single size row with a high number does not set the median by itself when the brand has more rows.`,
    plantSentence,
    `Recall campaigns are counted for ${noun(model.withRecalls, "brand")}, ${noun(model.campaigns, "campaign")} in all. The count is campaigns whose brand string matches the row after capitalization and punctuation are removed. It is not a count of recalled lines and it is not units. Open the brand page for the campaign list. A zero means the recall file has no row for that brand string. It does not mean every tire sold under a similar name was outside a recall, because a report can use a different brand string.`,
    `The table sorts in the browser. Without that script it stays in brand-name order, which is also how the letter links are arranged. A brand with one tire line still has a row, and that line name is shown under the brand. This index does not order brands by quality. A higher median is a higher middle grade in the published file. Grades are assigned by the manufacturer under the UTQG procedure. The ratings file does not say which lines are still sold.`,
    `Use a brand page for the size rows, the traction and temperature shares, and the recall lines. Use this table to see every brand at once: how many lines were graded, where the middle treadwear sits, which plant codes the name rule produced, and whether the recall file uses that brand string. Shared line names across brands are not evidence of rebadging. This table does not pair those names.`,
  ];
}

export function brandHubFaqs(model) {
  return [
    {
      name: "What does median treadwear mean on this table?",
      text: `It is the middle usable treadwear among the size rows of that brand. ${noun(model.withMedian, "brand")} have one. A brand with no positive whole-number treadwear has no median. The median is not a ranking and it is not a promise about a tire that is not in the row.`,
    },
    {
      name: "When does a brand row list plant codes?",
      text: model.showPlants
        ? `${model.plantColumnReason} ${noun(model.withPlants, "brand")} have at least one code, ${noun(model.plantCodes, "code")} in all. A name that also matches another brand is left off.`
        : model.plantColumnReason,
    },
    {
      name: "What is the recall campaign count?",
      text: `${noun(model.withRecalls, "brand")} match at least one tire-recall campaign by brand string, ${noun(model.campaigns, "campaign")} in all. The match is the brand string after capitalization and punctuation are removed. It does not say the graded tire is the recalled tire.`,
    },
  ];
}

function utcDay(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error("Decoder examples need a date");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function readExample(plant, code, middle, date, format, index, day) {
  const tin = ["DOT", code, middle, date].filter(Boolean).join(" ");
  const result = decodeTin(tin, index, day);
  if (result.format !== format || result.matches.length !== 1) return null;
  const match = result.matches[0];
  if (match.code.toUpperCase() !== plant.code.toUpperCase()) return null;
  if (format === "old-two-symbol" && match.matchedOn !== "old") return null;
  if (format !== "old-two-symbol" && match.matchedOn !== "current") return null;
  const candidate = result.date?.style === "four" && result.date.candidates.length === 1 ? result.date.candidates[0] : null;
  if (!candidate?.validWeek || candidate.age?.future) return null;
  if (candidate.week !== Number(date.slice(0, 2)) || candidate.year !== 2000 + Number(date.slice(2))) return null;
  const span = formatAgeSpan(ageSpan(candidate.start, candidate.end, day));
  const notes = {
    "new-13": "The six symbols between the plant code and the date are a stand-in, not a manufacturer code copied from a tire.",
    "retread-7": "Seven symbols is the length in the retread rule. This example does not say a tire from this plant was retreaded.",
    "old-two-symbol": "The two-symbol code is the former code stored on the current plant record.",
  };
  const labels = {
    "new-13": "13-symbol new-tire length",
    "retread-7": "7-symbol retread length",
    "old-two-symbol": "Former two-symbol plant code",
  };
  return {
    tin,
    plantCode: code,
    currentCode: plant.code,
    plantUrl: plant.url,
    plantName: plant.name,
    place: placeOf(plant),
    countryKey: plant.countryKey || plant.country || "",
    layout: format,
    layoutLabel: labels[format],
    week: candidate.week,
    year: candidate.year,
    startLabel: formatUtcDay(candidate.start),
    endLabel: formatUtcDay(candidate.end),
    ageText: ageTodaySentence(span),
    note: notes[format],
  };
}

function eligibleCurrent(plants) {
  return plants
    .filter((plant) => String(plant.code || "").trim().length === 3 && plant.url && plant.name && plant.country && plant.city)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)) || String(a.url).localeCompare(String(b.url)));
}

export function buildDecoderExamples(plants, now = new Date()) {
  const day = utcDay(now);
  const index = indexPlants(plants);
  const current = eligibleCurrent(plants);
  const used = new Set();
  const usedCountries = new Set();

  function pick(format, date, middle) {
    const pool = current.filter((plant) => !used.has(plant.code));
    const passes = [pool.filter((plant) => !usedCountries.has(plant.countryKey || plant.country)), pool];
    for (const group of passes) {
      for (const plant of group) {
        const example = readExample(plant, String(plant.code).toUpperCase(), middle, date, format, index, day);
        if (!example) continue;
        used.add(plant.code);
        usedCountries.add(plant.countryKey || plant.country);
        return example;
      }
    }
    return null;
  }

  const examples = [
    pick("new-13", EXAMPLE_DATES[0], STAND_IN),
    pick("new-13", EXAMPLE_DATES[1], STAND_IN),
    pick("retread-7", EXAMPLE_DATES[2], ""),
  ].filter(Boolean);

  const formers = plants
    .filter(
      (plant) =>
        String(plant.oldCode || "").trim().length === 2 &&
        !(plant.oldCodeSharedWith || []).length &&
        plant.url &&
        !used.has(plant.code),
    )
    .sort((a, b) => String(a.oldCode).localeCompare(String(b.oldCode)) || String(a.code).localeCompare(String(b.code)));
  for (const plant of formers) {
    const example = readExample(
      plant,
      String(plant.oldCode).trim().toUpperCase(),
      "ABCD",
      EXAMPLE_DATES[3],
      "old-two-symbol",
      index,
      day,
    );
    if (!example) continue;
    examples.push(example);
    break;
  }

  if (examples.length < 3 || examples.length > 4) {
    throw new Error(`Decoder examples: ${examples.length}`);
  }
  const asOfIso = day.toISOString().slice(0, 10);
  return { asOfIso, asOfLabel: formatUtcDate(asOfIso), examples };
}

export function decoderHubProse(report) {
  const layouts = report.examples.map((example) => example.layoutLabel).join(", ");
  return [
    `This page is where a whole tire identification number is read against the plant list loaded on the site. Paste the code into the box, keep the DOT mark if it is molded in front, and keep or drop the spaces you see on the sidewall. The box does not send the code anywhere. The plant list is the file already published here, and the manufacture week is calculated from the digits at the end. The worked table under the box has ${noun(report.examples.length, "reading")} built from plant codes in that file: ${layouts}.`,
    `Each worked row uses a real plant code, links to that plant page, and states the week, the year, and the age of that production week on ${report.asOfLabel} (UTC). Where a row has six symbols between the plant code and the date, those symbols are a stand-in so the length matches a current new tire. They are not copied from a tire, and this site cannot say what a manufacturer meant by them. A seven-symbol row is only the plant code and the date, which is the length the retread rule uses. That length does not prove a tire from the plant was retreaded. A former two-symbol code, when the file has one that maps to a single current record, is read from the old-code field.`,
    `Age is a range because the date code names a week, not a day. The week runs from Sunday through Saturday under the tire identification rule, and it is not an ISO week. The younger end of the range is the Saturday and the older end is the Sunday. The worked table fixes that comparison on ${report.asOfLabel} (UTC), the day this page was built. After you decode a code in the box, the age uses the clock in your browser, so it can move forward after the build. An optional purchase or install date is a second comparison. It does not replace the manufacture week, and the calendar file built from that week stays in the browser.`,
    `A match names the company on the plant record and the place stored with that record. It does not name the brand printed on the tire, it does not name the tire line, and it does not say the tire is in a recall. The same factory can mold more than one brand, and the company on a plant record can differ from the brand owner. The guide linked beside the table is the page that stays with that limit. This decoder calculates a date. It does not tell you to keep a tire in service or to take it off.`,
    `Open a plant page when you already know the code and want the registrant, the city, and the country. Open the date-code guide when you want the diagram of the last four digits without running a number. Use this page when the full string is in front of you and you want the plant and the week together. A code the list does not contain is reported as absent from the loaded file. That result is a gap in the file, not a finding that the molding is wrong. Partial numbers from the opposite sidewall, three-digit dates, and the 1990s triangle are explained further down the page, with the regulation citations those cases rely on.`,
  ];
}

export function decoderHubFaqs(report) {
  const sample = report.examples[0];
  const sampleSentence = sample
    ? `One worked reading is ${sample.tin}, plant ${sample.currentCode}, week ${sample.week} of ${sample.year}.`
    : "The worked table is built from plant codes in the loaded file.";
  return [
    {
      name: "How do I decode a full DOT code on this page?",
      text: `Paste the tire identification number into the box and decode it. The result names the plant code, the manufacture week and year, and the age of that week today. ${sampleSentence} The worked rows stay readable if the browser does not run the box.`,
    },
    {
      name: "What does the age in the worked examples mean?",
      text: `It is the Sunday-through-Saturday production week compared with ${report.asOfLabel} (UTC). The age is a range across that week, not a single day, and it is not an ISO week. The box uses your browser's date when you decode a code of your own.`,
    },
    {
      name: "What can the plant code not tell me?",
      text: "A plant match names the registrant on that code. It does not name the brand on the sidewall, it does not list a tire line, and it does not say whether the tire is in a recall. The linked guide explains that limit.",
    },
  ];
}

export function recallsHubProse(report) {
  const span =
    report.earliest && report.latest
      ? `Report dates in this pull run from ${formatUtcDate(report.earliest)} through ${formatUtcDate(report.latest)}.`
      : "This pull has no report date to span.";
  return [
    `This page is the campaign index for the flat tire-recall file. It counts ${noun(report.campaignCount, "tire campaign")}, ${noun(report.rowCount, "brand and line row")}, ${noun(report.brandCount, "brand string")}, and ${noun(report.filerCount, "filing company")}, then lists every collapsed row. A who-makes page for one brand repeats the campaigns for that brand string and, when a registrant name matches a filing company, the plant records for that name. This index does not make that plant match. It keeps the campaign, the filer, the report date, and the units together so the file can be seen before a brand page is opened.`,
    `Units are the campaign total. The same total is stored on every line of that campaign, so adding the units column does not count tires. A row is one brand and one line on one campaign. It does not say every size of that line was named, and this snapshot lists a size only when a defect summary on the row contains one. ${span} Those dates are the dates NHTSA received the Part 573 report. The span is a property of this file. It is not a claim that every campaign in the span is still open.`,
    `The decoder linked from the TIN section reads a plant code and a date code. It does not look up a campaign, and this page does not take a TIN. Checking a tire means reading the identification number and using the USTMA lookup and the NHTSA recall search named here. A link from a recall brand string to a UTQG brand page is a match of the name after capitalization and spacing. It does not say the graded tire is the recalled tire. ${noun(report.linkedBrandRows, "row")} match a UTQG brand page that way, and ${noun(report.linkedLineRows, "row")} match a UTQG tire-line page.`,
    `Sort the table to gather a filer or a campaign. Without the script, the rows stay in report-date order with the newest date first. A missing units figure, if a later file has one, stays at the end of a units sort rather than being treated as zero. The count table above the rows is the full file. Filtering the row table does not change those counts. The field names in the questions under the table are the names in NHTSA's layout: CAMPNO, RCDATE, MFGNAME, POTAFF, MAKETXT, and MODELTXT.`,
    `Use this index when the question is which campaigns the file contains. Use a who-makes page when the question is which company filed for one brand. Use the decoder when the question is the plant code and the week on a sidewall. The three pages read different fields. None of them is a finding that a particular tire in a garage is inside a campaign, because a campaign row does not carry the identification number of each tire.`,
  ];
}

export function whoMakesHubProse(summary) {
  return [
    `This page answers a filing question: which company submitted the Part 573 report for a recalled line. It does not answer which factory built a tire that was never recalled. The counts are ${noun(summary.campaigns, "tire campaign")}, ${noun(summary.brands, "brand string")}, and ${noun(summary.lines, "recalled line")} after repeated rows for the same campaign, brand, and line are collapsed to one table row. On ${noun(summary.brandsWithDifferentFiler, "brand string")}, the filing company's name differs from the brand under the comparison this page uses. Abbreviations are left as written.`,
    `A row says made by only when the manufacturer field names the same company as the filer and the filer's name contains tire, tyres, tyre, or rubber, and the filer is not one of the importers or brand owners this page keeps as recall filed by. In this file, ${noun(summary.madeByRows, "row")} say made by and ${noun(summary.filedByRows, "row")} say recall filed by. The filing company is the company legally responsible for the report. It can be the factory, an importer, or the brand owner, and only for the recalled line named on that row.`,
    `Plant codes are not a column on this index. A plant record has a registrant and no brand field, so the table does not guess a maker from a plant code. A brand page can link a plant when the registrant matches a company named in that brand's filings. That match is the name. It is not proof the plant built the brand. The guide on what a DOT code can prove is the write-up of that limit. The campaign index lists the same recall rows by campaign and does not apply this made-by wording.`,
    `A brand gets its own page from this index only when the recall file names a filing company for it. A brand with no recall row is not given a maker by borrowing a plant code. Where this site has checked a brand and found no recall row, that brand is listed as unanswered, and the UTQG page, if there is one, stays a grades list. The filter on the table searches the brand, the line, the filer, and the campaign. The status line counts collapsed rows, not the raw tire-row total stored in the file header.`,
    `Read a row as one recalled line and one report. Do not read it as a description of the rest of the brand. A UTQG line with the same name is a string match, not evidence that the graded tire is the recalled tire, and this page does not use those grade-file matches to decide who made a tire. When the filer and the brand differ, the page says they differ. It does not fill in a parent company that the report did not name.`,
  ];
}
