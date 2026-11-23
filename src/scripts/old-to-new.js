export function initOldToNew(root) {
  const input = root.querySelector("[data-old-query]");
  const table = root.querySelector("table");
  const output = root.querySelector("[data-old-status]");
  const details = root.querySelector("details");
  if (!input || !table || !output) return;
  const rows = [...table.tBodies[0].rows];
  const total = rows.length.toLocaleString("en-US");
  const idle = output.dataset.idle || output.textContent;

  function apply() {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    for (const row of rows) {
      const visible = !query || (row.dataset.search || "").includes(query);
      row.hidden = !visible;
      if (visible) shown += 1;
    }
    output.textContent = query ? `${shown.toLocaleString("en-US")} of ${total} former codes match.` : idle;
    if (query && details && !details.open) details.open = true;
    if (!query) return;
    const first = rows.find((row) => !row.hidden);
    if (!first) return;
    const rect = first.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) first.scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("input", apply);
}
