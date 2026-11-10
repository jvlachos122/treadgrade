import { candidateAgeCopy, purchaseNote } from "../lib/dot-age.js";
import { buildAgeReminderIcs, reminderWeeks } from "../lib/dot-ics.js";
import { formatUtcDate, formatUtcDay } from "../lib/format.js";
import { decodeTin, indexPlants, plantRecordCaveat } from "../lib/tin.js";

function section(title) {
  const wrap = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = title;
  wrap.append(heading);
  return wrap;
}

function paragraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function dataNote(label, text) {
  const note = document.createElement("div");
  note.className = "notice";
  const chip = document.createElement("p");
  chip.className = "data-note-label";
  chip.textContent = label;
  note.append(chip, paragraph(text));
  return note;
}

function dotCode(result) {
  const row = document.createElement("p");
  row.className = "dot-code";
  const parts = [
    result.plantCode ? { text: result.plantCode, decoded: true } : null,
    result.middle ? { text: result.middle, decoded: false } : null,
    result.date?.raw ? { text: result.date.raw, decoded: true } : null,
    result.date?.triangle ? { text: "△", decoded: false, hidden: "1990s triangle" } : null,
  ].filter(Boolean);
  if (!parts.length && result.normalized) parts.push({ text: result.normalized, decoded: false });
  for (const part of parts) {
    const span = document.createElement("span");
    if (part.decoded) span.className = "is-decoded";
    span.textContent = part.text;
    if (part.hidden) {
      const extra = document.createElement("span");
      extra.className = "visually-hidden";
      extra.textContent = ` ${part.hidden}`;
      span.append(extra);
    }
    row.append(span);
  }
  return parts.length ? row : null;
}

function caveats(result, place) {
  return result.notes.filter((note) => note.caveat && note.place === place);
}

function appendCaveats(parent, result, place) {
  for (const note of caveats(result, place)) parent.append(dataNote(note.label || "About this data", note.text));
}

function downloadCalendar(filename, body) {
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function initDecoder(root) {
  const form = root.querySelector("form");
  const input = form.elements.namedItem("tin");
  const triangleInput = form.elements.namedItem("triangle");
  const purchaseInput = root.querySelector("#purchased");
  const output = root.querySelector("[data-output]");
  const remindStatus = root.querySelector("[data-remind-status]");
  let plants = null;

  function place(plant) {
    return [plant.address, [plant.city, plant.state].filter(Boolean).join(", "), plant.postal, plant.country]
      .filter(Boolean)
      .join(", ");
  }

  function render(result, now) {
    const purchase = purchaseInput ? purchaseInput.value : "";
    output.replaceChildren();
    const summary = section("Reading");
    const chips = dotCode(result);
    if (chips) summary.append(chips);
    if (result.normalized) {
      const symbols = document.createElement("p");
      symbols.append(document.createTextNode("Symbols used: "));
      const code = document.createElement("span");
      code.className = "code";
      code.textContent = result.normalized;
      symbols.append(code);
      summary.append(symbols);
    } else {
      summary.append(paragraph("Nothing usable was left after cleaning the entry."));
    }
    appendCaveats(summary, result, "reading");
    output.append(summary);

    const plantSection = section("Plant");
    if (!result.matches.length) {
      if (!result.plantCode) plantSection.append(paragraph("No plant code in this entry."));
    } else {
      const list = document.createElement("ul");
      for (const plant of result.matches) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = plant.url;
        const code = document.createElement("span");
        code.className = "code";
        code.textContent = plant.code;
        link.append(code);
        if (plant.matchedOn === "old") link.append(document.createTextNode(` (matched former code ${result.plantCode})`));
        item.append(link, document.createTextNode(` — ${plant.name}. ${place(plant)}.`));
        if (plant.status) item.append(document.createTextNode(` vPIC status field: ${plant.status}.`));
        list.append(item);
      }
      plantSection.append(list);
      plantSection.append(dataNote("Data-quality note", plantRecordCaveat));
    }
    appendCaveats(plantSection, result, "plant");
    output.append(plantSection);

    const dateSection = section("Date and age");
    if (!result.date) {
      dateSection.append(paragraph("No manufacture week was read."));
    } else if (result.date.style === "four") {
      const candidate = result.date.candidates[0];
      const sentences = candidateAgeCopy(candidate, now, purchase, formatUtcDay, formatUtcDate);
      sentences[0] = `Date code ${result.date.raw}: ${sentences[0]}`;
      for (const sentence of sentences) dateSection.append(paragraph(sentence));
    } else {
      const marked = result.date.candidates.find((item) => item.triangleYear);
      const digit = result.date.raw.slice(2);
      dateSection.append(
        paragraph(
          marked
            ? `Date code ${result.date.raw}: week ${result.date.week}, year digit ${digit}. Triangle reading: ${marked.year}. Other years the digits match:`
            : `Date code ${result.date.raw}: week ${result.date.week}, year digit ${digit}. Possible years:`,
        ),
      );
      const list = document.createElement("ul");
      for (const candidate of result.date.candidates) {
        const item = document.createElement("li");
        item.textContent = candidateAgeCopy(candidate, now, purchase, formatUtcDay, formatUtcDate).join(" ");
        list.append(item);
      }
      dateSection.append(list);
    }
    const invalidPurchase = purchaseNote(purchase);
    if (invalidPurchase) dateSection.append(paragraph(invalidPurchase));
    appendCaveats(dateSection, result, "date");
    output.append(dateSection);

    const plain = result.notes.filter((note) => !note.caveat);
    if (plain.length) {
      const notes = section("Notes");
      const list = document.createElement("ul");
      for (const note of plain) {
        const item = document.createElement("li");
        item.textContent = note.text;
        list.append(item);
      }
      notes.append(list);
      output.append(notes);
    }

    const more = document.createElement("p");
    const guide = document.createElement("a");
    guide.href = "/guides/dot-code/";
    guide.textContent = "How to read a DOT code";
    more.append(guide);
    more.append(document.createTextNode(" · "));
    const dateGuide = document.createElement("a");
    dateGuide.href = "/guides/tire-date-code/";
    dateGuide.textContent = "How to read a tire date code";
    more.append(dateGuide);
    if (result.matches.length === 1) {
      more.append(document.createTextNode(" · "));
      const plantLink = document.createElement("a");
      plantLink.href = result.matches[0].url;
      plantLink.append(document.createTextNode("Plant "));
      const code = document.createElement("span");
      code.className = "code";
      code.textContent = result.matches[0].code;
      plantLink.append(code);
      more.append(plantLink);
    }
    output.append(more);
  }

  async function run(value) {
    if (!plants) {
      const response = await fetch("/data/plants.json");
      if (!response.ok) throw new Error("plants");
      plants = indexPlants(await response.json());
    }
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("tin", value);
    else url.searchParams.delete("tin");
    if (triangleInput.checked) url.searchParams.set("triangle", "1");
    else url.searchParams.delete("triangle");
    history.replaceState(null, "", url);
    const now = new Date();
    render(decodeTin(value, plants, now, { triangle: triangleInput.checked }), now);
  }

  function remind(years) {
    if (!plants || !input.value.trim()) {
      if (remindStatus) remindStatus.textContent = "Decode a date code first. The file is built from that production week.";
      return;
    }
    const result = decodeTin(input.value, plants, new Date(), { triangle: triangleInput.checked });
    const weeks = reminderWeeks(result);
    if (!weeks.length) {
      if (remindStatus) remindStatus.textContent = "No production week was read, so there is no calendar file.";
      return;
    }
    const body = buildAgeReminderIcs({
      years,
      plantCode: result.plantCode || "",
      dateCode: result.date?.raw || "",
      weeks,
      dtstamp: new Date(),
    });
    if (!body) {
      if (remindStatus) remindStatus.textContent = "That year count is not one of the calendar choices.";
      return;
    }
    const raw = result.date?.raw || "date";
    downloadCalendar(`production-week-${raw}-${years}-years.ics`, body);
    if (remindStatus) remindStatus.textContent = `Calendar file for ${years} years after the production week, built in this browser.`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(input.value).catch(() => {
      output.replaceChildren(paragraph("The plant list did not load, so the code could not be decoded."));
    });
  });
  if (purchaseInput) {
    purchaseInput.addEventListener("change", () => {
      if (input.value.trim()) run(input.value).catch(() => {});
    });
  }
  for (const button of root.querySelectorAll("[data-remind]")) {
    button.addEventListener("click", () => {
      remind(Number(button.dataset.remind));
    });
  }
  for (const button of root.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      input.value = button.dataset.example;
      triangleInput.checked = button.dataset.triangle === "1";
      run(input.value).catch(() => {});
    });
  }
  const params = new URLSearchParams(window.location.search);
  const initial = params.get("tin");
  const triangleFlag = params.get("triangle");
  if (triangleFlag === "1" || triangleFlag === "on") triangleInput.checked = true;
  if (initial) {
    input.value = initial;
    run(initial).catch(() => {
      output.replaceChildren(paragraph("The plant list did not load, so the code could not be decoded."));
    });
  }
}
