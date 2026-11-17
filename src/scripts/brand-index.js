function valuesOf(row) {
  return {
    brand: row.dataset.brand || "",
    lines: row.dataset.lines || "",
    median: row.dataset.median || "",
    plants: row.dataset.plants || "",
    campaigns: row.dataset.campaigns || "",
  };
}

function compareBrandValues(a, b, key, dir) {
  const sign = dir === "asc" ? 1 : -1;
  if (key === "lines" || key === "median" || key === "plants" || key === "campaigns") {
    const aMissing = a[key] === "";
    const bMissing = b[key] === "";
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return a.brand.localeCompare(b.brand, "en", { sensitivity: "base" });
      return aMissing ? 1 : -1;
    }
    const diff = (Number(a[key]) - Number(b[key])) * sign;
    if (diff) return diff;
  } else {
    const diff = a.brand.localeCompare(b.brand, "en", { sensitivity: "base" }) * sign;
    if (diff) return diff;
  }
  return a.brand.localeCompare(b.brand, "en", { sensitivity: "base" });
}

export function initBrandIndex(root) {
  const input = root.querySelector("[data-brand-filter]");
  const table = root.querySelector("table");
  const status = root.querySelector("[data-brand-status]");
  if (!table?.tBodies[0] || !status) return;
  const tbody = table.tBodies[0];
  const rows = [...tbody.rows];
  let sortKey = "brand";
  let sortDir = "asc";

  function apply() {
    const query = (input?.value || "").trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => compareBrandValues(valuesOf(a), valuesOf(b), sortKey, sortDir));
    for (const row of sorted) tbody.appendChild(row);
    let shown = 0;
    for (const row of rows) {
      const visible = !query || (row.dataset.search || "").includes(query);
      row.hidden = !visible;
      if (visible) shown += 1;
    }
    status.textContent = `${shown.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} brands shown.`;
    for (const button of table.querySelectorAll("[data-sort]")) {
      const header = button.closest("th");
      const active = button.dataset.sort === sortKey;
      if (header) header.setAttribute("aria-sort", active ? (sortDir === "asc" ? "ascending" : "descending") : "none");
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  input?.addEventListener("input", apply);
  for (const button of table.querySelectorAll("[data-sort]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDir = key === "brand" ? "asc" : "desc";
      }
      apply();
    });
  }
}

export { compareBrandValues };
