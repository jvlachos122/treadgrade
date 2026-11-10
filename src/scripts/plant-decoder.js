import { packedPlantCodes } from "virtual:decoder-plant-codes";
import { plantsIndexFromPacked } from "../lib/decoder-plants.js";
import { candidateAgeCopy } from "../lib/dot-age.js";
import { decoderPath, plantMatchParts, samePlantHref } from "../lib/dot-reading.js";
import { formatUtcDate, formatUtcDay } from "../lib/format.js";
import { decodeTin } from "../lib/tin.js";

const plants = plantsIndexFromPacked(packedPlantCodes);

function paragraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function renderMatch(part) {
  const p = document.createElement("p");
  if (part.text) {
    p.textContent = part.text;
    return p;
  }
  p.append(document.createTextNode(part.before || ""));
  const href = samePlantHref(part.href, part.code);
  const code = document.createElement("span");
  code.className = "code";
  code.textContent = part.code;
  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.append(code);
    p.append(link);
  } else {
    p.append(code);
  }
  p.append(document.createTextNode(part.after || ""));
  return p;
}

export function initPlantDecoder(root) {
  const pageCode = root.dataset.plantCode || "";
  const form = root.querySelector("form");
  const input = form.elements.namedItem("tin");
  const triangleInput = form.elements.namedItem("triangle");
  const output = root.querySelector("[data-output]");
  const full = root.querySelector("[data-full-decoder]");
  const baseHref = full?.getAttribute("href") || decoderPath(pageCode);

  function render(value) {
    const now = new Date();
    const triangle = Boolean(triangleInput?.checked);
    const result = decodeTin(value, plants, now, { triangle });
    output.replaceChildren();
    if (full) full.href = String(value || "").trim() ? decoderPath(value, { triangle }) : baseHref;
    if (!result.normalized) {
      for (const note of result.notes) {
        if (note.level === "error") output.append(paragraph(note.text));
      }
      return;
    }
    const symbols = document.createElement("p");
    symbols.append(document.createTextNode("Symbols used: "));
    const code = document.createElement("span");
    code.className = "code";
    code.textContent = result.normalized;
    symbols.append(code);
    output.append(symbols);
    for (const part of plantMatchParts(result, pageCode)) output.append(renderMatch(part));
    if (!result.date) output.append(paragraph("No manufacture week was read."));
    else {
      for (const candidate of result.date.candidates) {
        for (const sentence of candidateAgeCopy(candidate, now, "", formatUtcDay, formatUtcDate)) {
          output.append(paragraph(sentence));
        }
      }
    }
    for (const note of result.notes) {
      if (note.level === "error") output.append(paragraph(note.text));
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render(input.value);
  });
}
