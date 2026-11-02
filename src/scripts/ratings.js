import { rowQuality } from "../lib/grade-quality.js";
import {
  PAGE_SIZE,
  expandPublicRow,
  parseRatingsQuery,
  qualityLabel,
  ratingsCsv,
  rowMatches,
  serializeRatingsQuery,
  sizeFlagLabel,
  sortGradeRows,
  tireLineCount,
} from "../lib/ratings-table.js";

function readState() {
  return parseRatingsQuery(window.location.search);
}

function writeState(state) {
  const search = serializeRatingsQuery(state);
  const next = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) history.replaceState(null, "", next);
}

function checkedValues(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function brandHref(url) {
  return `/brands/${String(url).split("/")[2]}/`;
}

export function initRatings(root) {
  const status = root.querySelector("[data-status]");
  const body = root.querySelector("tbody");
  const pageLabel = root.querySelector("[data-page]");
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  const csvButton = root.querySelector("[data-csv]");
  const form = root.querySelector("form");
  let data = null;
  let rows = [];
  let state = readState();

  function field(name) {
    return form.elements.namedItem(name);
  }

  function syncForm() {
    field("q").value = state.q;
    for (const input of form.querySelectorAll('input[name="traction"]')) {
      input.checked = state.traction.includes(input.value);
    }
    for (const input of form.querySelectorAll('input[name="temp"]')) {
      input.checked = state.temp.includes(input.value);
    }
    field("wearMin").value = state.wearMin;
    field("wearMax").value = state.wearMax;
    field("size").value = state.size;
    field("quality").value = state.quality;
    field("sort").value = state.sort;
  }

  function readForm(page) {
    return parseRatingsQuery(
      serializeRatingsQuery({
        q: field("q").value,
        traction: checkedValues(form, "traction"),
        temp: checkedValues(form, "temp"),
        wearMin: field("wearMin").value,
        wearMax: field("wearMax").value,
        size: field("size").value,
        quality: field("quality").value,
        sort: field("sort").value,
        page,
      }),
    );
  }

  function cellLink(href, text) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    return link;
  }

  function grade(value, temperature) {
    const span = document.createElement("span");
    const letters = temperature ? ["A", "B", "C"] : ["AA", "A", "B", "C"];
    const known = letters.includes(value);
    span.className = `grade utqg grade-${known ? value.toLowerCase() : "other"}`;
    span.textContent = value || "—";
    return span;
  }

  function filteredRows() {
    return sortGradeRows(
      rows.filter((row) => rowMatches(row, state)),
      state,
    );
  }

  function render() {
    const matched = filteredRows();
    const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = matched.slice(start, start + PAGE_SIZE);
    body.replaceChildren();
    for (const row of slice) {
      const tr = document.createElement("tr");
      const quality = rowQuality(row);
      if (quality.kind !== "ok") tr.className = `quality-${quality.kind}`;
      const brand = document.createElement("td");
      brand.append(cellLink(brandHref(row.url), row.brand));
      const name = document.createElement("td");
      name.append(cellLink(row.url, row.line));
      const size = document.createElement("td");
      size.className = "tire-size";
      size.textContent = row.size;
      const flag = document.createElement("td");
      flag.textContent = sizeFlagLabel(row.size);
      const wear = document.createElement("td");
      wear.className = "num utqg";
      wear.textContent = row.wear == null || row.wear === "" ? "—" : String(row.wear);
      const trac = document.createElement("td");
      trac.append(grade(row.trac, false));
      const temp = document.createElement("td");
      temp.append(grade(row.temp, true));
      const note = document.createElement("td");
      const label = qualityLabel(row);
      if (label) {
        const mark = document.createElement("span");
        mark.className = "quality-flag";
        mark.textContent = label;
        note.append(mark);
      } else {
        note.textContent = "—";
      }
      tr.append(brand, name, size, flag, wear, trac, temp, note);
      body.append(tr);
    }
    const from = matched.length ? start + 1 : 0;
    const to = start + slice.length;
    const lines = tireLineCount(matched);
    const lineNoun = lines === 1 ? "tire line" : "tire lines";
    if (!matched.length) {
      status.replaceChildren();
      const note = document.createElement("a");
      note.href = "/guides/no-utqg-rating/";
      note.textContent = "Why a tire may have no UTQG rating";
      status.append(document.createTextNode("No grade rows match. A missing name is not a grade. "), note, document.createTextNode("."));
    } else {
      status.textContent = `Showing ${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${matched.length.toLocaleString("en-US")} grade rows on ${lines.toLocaleString("en-US")} ${lineNoun}.`;
    }
    pageLabel.textContent = `Page ${state.page} of ${pages}`;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= pages;
    if (csvButton) csvButton.disabled = !data;
    writeState(state);
  }

  function onFilter(resetPage) {
    state = readForm(resetPage ? 1 : state.page);
    if (data) render();
    else writeState(state);
  }

  function downloadCsv() {
    if (!data) return;
    const matched = filteredRows();
    const csv = ratingsCsv(matched, {
      source: data.source || root.dataset.source,
      verifiedAt: data.verifiedAt || root.dataset.verified,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "treadgrade-utqg-ratings.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onFilter(true);
  });
  form.addEventListener("input", () => onFilter(true));
  form.addEventListener("change", () => onFilter(true));
  prev.addEventListener("click", () => {
    state.page -= 1;
    render();
    root.querySelector("table")?.scrollIntoView({ block: "start" });
  });
  next.addEventListener("click", () => {
    state.page += 1;
    render();
    root.querySelector("table")?.scrollIntoView({ block: "start" });
  });
  csvButton?.addEventListener("click", downloadCsv);
  form.querySelector("[data-clear]")?.addEventListener("click", () => {
    state = parseRatingsQuery("");
    syncForm();
    render();
  });
  window.addEventListener("popstate", () => {
    state = readState();
    syncForm();
    if (data) render();
  });

  syncForm();
  fetch("/data/ratings.json")
    .then((response) => {
      if (!response.ok) throw new Error("ratings");
      return response.json();
    })
    .then((payload) => {
      data = payload;
      rows = payload.rows.map((cells) => expandPublicRow(cells, payload.lines));
      render();
    })
    .catch(() => {
      status.textContent = "The ratings table did not load. Every brand is listed on the brands page.";
    });
}
