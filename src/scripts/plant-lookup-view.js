function paragraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function matchText(row) {
  if (row.matchedOn === "old") return `Former code ${row.queryCode}`;
  if (row.matchedOn === "current") return "Current code";
  return "Registrant begins with the brand";
}

function statusText(row) {
  if (row.status) return row.status;
  if (row.name) return "Not stated";
  return "";
}

export function renderPlantLookup(output, result) {
  if (!output) return;
  output.replaceChildren();
  if (!result?.sentences?.length) return;
  for (const sentence of result.sentences) output.append(paragraph(sentence));
  if (result.brandUrl) {
    const p = document.createElement("p");
    p.append(document.createTextNode("Open the "));
    const link = document.createElement("a");
    link.href = result.brandUrl;
    link.textContent = `${result.brandName} brand page`;
    p.append(link, document.createTextNode("."));
    output.append(p);
  }
  if (!result.rows?.length || !result.caption) return;
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent = result.caption;
  table.append(caption);
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Code", "Match", "Registrant", "City", "Country", "vPIC status"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const row of result.rows) {
    const tr = document.createElement("tr");
    const codeCell = document.createElement("td");
    const link = document.createElement("a");
    link.href = row.url;
    const code = document.createElement("span");
    code.className = "code";
    code.textContent = row.code;
    link.append(code);
    codeCell.append(link);
    const matchCell = document.createElement("td");
    matchCell.textContent = matchText(row);
    const nameCell = document.createElement("td");
    nameCell.textContent = row.name;
    const cityCell = document.createElement("td");
    cityCell.textContent = row.city;
    const countryCell = document.createElement("td");
    countryCell.textContent = row.country;
    const statusCell = document.createElement("td");
    statusCell.textContent = statusText(row);
    tr.append(codeCell, matchCell, nameCell, cityCell, countryCell, statusCell);
    body.append(tr);
  }
  table.append(head, body);
  wrap.append(table);
  output.append(wrap);
}
