/**
 * Visible question and answer for a plant page. The JSON-LD repeats these
 * strings, so a wording change belongs here and on the page together.
 */
export function plantDateFaq(code) {
  const plantCode = String(code || "").trim().toUpperCase();
  return {
    name: `How do I find the date on a tire with plant code ${plantCode}?`,
    text: `The date is the last four digits of the full DOT code on one sidewall: two digits for the week, then two digits for the year. Paste that code in the box above. If this sidewall shows only plant code ${plantCode}, check the other sidewall for the date.`,
  };
}
