/**
 * Plant-code and brand-name lookups for the decoder and the plant directory.
 *
 * A bare code, including lower case, a leading DOT, and surrounding spaces or
 * punctuation, stays on the TIN parser. Words that are not a TIN are read
 * here: a brand name, or a brand name next to a 2- or 3-symbol code.
 *
 * Brand links come from mapBrandPlants. A name with no link is reported as
 * not linked. The registrant is not guessed.
 */

import { formatNumber, formatVerified } from "./format.js";
import { brandKey } from "./normalize.js";
import { exactPlantMatches } from "./tin.js";

export const BANNED_PLANT_QUERY_WORD = /\b(best|recommend(?:ed|s|ing)?)\b/i;

export const DECODER_QUERY_HINT =
  "Type a plant code on its own, with a brand name, or with the letters DOT. Lower case, spaces, and punctuation are set aside. A brand name shows the plant codes linked to that brand, or says that NHTSA's plant list does not link that name.";

export const PLANTS_QUERY_HINT =
  "Search by code, a former code, a brand name, the company name, or the city. A brand name shows the plant codes linked to that brand. If the plant list does not link the name, the page says so and does not assign a maker.";

const FILLERS = new Set(
  `a an the for of to and or in on with from what which who where how are is was do does it this that list lists plant plants code codes tire tires tyre tyres registered number numbers tin lookup find show me my your dot symbol symbols about`.split(
    " ",
  ),
);

const ALLOWED_LETTER = /[ABCDEFHJKLMNPRTUVWXY]/i;

export function packBrandLinks(entries) {
  return [...entries]
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      url: entry.url,
      codes: [...(entry.codes || [])],
      aliases: [...(entry.aliases || [])],
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) =>
      [entry.slug, entry.name, entry.url, entry.codes.join(","), entry.aliases.join("\u001f")].join("\t"),
    )
    .join("\n");
}

export function unpackBrandLinks(packed) {
  const brands = [];
  for (const line of String(packed ?? "").split("\n")) {
    if (!line) continue;
    const [slug, name, url, codes = "", aliases = ""] = line.split("\t");
    if (!slug || !name || !url) continue;
    brands.push({
      slug,
      name,
      url,
      codes: codes ? codes.split(",").filter(Boolean) : [],
      aliases: aliases ? aliases.split("\u001f").filter(Boolean) : [],
    });
  }
  return brands;
}

export function brandLinkEntries(brands, plantsBySlug) {
  return brands.map((brand) => ({
    slug: brand.slug,
    name: brand.name,
    url: brand.url,
    codes: (plantsBySlug.get(brand.slug) || []).map((plant) => plant.code),
    aliases: (brand.aliases || []).map((alias) => alias.name).filter(Boolean),
  }));
}

function tokenize(raw) {
  return String(raw ?? "").match(/[A-Za-z0-9]+/g) || [];
}

function isFiller(token) {
  return FILLERS.has(String(token || "").toLowerCase());
}

function isProseWord(token) {
  return /^[A-Za-z]{4,}$/.test(token) && ALLOWED_LETTER.test(token) && !isFiller(token);
}

function knownCode(token, index) {
  const code = String(token || "").toUpperCase();
  if (code.length < 2 || code.length > 3) return "";
  if (index?.byCode?.has(code) || index?.byOld?.has(code)) return code;
  return "";
}

function isTinFragment(token, index) {
  if (!token || knownCode(token, index) || isFiller(token) || isProseWord(token)) return false;
  if (/^\d{3,4}$/.test(token)) return true;
  return /^[A-Za-z0-9]{4,}$/.test(token);
}

function labelKeys(label) {
  const keys = new Set();
  const direct = brandKey(label);
  const loose = brandKey(String(label ?? "").replace(/[^A-Za-z0-9]+/g, " "));
  if (direct) keys.add(direct);
  if (loose) keys.add(loose);
  return [...keys];
}

function brandNameMap(brands) {
  const map = new Map();
  const ambiguous = new Set();
  for (const brand of brands || []) {
    const labels = [brand.name, ...(brand.aliases || [])];
    for (const label of labels) {
      for (const key of labelKeys(label)) {
        if (ambiguous.has(key)) continue;
        const prior = map.get(key);
        if (prior && prior.slug !== brand.slug) {
          ambiguous.add(key);
          map.delete(key);
          continue;
        }
        map.set(key, brand);
      }
    }
  }
  return map;
}

function findBrand(tokens, map) {
  let found = null;
  for (let size = tokens.length; size >= 1; size -= 1) {
    if (found && size < found.size) break;
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const key = brandKey(tokens.slice(start, start + size).join(" "));
      const brand = key ? map.get(key) : null;
      if (!brand) continue;
      if (!found || size > found.size) found = { brand, size, start, end: start + size };
    }
  }
  return found;
}

function unique(values) {
  return [...new Set(values)];
}

export function interpretPlantQuery(raw, index, brands) {
  const tokens = tokenize(raw);
  const map = brandNameMap(brands);
  const found = findBrand(tokens, map);
  const covered = new Set();
  if (found) {
    for (let i = found.start; i < found.end; i += 1) covered.add(i);
  }
  const outside = [];
  tokens.forEach((token, indexNo) => {
    if (!covered.has(indexNo)) outside.push(token);
  });
  const outsideCodes = unique(outside.map((token) => knownCode(token, index)).filter(Boolean));
  const outsideProse = outside.filter((token) => isProseWord(token));
  const outsideFragments = outside.filter((token) => isTinFragment(token, index));
  const outsideNoise = outside.filter((token) => !isFiller(token) && !knownCode(token, index) && !isProseWord(token) && !isTinFragment(token, index));

  if (found && !outsideCodes.length && !outsideProse.length && !outsideFragments.length && !outsideNoise.length) {
    return { mode: "brand", brand: found.brand, typedName: found.brand.name, codes: [] };
  }
  if ((found || outsideProse.length) && outsideCodes.length && !outsideFragments.length && !outsideNoise.length) {
    return {
      mode: "code",
      brand: found?.brand || null,
      typedBrand: outsideProse.join(" "),
      codes: outsideCodes,
    };
  }
  if (!found && outsideProse.length && !outsideCodes.length && !outsideFragments.length && !outsideNoise.length) {
    return { mode: "brand", brand: null, typedName: outsideProse.join(" "), codes: [] };
  }
  if (!found && outsideCodes.length === 1 && !outsideProse.length && !outsideFragments.length && !outsideNoise.length) {
    const fillers = outside.filter((token) => !knownCode(token, index));
    const dotOnly = fillers.every((token) => token.toLowerCase() === "dot");
    return { mode: "tin", text: dotOnly ? String(raw ?? "") : outsideCodes[0], codes: outsideCodes };
  }
  if (outsideFragments.length === 1 && !outsideProse.length && !outsideCodes.length && !outsideNoise.length && !found) {
    return { mode: "tin", text: outsideFragments[0], codes: [] };
  }
  return { mode: "tin", text: String(raw ?? ""), codes: [] };
}

function rowFromMatch(queryCode, match, matchedOn = match.matchedOn) {
  return {
    queryCode,
    code: match.code,
    matchedOn,
    name: match.name || "",
    city: match.city || "",
    country: match.country || "",
    status: match.status || "",
    url: match.url || `/plants/${String(match.code || "").toLowerCase()}/`,
  };
}

function codeSentences(codes, rows, brand, typedBrand, verified) {
  if (codes.length !== 1) {
    return [
      `Plant codes ${codes.join(" and ")} are in NHTSA's equipment plant list, verified ${verified} (UTC). Each match is listed.`,
    ];
  }
  const code = codes[0];
  const matches = rows.filter((row) => row.queryCode === code);
  const sentences = [];
  if (!matches.length) {
    sentences.push(`Plant code ${code} is not in NHTSA's equipment plant list, verified ${verified} (UTC).`);
  } else {
    const noun = matches.length === 1 ? "record" : "records";
    sentences.push(
      `Plant code ${code} is on ${formatNumber(matches.length)} ${noun} in NHTSA's equipment plant list, verified ${verified} (UTC).`,
    );
    const both =
      matches.some((row) => row.matchedOn === "current") && matches.some((row) => row.matchedOn === "old");
    if (both) sentences.push("The same code is a current code and a former code. Each match is listed.");
    else if (matches.length > 1) sentences.push("The same code is on more than one plant record. Each match is listed.");
    else if (matches[0].matchedOn === "old") {
      sentences.push(`The code matches a former two-symbol code. The current code on that record is ${matches[0].code}.`);
    }
  }
  if (sentences.length < 3 && brand?.codes?.length) {
    sentences.push(
      `${brand.name} has its own registered plant codes. Those codes stay on the brand page, and they do not remove a match for ${code}.`,
    );
  } else if (sentences.length < 3 && brand && !brand.codes.length) {
    sentences.push(`NHTSA's plant list does not link ${brand.name} to a plant code. The matches are for ${code} only.`);
  } else if (sentences.length < 3 && typedBrand) {
    sentences.push(`NHTSA's plant list does not link ${typedBrand} to a plant code. The matches are for ${code} only.`);
  }
  return sentences;
}

function linkedSentences(brand, verified) {
  const noun = brand.codes.length === 1 ? "plant code" : "plant codes";
  return [
    `${brand.name} is linked to ${formatNumber(brand.codes.length)} registered ${noun} in NHTSA's equipment plant list, verified ${verified} (UTC).`,
    "A code is listed when the registrant name begins with the brand. A registered code can be closed or historic, and it does not show where a given tire was made.",
  ];
}

function unlinkedSentences(name, verified) {
  return [
    `NHTSA's plant list does not link ${name} to a plant code. The list was verified ${verified} (UTC).`,
    "The list names the company that registered each code. It does not name a brand, and this page does not assign a maker.",
  ];
}

function plantRow(code, index) {
  const plant = index.byCode.get(code);
  if (!plant) return rowFromMatch(code, { code, url: `/plants/${code.toLowerCase()}/` }, "brand");
  return rowFromMatch(code, plant, "brand");
}

export function plantQueryResult(raw, index, brands, verifiedAt) {
  const verified = formatVerified(verifiedAt);
  const read = interpretPlantQuery(raw, index, brands);
  if (read.mode === "tin") {
    return { mode: "tin", text: read.text, sentences: [], caption: "", rows: [], knownBrand: false, brandUrl: "", brandName: "" };
  }
  if (read.mode === "code") {
    const rows = [];
    for (const code of read.codes) {
      for (const match of exactPlantMatches(code, index)) rows.push(rowFromMatch(code, match));
    }
    const linked = Boolean(read.brand?.codes?.length);
    return {
      mode: "code",
      text: "",
      sentences: codeSentences(read.codes, rows, read.brand, read.typedBrand, verified),
      caption:
        read.codes.length === 1
          ? `Matches for plant code ${read.codes[0]} in NHTSA's equipment plant list, verified ${verified} (UTC).`
          : `Matches for plant codes ${read.codes.join(" and ")} in NHTSA's equipment plant list, verified ${verified} (UTC).`,
      rows,
      knownBrand: Boolean(read.brand),
      brandUrl: linked ? read.brand.url : "",
      brandName: linked ? read.brand.name : "",
    };
  }
  if (read.brand?.codes?.length) {
    return {
      mode: "brand",
      text: "",
      sentences: linkedSentences(read.brand, verified),
      caption: `Plant codes for ${read.brand.name}. The registrant name begins with the brand. NHTSA's plant list was verified ${verified} (UTC).`,
      rows: read.brand.codes.map((code) => plantRow(code, index)),
      knownBrand: true,
      brandUrl: read.brand.url,
      brandName: read.brand.name,
    };
  }
  const name = read.brand?.name || read.typedName;
  return {
    mode: "brand",
    text: "",
    sentences: unlinkedSentences(name, verified),
    caption: "",
    rows: [],
    knownBrand: Boolean(read.brand),
    brandUrl: "",
    brandName: read.brand?.name || "",
  };
}

export function bareCodeLookup(decoded, verifiedAt) {
  const code = String(decoded?.normalized || "");
  if (!/^[A-Z0-9]{2,3}$/.test(code) || !decoded?.matches?.length) return null;
  const verified = formatVerified(verifiedAt);
  const rows = decoded.matches.map((match) => rowFromMatch(code, match));
  const sentences = codeSentences([code], rows, null, "", verified);
  if (decoded.alternativeReadings && sentences.length < 3) {
    const note = decoded.notes.find((item) => item.alternativeReadings);
    if (note) sentences.push(note.text);
  }
  return {
    mode: "code",
    text: "",
    sentences,
    caption: `Matches for plant code ${code} in NHTSA's equipment plant list, verified ${verified} (UTC).`,
    rows,
    knownBrand: false,
    brandUrl: "",
    brandName: "",
  };
}
