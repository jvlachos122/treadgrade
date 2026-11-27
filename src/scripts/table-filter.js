import { packedBrandLinks } from "virtual:brand-plant-links";
import { bareCodeLookup, plantQueryResult, unpackBrandLinks } from "../lib/plant-query.js";
import { decodeTin, indexPlants } from "../lib/tin.js";
import { renderPlantLookup } from "./plant-lookup-view.js";

const brandLinks = unpackBrandLinks(packedBrandLinks);

function plantsFromRows(rows) {
  return rows.map((row) => ({
    code: row.dataset.code || "",
    oldCode: row.dataset.old || "",
    name: row.dataset.name || "",
    city: row.dataset.city || "",
    country: row.dataset.countryName || "",
    status: row.dataset.plantStatus || "",
    url: row.dataset.url || "",
  }));
}

export function initTableFilter(root) {
  const input = root.querySelector("[data-filter-q]");
  const country = root.querySelector("[data-filter-country]");
  const maker = root.querySelector("[data-filter-maker]");
  const status = root.querySelector("[data-filter-status]");
  const table = root.querySelector("[data-plant-table]") || root.querySelector("table");
  const output = root.querySelector("[data-filter-status-text]");
  if (!input || !table || !output) return;
  const rows = [...table.tBodies[0].rows];
  const lookup = root.querySelector("[data-lookup]");
  const verified = root.dataset.verified || "";
  const plants = indexPlants(plantsFromRows(rows));

  function directoryLookup(value) {
    const query = String(value || "");
    if (!query.trim()) return null;
    const result = plantQueryResult(query, plants, brandLinks, verified);
    if (result.mode === "tin") return bareCodeLookup(decodeTin(result.text, plants, new Date()), verified);
    if (result.mode === "brand" && !result.rows.length && !result.knownBrand) {
      const needle = query.trim().toLowerCase();
      if (rows.some((row) => row.dataset.search.includes(needle))) return null;
    }
    return result;
  }

  function apply() {
    const query = input.value.trim().toLowerCase();
    const countryValue = country?.value || "";
    const makerValue = maker?.value || "";
    const statusValue = status?.value || "";
    const found = directoryLookup(input.value);
    const restrict = found && (found.mode === "code" || (found.mode === "brand" && found.rows.length));
    const allowed = restrict ? new Set(found.rows.map((row) => row.code.toUpperCase())) : null;
    if (lookup) {
      if (found?.sentences?.length) renderPlantLookup(lookup, found);
      else lookup.replaceChildren();
    }
    let shown = 0;
    for (const row of rows) {
      const inLookup = !allowed || allowed.has((row.dataset.code || "").toUpperCase());
      const inText = restrict || !query || row.dataset.search.includes(query);
      const visible =
        inLookup &&
        inText &&
        (!countryValue || row.dataset.country === countryValue) &&
        (!makerValue || row.dataset.maker === makerValue) &&
        (!statusValue || row.dataset.status === statusValue);
      row.hidden = !visible;
      if (visible) shown += 1;
    }
    output.textContent = `${shown.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} plants shown.`;
  }

  input.addEventListener("input", apply);
  country?.addEventListener("change", apply);
  maker?.addEventListener("change", apply);
  status?.addEventListener("change", apply);
}

export function initListFilter(input, list, status) {
  const items = [...list.children];
  function apply() {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    for (const item of items) {
      const visible = !query || item.dataset.search.includes(query);
      item.hidden = !visible;
      if (visible) shown += 1;
    }
    status.textContent = `${shown.toLocaleString("en-US")} of ${items.length.toLocaleString("en-US")} shown.`;
  }
  input.addEventListener("input", apply);
}
