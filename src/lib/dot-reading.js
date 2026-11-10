/** Shared reading helpers for the full decoder and the plant-page widget. */

export function decoderPath(tin, options = {}) {
  const params = new URLSearchParams();
  const value = String(tin ?? "").trim();
  if (value) params.set("tin", value);
  if (options.triangle) params.set("triangle", "1");
  const query = params.toString();
  return query ? `/decoder/?${query}` : "/decoder/";
}

export function plantPageHref(code) {
  const normalized = String(code || "").trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(normalized)) return "";
  return `/plants/${normalized}/`;
}

export function samePlantHref(href, code) {
  const expected = plantPageHref(code);
  return expected && href === expected ? expected : "";
}

export function plantMatchParts(result, pageCode) {
  const page = String(pageCode || "").trim().toUpperCase();
  if (!result?.plantCode) return [{ text: "No plant code in this entry." }];
  if (!result.matches?.length) return [{ text: `Plant code ${result.plantCode} is not in NHTSA's list.` }];
  const parts = [];
  const here = result.matches.filter((item) => item.code.toUpperCase() === page);
  const elsewhere = result.matches.filter((item) => item.code.toUpperCase() !== page);
  if (here.length) {
    parts.push({
      text:
        result.plantCode === page
          ? `Plant code ${result.plantCode} matches this page.`
          : `Former code ${result.plantCode} matches this page. The current code is ${page}.`,
    });
  }
  for (const plant of elsewhere) {
    if (plant.matchedOn === "old") {
      parts.push({
        before: `Former code ${result.plantCode} matches current code `,
        code: plant.code,
        href: plant.url,
        after: ".",
      });
    } else {
      parts.push({
        before: "Plant code ",
        code: plant.code,
        href: plant.url,
        after: " is a different record.",
      });
    }
  }
  return parts;
}
