import { formatNumber, formatUtcDate } from "../lib/format.js";
import {
  COMPARE_MAX_LINES,
  COMPARE_MIN_LINES,
  compareAnswers,
  compareIndexing,
  compareSearch,
  filterCompareIndex,
  formatMedian,
  formatWear,
  fromPublicSummary,
  parseCompareLines,
} from "../lib/compare.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function gradeNode(value, kind) {
  const usual = kind === "temp" ? ["A", "B", "C"] : ["AA", "A", "B", "C"];
  const cls = usual.includes(value) ? String(value).toLowerCase() : "other";
  return el("span", `grade utqg grade-${cls}`, value || "—");
}

function statText(value) {
  return value == null ? "Not reported" : formatNumber(value);
}

function letterText(values) {
  return values.length ? values.join(", ") : "Not reported";
}

function applyRobots(root) {
  const decision = compareIndexing(window.location.search);
  let meta = document.querySelector('meta[name="robots"]');
  if (decision.noindex) {
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "no" + "index";
  } else if (meta && meta.content.replace(/\s/g, "") === "noindex") {
    meta.remove();
  }
  const link = document.querySelector('link[rel="canonical"]');
  if (link && root.dataset.canonical) link.setAttribute("href", root.dataset.canonical);
}

export function initCompare(root) {
  const picks = root.querySelector("[data-picks]");
  const status = root.querySelector("[data-status]");
  const results = root.querySelector("[data-results]");
  const addButton = root.querySelector("[data-add]");
  const form = root.querySelector("form");
  if (!picks || !status || !results || !addButton || !form) return;

  const cache = new Map();
  let indexPromise = null;
  let slots = [];

  function setStatus(message) {
    status.textContent = message || "";
  }

  function ensureIndex() {
    if (!indexPromise) {
      indexPromise = fetch(root.dataset.index).then((response) => {
        if (!response.ok) throw new Error("compare index");
        return response.json();
      });
    }
    return indexPromise;
  }

  async function loadRecord(id) {
    if (cache.has(id)) return cache.get(id);
    const pending = fetch(`/data/compare/${id}.json`).then(async (response) => {
      if (!response.ok) return null;
      return fromPublicSummary(await response.json());
    });
    cache.set(id, pending);
    return pending;
  }

  function selectedIds() {
    return slots.map((slot) => slot.id).filter(Boolean);
  }

  function writeUrl(ids) {
    const next = `/compare/${compareSearch(ids)}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) history.replaceState(null, "", next);
    applyRobots(root);
  }

  function closeLists(except) {
    for (const slot of slots) {
      if (slot === except) continue;
      slot.list.hidden = true;
      slot.input.setAttribute("aria-expanded", "false");
    }
  }

  function renderSuggestions(slot, matches, query) {
    slot.list.replaceChildren();
    slot.items = matches;
    slot.active = -1;
    if (!query || !matches.length) {
      slot.list.hidden = true;
      slot.input.setAttribute("aria-expanded", "false");
      if (query && !matches.length) setStatus(`No tire line matches “${query}”.`);
      return;
    }
    matches.forEach((match, index) => {
      const item = el("li");
      item.setAttribute("role", "presentation");
      const button = el("button", "", `${match.b} ${match.l}`);
      button.type = "button";
      button.id = `${slot.input.id}-option-${index}`;
      button.setAttribute("role", "option");
      const detail = el("span", "result-detail", `${formatNumber(match.n)} size ${match.n === 1 ? "row" : "rows"}`);
      button.append(detail);
      button.addEventListener("click", () => choose(slot, match));
      item.append(button);
      slot.list.append(item);
    });
    slot.list.hidden = false;
    slot.input.setAttribute("aria-expanded", "true");
    setStatus(`${matches.length} suggestion${matches.length === 1 ? "" : "s"}.`);
  }

  function choose(slot, match) {
    if (selectedIds().includes(match.id) && slot.id !== match.id) {
      setStatus("That line is already in the comparison.");
      return;
    }
    slot.id = match.id;
    slot.input.value = `${match.b} ${match.l}`;
    slot.list.hidden = true;
    slot.input.setAttribute("aria-expanded", "false");
    writeUrl(selectedIds());
    showSelected();
  }

  function addSlot(id = "") {
    if (slots.length >= COMPARE_MAX_LINES) return;
    const index = slots.length;
    const slot = { id, items: [], active: -1 };
    const wrap = el("div", "search");
    const label = el("label");
    label.append(document.createTextNode(`Tire line ${index + 1}`));
    const input = document.createElement("input");
    input.type = "search";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "Michelin Pilot Sport, or Assurance";
    input.id = `compare-line-${index + 1}`;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    const listId = `${input.id}-list`;
    input.setAttribute("aria-controls", listId);
    label.append(input);
    const list = el("ul", "results");
    list.id = listId;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    const remove = el("button", "button-ghost", "Remove");
    remove.type = "button";
    wrap.append(label, list, remove);
    picks.append(wrap);
    slot.wrap = wrap;
    slot.input = input;
    slot.list = list;
    slot.remove = remove;
    slots.push(slot);

    input.addEventListener("input", async () => {
      slot.id = "";
      const query = input.value.trim();
      try {
        const data = await ensureIndex();
        renderSuggestions(slot, filterCompareIndex(data.lines, query), query);
      } catch {
        setStatus("The tire-line index did not load.");
      }
    });
    input.addEventListener("focus", () => closeLists(slot));
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(slot, 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(slot, -1);
      } else if (event.key === "Escape") {
        slot.list.hidden = true;
        input.setAttribute("aria-expanded", "false");
      } else if (event.key === "Enter" && slot.active >= 0) {
        event.preventDefault();
        const match = slot.items[slot.active];
        if (match) choose(slot, match);
      }
    });
    remove.addEventListener("click", () => {
      if (slots.length <= COMPARE_MIN_LINES) {
        slot.id = "";
        slot.input.value = "";
        writeUrl(selectedIds());
        showSelected();
        return;
      }
      slot.wrap.remove();
      slots = slots.filter((item) => item !== slot);
      relabel();
      writeUrl(selectedIds());
      showSelected();
    });
    syncAdd();
    return slot;
  }

  function relabel() {
    slots.forEach((slot, index) => {
      const text = slot.wrap.querySelector("label").childNodes[0];
      text.textContent = `Tire line ${index + 1}`;
    });
    syncAdd();
  }

  function syncAdd() {
    addButton.hidden = slots.length >= COMPARE_MAX_LINES;
    for (const slot of slots) {
      slot.remove.textContent = slots.length > COMPARE_MIN_LINES ? "Remove" : "Clear";
    }
  }

  function move(slot, delta) {
    if (!slot.items.length) return;
    slot.active = (slot.active + delta + slot.items.length) % slot.items.length;
    [...slot.list.querySelectorAll('[role="option"]')].forEach((option, index) => {
      const selected = index === slot.active;
      option.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) {
        slot.input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function cell(text, className) {
    return el("td", className, text);
  }

  function summaryTable(records) {
    const wrap = el("div", "table-wrap");
    const table = document.createElement("table");
    const caption = el("caption", "", "UTQG grades NHTSA lists for these lines");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(el("th", "", "Measure"));
    headRow.lastChild.setAttribute("scope", "col");
    for (const record of records) {
      const th = document.createElement("th");
      th.scope = "col";
      const link = el("a", "", `${record.brand} ${record.line}`);
      link.href = record.url;
      th.append(link);
      headRow.append(th);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    const rows = [
      ["Size rows", (record) => formatNumber(record.sizeCount)],
      ["Treadwear minimum", (record) => statText(record.wearMin)],
      ["Treadwear median", (record) => formatMedian(record.wearMedian)],
      ["Treadwear maximum", (record) => statText(record.wearMax)],
      ["Traction", (record) => letterText(record.traction)],
      ["Temperature", (record) => letterText(record.temperature)],
    ];
    for (const [label, value] of rows) {
      const tr = document.createElement("tr");
      const th = el("th", "", label);
      th.scope = "row";
      tr.append(th);
      for (const record of records) tr.append(cell(value(record), "num"));
      body.append(tr);
    }
    table.append(caption, head, body);
    wrap.append(table);
    return wrap;
  }

  function sizeTable(record) {
    const wrap = el("div", "table-wrap");
    const table = document.createElement("table");
    table.append(el("caption", "", `Size rows NHTSA lists for ${record.brand} ${record.line}`));
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Size series", "Treadwear", "Traction", "Temperature"]) {
      const th = el("th", "", label);
      th.scope = "col";
      headRow.append(th);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const row of record.sizes) {
      const tr = document.createElement("tr");
      tr.append(cell(row.size, "tire-size"));
      tr.append(cell(formatWear(row.wear), "num utqg"));
      const trac = document.createElement("td");
      trac.append(gradeNode(row.trac, "trac"));
      const temp = document.createElement("td");
      temp.append(gradeNode(row.temp, "temp"));
      tr.append(trac, temp);
      body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
    return wrap;
  }

  function recallBlock(record) {
    const block = document.createElement("div");
    if (!record.recalls.length) {
      block.append(el("p", "", `NHTSA's tire-recall file has no row whose brand and line match ${record.brand} ${record.line}.`));
      return block;
    }
    const wrap = el("div", "table-wrap");
    const table = document.createElement("table");
    table.append(
      el(
        "caption",
        "",
        `Tire-recall rows whose brand and line match ${record.brand} ${record.line}. Units affected is the campaign total, repeated on each line of that campaign.`,
      ),
    );
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Campaign", "Report date", "Filer", "Units", "What the file says"]) {
      const th = el("th", "", label);
      th.scope = "col";
      headRow.append(th);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const row of record.recalls) {
      const tr = document.createElement("tr");
      const campaign = document.createElement("td");
      const link = el("a", "num", row.campaign);
      link.href = row.href;
      campaign.append(link);
      const date = document.createElement("td");
      date.className = "num";
      const time = document.createElement("time");
      time.dateTime = row.reportDate;
      time.textContent = formatUtcDate(row.reportDate);
      date.append(time);
      const note = document.createElement("td");
      note.append(document.createTextNode(`${row.text} `));
      const filings = el("a", "", "Filings for this brand");
      filings.href = row.whoHref;
      note.append(filings);
      tr.append(campaign, date, cell(row.filer), cell(formatNumber(row.units), "num"), note);
      body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
    block.append(wrap);
    return block;
  }

  function plantBlock(record) {
    const block = document.createElement("div");
    if (!record.plants.length) {
      block.append(
        el(
          "p",
          "",
          `No plant record is listed for ${record.brand} ${record.line}. A plant is listed only when a recall row for this line names a company that matches a registrant.`,
        ),
      );
      return block;
    }
    const wrap = el("div", "table-wrap");
    const table = document.createElement("table");
    table.append(
      el(
        "caption",
        "",
        `Plant records whose registrant name matches a company on a recall row for ${record.brand} ${record.line}. The record does not say the plant made the line.`,
      ),
    );
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Plant code", "Registrant", "City", "Country", "Status field", "Matched company"]) {
      const th = el("th", "", label);
      th.scope = "col";
      headRow.append(th);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const plant of record.plants) {
      const tr = document.createElement("tr");
      const code = document.createElement("td");
      const link = el("a", "num", plant.code);
      link.href = plant.url;
      code.append(link);
      tr.append(
        code,
        cell(plant.name),
        cell(plant.city || "Not reported"),
        cell(plant.country || "Not reported"),
        cell(plant.status || "Not reported"),
        cell(plant.matchedCompany),
      );
      body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
    block.append(wrap);
    return block;
  }

  function showRecords(records, notes) {
    results.replaceChildren();
    if (notes.length) {
      for (const note of notes) results.append(el("p", "", note));
    }
    if (records.length < COMPARE_MIN_LINES) {
      if (!notes.length) setStatus("Pick at least two tire lines.");
      return;
    }
    const answer = el("aside", "answer");
    answer.append(el("p", "answer-label", "Answer"));
    for (const sentence of compareAnswers(records)) answer.append(el("p", "", sentence));
    results.append(answer);
    results.append(summaryTable(records));
    results.append(el("h2", "", "Grades by size"));
    results.append(el("p", "", "Size rows are listed per line. NHTSA's size text is not a shared size code, so the rows are not lined up as the same fitment."));
    for (const record of records) results.append(sizeTable(record));
    results.append(el("h2", "", "Recall campaigns"));
    results.append(
      el(
        "p",
        "",
        "A recall row is included only when NHTSA's tire-recall file uses this brand and this line name. A filing covers that recalled line in that campaign. It does not cover the rest of the brand.",
      ),
    );
    for (const record of records) results.append(recallBlock(record));
    results.append(el("h2", "", "Registrant plants"));
    results.append(
      el(
        "p",
        "",
        "A plant is listed only when its registrant name matches a company named on a recall row for that line. The plant record has no brand field. The match is not proof that the plant made the line. Status is the value stored in vPIC, not a finding that the plant is operating.",
      ),
    );
    for (const record of records) results.append(plantBlock(record));
    setStatus(`Showing ${records.length} tire lines.`);
  }

  async function showSelected() {
    const ids = selectedIds();
    const notes = [];
    const rawCount = String(new URLSearchParams(window.location.search).get("lines") || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean).length;
    if (rawCount > COMPARE_MAX_LINES) notes.push("The tool compares up to 4 lines. Extra lines were left off.");
    const records = [];
    for (const id of ids) {
      try {
        const record = await loadRecord(id);
        if (!record) notes.push(`NHTSA's list has no tire line for ${id}.`);
        else records.push(record);
      } catch {
        notes.push(`The summary for ${id} did not load.`);
      }
    }
    showRecords(records, notes);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    writeUrl(selectedIds());
    showSelected();
  });
  addButton.addEventListener("click", () => addSlot());

  const initial = parseCompareLines(window.location.search);
  const slotCount = Math.max(COMPARE_MIN_LINES, initial.length);
  for (let index = 0; index < slotCount; index += 1) addSlot(initial[index] || "");
  applyRobots(root);
  if (initial.length) {
    ensureIndex()
      .then((data) => {
        const byId = new Map(data.lines.map((line) => [line.id, line]));
        slots.forEach((slot) => {
          const match = byId.get(slot.id);
          if (match) slot.input.value = `${match.b} ${match.l}`;
        });
      })
      .catch(() => setStatus("The tire-line index did not load."));
    showSelected();
  }

  window.addEventListener("popstate", () => {
    const ids = parseCompareLines(window.location.search);
    while (slots.length) {
      slots.pop().wrap.remove();
    }
    const count = Math.max(COMPARE_MIN_LINES, ids.length);
    for (let index = 0; index < count; index += 1) addSlot(ids[index] || "");
    applyRobots(root);
    if (ids.length) showSelected();
    else {
      results.replaceChildren();
      setStatus("");
    }
  });
}
