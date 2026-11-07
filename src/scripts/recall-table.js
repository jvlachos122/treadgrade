/**
 * Column sort for the recall table. Missing units stay last. Equal values
 * keep campaign, brand, then line order.
 */
export function compareRecallValues(a, b, key, dir) {
  const sign = dir === "asc" ? 1 : -1;
  let result = 0;
  if (key === "units") {
    const aMissing = a.units === "" || a.units == null;
    const bMissing = b.units === "" || b.units == null;
    if (aMissing || bMissing) {
      if (aMissing && bMissing) result = 0;
      else return aMissing ? 1 : -1;
    } else {
      result = (Number(a.units) - Number(b.units)) * sign;
    }
  } else {
    result =
      String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "en", { numeric: true, sensitivity: "base" }) * sign;
  }
  if (result) return result;
  return (
    String(a.campaign ?? "").localeCompare(String(b.campaign ?? "")) ||
    String(a.brand ?? "").localeCompare(String(b.brand ?? ""), "en") ||
    String(a.line ?? "").localeCompare(String(b.line ?? ""), "en")
  );
}

function valuesOf(row) {
  return {
    brand: row.dataset.brand || "",
    line: row.dataset.line || "",
    filer: row.dataset.filer || "",
    date: row.dataset.date || "",
    units: row.dataset.units || "",
    campaign: row.dataset.campaign || "",
    sizes: row.dataset.sizes || "",
  };
}

export function initRecallTable(root) {
  const input = root.querySelector("[data-recall-filter]");
  const table = root.querySelector("table");
  const status = root.querySelector("[data-recall-status]");
  if (!table || !status || !table.tBodies[0]) return;
  const tbody = table.tBodies[0];
  const rows = [...tbody.rows];
  let sortKey = "date";
  let sortDir = "desc";

  function apply() {
    const query = (input?.value || "").trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => compareRecallValues(valuesOf(a), valuesOf(b), sortKey, sortDir));
    for (const row of sorted) tbody.appendChild(row);
    let shown = 0;
    for (const row of rows) {
      const visible = !query || (row.dataset.search || "").includes(query);
      row.hidden = !visible;
      if (visible) shown += 1;
    }
    status.textContent = `${shown.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows shown.`;
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
        sortDir = key === "date" || key === "units" ? "desc" : "asc";
      }
      apply();
    });
  }
  apply();
}
