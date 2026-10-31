import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  countryHubAnswer,
  countryIndexAnswer,
  manufacturerHubAnswer,
  manufacturerIndexAnswer,
  plantAnswer,
} from "../src/lib/answers.js";
import { catalog } from "../src/lib/catalog.js";
import { normalizeCountry } from "../src/lib/plant-countries.js";
import { groupsMatchingName } from "../src/lib/plant-groups.js";
import {
  countryHubs,
  countryNormalization,
  hubDataset,
  hubPaths,
  indexablePlantPaths,
  isThinPlantRecord,
  manufacturerGroupForBrand,
  manufacturerGroups,
  plantByCode,
  plantJsonLd,
  recallsForRegistrant,
  registrantKey,
  thinPlantPaths,
} from "../src/lib/plant-hubs.js";
import { breadcrumbList, schemaGraph } from "../src/lib/structured.js";

const FORBIDDEN = ["Product", "Review", "AggregateRating", "GovernmentOrganization"];

function assertSentences(sentences, where) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${where}: ${sentences.length} sentences`);
  for (const sentence of sentences) {
    assert.match(sentence, /[.!?]$/, `${where}: ${sentence}`);
    assert.doesNotMatch(sentence, /\bthe best\b/i, sentence);
    if (/\bhighest\b/i.test(sentence)) assert.match(sentence, /in NHTSA's published UTQG list/, sentence);
  }
}

function typesIn(nodes, found = new Set()) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const value = node["@type"];
    const list = Array.isArray(value) ? value : value ? [value] : [];
    for (const type of list) found.add(type);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) typesIn(child, found);
      else if (child && typeof child === "object") typesIn([child], found);
    }
  }
  return found;
}

test("country aliases collapse case, spelling, and parenthetical forms", () => {
  assert.equal(normalizeCountry("UNITED STATES (USA)").label, "United States");
  assert.equal(normalizeCountry("United States").label, "United States");
  assert.equal(normalizeCountry("USA").key, "united-states");
  assert.equal(normalizeCountry("P.R. CHINA").label, "China");
  assert.equal(normalizeCountry("CHINA").key, normalizeCountry("P.R. CHINA").key);
  assert.equal(normalizeCountry("AUSTRAILIA").label, "Australia");
  assert.equal(normalizeCountry("AUSTRAILIA").rawLabel, "Austrailia");
  assert.equal(normalizeCountry("KOREA").label, "South Korea");
  assert.equal(normalizeCountry("ENGLAND").key, normalizeCountry("UNITED KINGDOM").key);
  assert.equal(normalizeCountry("N. IRELAND").label, "United Kingdom");
  assert.equal(normalizeCountry("VN").label, "Vietnam");
  assert.equal(normalizeCountry("SOUTH VIETNAM").label, "Vietnam");
  assert.equal(normalizeCountry("MYANMAR (BURMA)").label, "Myanmar");
  assert.equal(normalizeCountry("GRAND DUCHY OF LUXEMBOURG").label, "Luxembourg");
  assert.equal(normalizeCountry("AFRICA").label, "Africa");
  assert.equal(normalizeCountry("").key, "");
});

test("stored country strings fold to fewer country hubs", () => {
  const stored = JSON.parse(readFileSync("data/plants.json", "utf8")).map((plant) => String(plant.country || "").trim());
  assert.equal(new Set(stored).size, countryNormalization.rawCount);
  assert.equal(countryNormalization.rawCount, 107);
  assert.equal(countryNormalization.caseInsensitiveCount, 83);
  assert.equal(countryNormalization.normalizedCount, countryHubs.length);
  assert.ok(countryNormalization.normalizedCount < countryNormalization.caseInsensitiveCount);
  assert.equal(countryNormalization.normalizedCount, 73);
  const united = countryHubs.find((country) => country.key === "united-states");
  assert.ok(united);
  assert.deepEqual(united.rawLabels, ["United States", "United States (USA)"]);
  assert.equal(catalog.getPlant("1vv").country, "China");
  assert.equal(catalog.getPlant("1vv").countryRaw, "P.R. China");
  assert.equal(catalog.getPlant("1nb").country, "United Kingdom");
  assert.equal(catalog.getPlant("1nb").countryRaw, "England");
  assert.equal(catalog.getPlant("1n0").country, "Australia");
  assert.equal(catalog.getPlant("1u2").country, "Japan");
  const keys = countryHubs.map((country) => country.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("manufacturer groups match the named counts and do not overlap", () => {
  const counts = Object.fromEntries(manufacturerGroups.map((group) => [group.id, group.count]));
  assert.deepEqual(counts, {
    bridgestone: 75,
    michelin: 57,
    goodyear: 38,
    continental: 28,
    pirelli: 19,
  });
  const seen = new Map();
  for (const plant of catalog.plants) {
    const hits = groupsMatchingName(plant.name);
    assert.ok(hits.length <= 1, plant.code);
    if (hits.length === 1) {
      assert.equal(seen.has(plant.code), false);
      seen.set(plant.code, hits[0]);
    }
  }
  assert.equal(seen.size, 75 + 57 + 38 + 28 + 19);
  const naive = catalog.plants.filter((plant) => {
    const name = plant.name.toLowerCase();
    return name.includes("continental") || name.includes("general tire");
  });
  assert.equal(naive.length, 29);
  const omitted = catalog.plants.filter((plant) => /general tires technology/i.test(plant.name));
  assert.equal(omitted.length, 1);
  assert.equal(omitted[0].code, "076");
  assert.equal(manufacturerGroups.find((group) => group.id === "continental").plants.some((plant) => plant.code === "076"), false);
  const firestoneOnly = catalog.plants.find((plant) => /firestone/i.test(plant.name) && !/bridgestone/i.test(plant.name));
  assert.equal(seen.get(firestoneOnly.code), "bridgestone");
  assert.equal(manufacturerGroupForBrand("firestone").id, "bridgestone");
  assert.equal(manufacturerGroupForBrand("general-tire").id, "continental");
  assert.equal(manufacturerGroupForBrand("bf-goodrich"), null);
});

test("a thin plant has neither a same-registrant sibling nor an exact recall filer", () => {
  assert.equal(isThinPlantRecord({ siblingCount: 0, recallCount: 0 }), true);
  assert.equal(isThinPlantRecord({ siblingCount: 1, recallCount: 0 }), false);
  assert.equal(isThinPlantRecord({ siblingCount: 0, recallCount: 2 }), false);
  const rows = [{ filer: "Michelin North America, Inc.", campaign: "00T0000" }];
  assert.equal(recallsForRegistrant("Michelin", rows).length, 0);
  assert.equal(recallsForRegistrant("MICHELIN NORTH AMERICA, INC.", rows).length, 1);
  assert.equal(registrantKey("Michelin North America, Inc."), registrantKey("MICHELIN NORTH AMERICA INC"));

  const dotted = plantByCode.get("1AP");
  const undotted = plantByCode.get("1BE");
  assert.ok(dotted.siblings.some((plant) => plant.code === "1BE"));
  assert.ok(undotted.siblings.some((plant) => plant.code === "1AP"));
  assert.equal(dotted.thin, false);

  const cooper = plantByCode.get("1UP");
  assert.equal(cooper.thin, false);
  assert.ok(cooper.recalls.length > 0);
  assert.ok(cooper.recalls.every((row) => registrantKey(row.filer) === registrantKey(catalog.getPlant("1up").name)));

  const prefixed = catalog.plants.find((plant) => plant.name.startsWith("The Goodyear Tire"));
  assert.notEqual(registrantKey(prefixed.name), registrantKey(catalog.getPlant("17l").name));
  assert.equal(plantByCode.get(prefixed.code).recalls.length, 0);
  assert.ok(plantByCode.get("17L").recalls.length > 0);

  const shirakawa = plantByCode.get("1U2");
  assert.equal(shirakawa.siblings.length, 0);
  assert.equal(shirakawa.recalls.length, 0);
  assert.equal(shirakawa.thin, true);
  assert.ok(thinPlantPaths.has("/plants/1u2/"));
  assert.equal(indexablePlantPaths.has("/plants/1u2/"), false);
  assert.equal(indexablePlantPaths.has("/plants/1up/"), true);

  let thin = 0;
  for (const plant of catalog.plants) {
    const extra = plantByCode.get(plant.code);
    const expected = extra.siblings.length === 0 && extra.recalls.length === 0;
    assert.equal(extra.thin, expected, plant.code);
    assert.equal(thinPlantPaths.has(plant.url), expected);
    assert.equal(indexablePlantPaths.has(plant.url), !expected);
    if (expected) thin += 1;
  }
  assert.equal(thin, thinPlantPaths.size);
  assert.equal(thin + indexablePlantPaths.size, catalog.plants.length);
  assert.equal(thin, 1041);
  for (const path of hubPaths) assert.equal(thinPlantPaths.has(path), false);
});

test("hub and plant answers stay inside the answer-box rules", () => {
  for (const group of manufacturerGroups) assertSentences(manufacturerHubAnswer(group), group.url);
  assertSentences(manufacturerIndexAnswer(manufacturerGroups), "/plants/manufacturer/");
  for (const country of countryHubs) assertSentences(countryHubAnswer(country), country.url);
  assertSentences(
    countryIndexAnswer({
      rawCount: countryNormalization.rawCount,
      normalizedCount: countryNormalization.normalizedCount,
      plantCount: catalog.stats.plants,
    }),
    "/plants/country/",
  );
  for (const plant of catalog.plants) assertSentences(plantAnswer(plant), plant.url);
});

test("plant and hub JSON-LD is BreadcrumbList plus Dataset, with Article on a code page", () => {
  const plant = catalog.getPlant("1up");
  const extra = plantByCode.get(plant.code);
  const crumbs = [
    { href: "/", label: "Home" },
    { href: "/plants/", label: "Plant codes" },
    { href: extra.countryUrl, label: plant.country },
    { href: plant.url, label: plant.code },
  ];
  const plantGraph = [breadcrumbList(crumbs), ...plantJsonLd(plant, extra)];
  const plantTypes = typesIn(plantGraph);
  assert.ok(plantTypes.has("BreadcrumbList"));
  assert.ok(plantTypes.has("Dataset"));
  assert.ok(plantTypes.has("Article"));
  assert.equal(plantGraph.at(-1).headline, "How to find plant code 1UP on a tire");
  assert.equal(plantGraph.at(-1).mainEntityOfPage, "https://treadgrade.com/plants/1up/");

  const group = manufacturerGroups.find((item) => item.id === "michelin");
  const groupAnswers = manufacturerHubAnswer(group);
  const groupGraph = [
    breadcrumbList([
      { href: "/", label: "Home" },
      { href: "/plants/", label: "Plant codes" },
      { href: "/plants/manufacturer/", label: "Manufacturers" },
      { href: group.url, label: group.name },
    ]),
    hubDataset({
      name: `${group.linkLabel} plant codes in the NHTSA list`,
      description: groupAnswers.join(" "),
      path: group.url,
      keywords: ["DOT", "plant code", "NHTSA", group.name],
    }),
  ];
  const country = countryHubs.find((item) => item.key === "thailand");
  const countryGraph = [
    breadcrumbList([
      { href: "/", label: "Home" },
      { href: "/plants/", label: "Plant codes" },
      { href: "/plants/country/", label: "Countries" },
      { href: country.url, label: country.label },
    ]),
    hubDataset({
      name: `NHTSA plant records in ${country.label}`,
      description: countryHubAnswer(country).join(" "),
      path: country.url,
      keywords: ["DOT", "plant code", "NHTSA", country.label],
    }),
  ];
  for (const graph of [plantGraph, groupGraph, countryGraph]) {
    const types = typesIn(graph);
    assert.ok(types.has("BreadcrumbList"), [...types].join(","));
    assert.ok(types.has("Dataset"));
    const blob = schemaGraph(graph);
    for (const forbidden of FORBIDDEN) assert.equal(blob.includes(`"${forbidden}"`), false, forbidden);
    assert.equal(graph[0].itemListElement.at(-1).item.startsWith("https://treadgrade.com/"), true);
  }
  assert.equal(typesIn(groupGraph).has("Article"), false);
  assert.equal(typesIn(countryGraph).has("Article"), false);
});

test("each plant template source has one h1 and one answer box", () => {
  const templates = [
    "src/pages/plants/[code].astro",
    "src/pages/plants/manufacturer/[group].astro",
    "src/pages/plants/manufacturer/index.astro",
    "src/pages/plants/country/[country].astro",
    "src/pages/plants/country/index.astro",
  ];
  for (const file of templates) {
    const source = readFileSync(file, "utf8");
    assert.equal((source.match(/<h1\b/g) || []).length, 1, file);
    assert.equal((source.match(/<Answer\b/g) || []).length, 1, file);
    assert.match(source, /<Base\b/, file);
    assert.match(source, /breadcrumbs=/, file);
    assert.doesNotMatch(source, /AggregateRating|GovernmentOrganization/, file);
  }
});
