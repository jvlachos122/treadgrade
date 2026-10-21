export function initTableFilter(root) {
  const input = root.querySelector("[data-filter-q]");
  const country = root.querySelector("[data-filter-country]");
  const status = root.querySelector("[data-filter-status]");
  const table = root.querySelector("table");
  const output = root.querySelector("[data-filter-status-text]");
  if (!input || !table || !output) return;
  const rows = [...table.tBodies[0].rows];

  function apply() {
    const query = input.value.trim().toLowerCase();
    const countryValue = country?.value || "";
    const statusValue = status?.value || "";
    let shown = 0;
    for (const row of rows) {
      const visible =
        (!query || row.dataset.search.includes(query)) &&
        (!countryValue || row.dataset.country === countryValue) &&
        (!statusValue || row.dataset.status === statusValue);
      row.hidden = !visible;
      if (visible) shown += 1;
    }
    output.textContent = `${shown.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} plants shown.`;
  }

  input.addEventListener("input", apply);
  country?.addEventListener("change", apply);
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
