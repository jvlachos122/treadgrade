/**
 * Published tire-age positions quoted from pages retrieved on TIRE_AGE_RETRIEVED.
 * A row exists only when that page was opened and the sentence was on it.
 * This module does not add a year of its own.
 */

import { formatUtcDate, formatUtcDay } from "./format.js";
import { article } from "./structured.js";
import { nhtsaWeekRange } from "./tin.js";

export const TIRE_AGE_PATH = "/guides/tire-age/";
export const TIRE_AGE_RETRIEVED = "2026-11-09";
export const TIRE_AGE_EXAMPLE = "2319";

/** Verdicts this page must not make. Quoted source wording is held to the same line. */
export const BANNED_AGE_VERDICT =
  /\b(unsafe|not safe|your tires are|you should replace|you must replace|we recommend you|stop driving|do not drive|too old to|good tire|bad tire|worth buying)\b/i;

export const TIRE_AGE_SOURCES = [
  {
    id: "nhtsa-tirewise",
    organisation: "National Highway Traffic Safety Administration",
    pageLabel: "TireWise",
    url: "https://www.nhtsa.gov/vehicle-safety/tires",
    retrieved: TIRE_AGE_RETRIEVED,
    quotes: [
      "Tire aging occurs when the rubber and other components in a tire change over time due to service, storage, and environmental conditions.",
      "As tires age, they are more prone to failure. Some vehicle and tire manufacturers recommend replacing tires that are six to 10 years old, regardless of treadwear.",
    ],
    dateQuote: "If the TIN reads 0308 it was made in the third week of 2008.",
  },
  {
    id: "nhtsa-summer",
    organisation: "National Highway Traffic Safety Administration",
    pageLabel: "Summer driving tips",
    url: "https://www.nhtsa.gov/summer-driving-tips",
    retrieved: TIRE_AGE_RETRIEVED,
    lead: "Under the tire checklist, the page says:",
    quotes: ["Some vehicle manufacturers recommend replacing tires every six years regardless of use."],
  },
  {
    id: "ustma",
    organisation: "U.S. Tire Manufacturers Association",
    pageLabel: "Tire facts",
    url: "https://www.ustires.org/tires-101/tire-facts",
    retrieved: TIRE_AGE_RETRIEVED,
    lead: "The guideline sentence is about full-size spare tires and vehicles that are not driven regularly, including classic cars, sports cars, other seasonal vehicles, and vehicles used only for local, occasional driving.",
    quotes: [
      "Service and storage conditions vary widely, so accurately predicting the actual serviceable life of any specific tire based on simple calendar age alone is not possible.",
      "In these vehicles, the tire's age is more important, since tread wear will not tell you when it's time for new tires. In these cases, we recommend that you follow your tire manufacturer's tire service life guidelines.",
      "Please keep in mind that a tire or vehicle manufacturer's recommendation is not a guarantee or indication of the minimum serviceable life for your tire.",
    ],
  },
  {
    id: "michelin",
    organisation: "Michelin",
    pageLabel: "When to replace tires",
    url: "https://www.michelinman.com/auto/auto-tips-and-advice/tire-buying-guide/when-do-i-need-new-tires",
    retrieved: TIRE_AGE_RETRIEVED,
    quotes: [
      "After five years of service, tires should be thoroughly inspected at least once a year by a trained tire professional.",
      "This recommendation applies even if the tires appear to be in good condition and have not yet reached the treadwear indicators.",
      "As a precaution, Michelin recommends replacing tires ten years after their date of manufacture, regardless of remaining tread depth or apparent condition. This recommendation includes spare tires.",
      "For vehicles equipped with original equipment tires, always follow the vehicle manufacturer's recommendations for tire replacement.",
      "While tire age alone does not determine whether a tire is serviceable, it is an important factor when considered alongside wear, condition, and performance indicators.",
    ],
  },
  {
    id: "bridgestone",
    organisation: "Bridgestone",
    pageLabel: "Buying new tires FAQ",
    url: "https://tires.bridgestone.com/en-us/learn/faqs",
    retrieved: TIRE_AGE_RETRIEVED,
    quotes: [
      "Bridgestone follows the recommendations of the industry associations regarding tire life and inspection guidelines.",
      "We recommend that, in addition to regular tire inspections, customers have their tires inspected by a qualified tire service person after five (5) years of use to determine if the tires can continue in service.",
      "It is recommended that spare tires be inspected at the same time.",
      "Further, even when tires appear to be usable from their external appearance or the tread depth may have not reached the minimum wear out depth, it is recommended that all tires (including spare tires) that were manufactured more than ten (10) years previous be replaced with new tires.",
    ],
  },
  {
    id: "continental",
    organisation: "Continental",
    pageLabel: "Replacing tires",
    url: "https://www.continental-tires.com/tire-knowledge/replacing-tires/",
    retrieved: TIRE_AGE_RETRIEVED,
    quotes: [
      "Continental is not aware of any technical data to support the removal of service for tires past a specific age.",
      "Together with other members of the tire and automotive industries, Continental advises that all tires (including spare tires) made more than ten years ago should be removed from service and replaced with new tires.",
      "The tires seem to be in good condition and appear usable based on their external appearance.",
      "The wear to the tread has not passed the minimum legal limit.",
      "Some vehicle manufacturers may recommend a different chronological age at which to replace a tire.",
    ],
    lead: "The ten-year sentence is followed by two conditions, introduced with \"You should follow this advice even if:\".",
  },
  {
    id: "goodyear",
    organisation: "Goodyear",
    detail: "Quoted from Cooper Tire's page",
    pageLabel: "How long do tires last?",
    url: "https://www.coopertire.com/en_US/tire-education/learn-tire-maintenance/how-long-does-a-tire-last.html",
    retrieved: TIRE_AGE_RETRIEVED,
    lead: "Cooper Tire's education page states this Goodyear position.",
    quotes: [
      "It is impossible to predict when a tire should be replaced based on its calendar age alone.",
      "Although no widely accepted scientific research exists to show that chronological aging alone adversely affects a tire, and if so, how those effects occur, over what time period, etc., the longer a tire is in service, the more opportunities there are for it to be exposed to adverse environmental or service conditions.",
      "Therefore, the older a tire the greater the chance that it will need to be replaced due to service-related or storage conditions.",
      "While most tires will be replaced sooner, Goodyear recommends that any tire in service (meaning inflated and mounted on a rim of your vehicle, including your spare tire regardless of whether that tire is in contact with the roadway) 6 years or more be replaced even if such tire appears serviceable and even if it has not reached the legal treadwear limit.",
      "If you are unable to determine the date a tire was first placed in service, then you should rely on the DOT code stamped on the tire and ensure that any tire which was manufactured more than 6 years ago is removed from service (see below for how to read a tire's DOT code).",
      "Goodyear advises that consumers refer to their owners' manuals for guidance on the vehicle manufacturer's replacement recommendations (but regardless of any such vehicle manufacturer's advice, any tire's replacement period should not exceed 6 years from the date the tire is placed in service or 6 years from the date included in the DOT code on the sidewall of the tire if you are unable to determine the date the tire was first placed in service).",
    ],
  },
  {
    id: "discount-tire",
    organisation: "Discount Tire",
    pageLabel: "Tire safety practices",
    url: "https://www.discounttire.com/learn/tire-safety",
    retrieved: TIRE_AGE_RETRIEVED,
    quotes: [
      "Always consult the owner's manual of your vehicle and your tire manufacturer's included literature for specific information about your vehicle/tire performance.",
      "The intent of Discount Tire is to supplement and not to supersede this material.",
      "In the event of a conflict, always rely on the recommendations of your vehicle and tire manufacturer.",
      "Most tire and auto manufacturers recommend replacing your tires between 6-10 years.",
      "At Discount Tire, we recommend replacing any tire that is 6 years or more past the date of manufacture; we will not service tires that are 10 years or more past this date.",
    ],
  },
  {
    id: "tire-rack",
    organisation: "Tire Rack",
    pageLabel: "How long do tires last?",
    url: "https://www.tirerack.com/upgrade-garage/how-long-do-tires-last",
    retrieved: TIRE_AGE_RETRIEVED,
    quotes: [
      "When it comes to installing tires that are within 2, 3 or even 4 years from the date of manufacture, common questions we get from customers are often things like \"how old should my tires be?\" or \"how long should my tires last?\"",
      "Properly stored tires don't really begin to age until they are put into service on a vehicle.",
      "Typically, manufacturers set an internal threshold that tires must be sent into distribution channels before they reach 3 years from the date of production, though they're often sent out well before that.",
      "Once they're received by a Tire Rack warehouse, where proper storage conditions are maintained, we allow for an additional year, for a total limit of 4 years.",
      "Tires close to that threshold are often sold at a discount as a courtesy, despite being functionally brand new.",
      "Tire Rack's policy on tire lifespan is in-line with other supervisory bodies: approximately 6 years of service and 10 years from the manufacturing date are the rough limits of tire usage.",
    ],
  },
];

export function tireAgeSource(id, sources = TIRE_AGE_SOURCES) {
  const source = sources.find((item) => item.id === id);
  if (!source) throw new Error(`missing tire-age source ${id}`);
  return source;
}

export function tireAgeRetrievedLabel(iso = TIRE_AGE_RETRIEVED) {
  return formatUtcDate(iso);
}

export function quotedPosition(source) {
  const body = source.quotes.map((sentence) => `"${sentence}"`).join(" ");
  return source.lead ? `${source.lead} ${body}` : body;
}

export function positionsCaption(sources = TIRE_AGE_SOURCES) {
  const when = tireAgeRetrievedLabel(sources[0]?.retrieved || TIRE_AGE_RETRIEVED);
  const rows = sources.length === 1 ? "One row is the page" : "One row is one page";
  return `Published tire-age positions retrieved ${when}. ${rows} read that day.`;
}

export function tireAgeAnswer(sources = TIRE_AGE_SOURCES) {
  const when = tireAgeRetrievedLabel(sources[0]?.retrieved || TIRE_AGE_RETRIEVED);
  const pages = sources.length;
  const noun = pages === 1 ? "page" : "pages";
  return [
    `Published positions on tire age differ across the ${pages} ${noun} in the table below, retrieved ${when}.`,
    "The pages do not share one number of years or one starting point: manufacture date, time in service, and a limit on tires a retailer sells all appear.",
  ];
}

export function tireAgeSourceLine(sources = TIRE_AGE_SOURCES) {
  const tirewise = tireAgeSource("nhtsa-tirewise", sources);
  const summer = tireAgeSource("nhtsa-summer", sources);
  const when = tireAgeRetrievedLabel(tirewise.retrieved);
  return `Source: NHTSA ${tirewise.pageLabel} and ${summer.pageLabel}, last updated ${when} (UTC).`;
}

function listNames(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function otherSourceSentence(sources = TIRE_AGE_SOURCES) {
  const names = [];
  for (const source of sources) {
    if (source.id.startsWith("nhtsa")) continue;
    if (!names.includes(source.organisation)) names.push(source.organisation);
  }
  const when = tireAgeRetrievedLabel(sources[0]?.retrieved || TIRE_AGE_RETRIEVED);
  return `The table also quotes ${listNames(names)}, retrieved ${when}. Each row links to the page.`;
}

export function dateCodeExample(code = TIRE_AGE_EXAMPLE) {
  const week = Number(code.slice(0, 2));
  const year = 2000 + Number(code.slice(2));
  const range = nhtsaWeekRange(year, week);
  const startLabel = formatUtcDay(range.start);
  const endLabel = formatUtcDay(range.end);
  return {
    code,
    week,
    year,
    start: range.start,
    end: range.end,
    validWeek: range.validWeek,
    startLabel,
    endLabel,
    sentence: `${code} is week ${week} of ${year}. Under the Sunday-start week this site uses for a four-digit date, that week is ${startLabel} through ${endLabel}.`,
  };
}

export function dateSectionSentences(example = dateCodeExample()) {
  const nhtsa = tireAgeSource("nhtsa-tirewise");
  return [
    "The last four digits of a DOT tire identification number are the date code: the first two are the week, and the last two are the year.",
    "This site's decoder reads those year digits as 2000 through 2099.",
    example.sentence,
    "NHTSA's TireWise page uses that same order for its own example.",
    nhtsa.dateQuote,
  ];
}

export function unknownSectionSentences() {
  return [
    "This page is not advice about a particular tire.",
    "A manufacture week names when the tire was made. Storage, use, inflation, damage, and tread depth are separate facts.",
    "NHTSA's TireWise page says tire aging is a change over time from service, storage, and environmental conditions.",
    "The U.S. Tire Manufacturers Association says service and storage conditions vary so widely that calendar age alone cannot predict the service life of a specific tire.",
    "Michelin's page says tire age alone does not determine whether a tire is serviceable.",
    "This page quotes those positions. It does not inspect a tire, and it does not decide whether a tire should stay in service. A tire professional can inspect a tire, including a spare.",
    "A date code is not a recall match. The recall list and the data-sources page describe other NHTSA files. Those files are not a tire-age policy.",
  ];
}

export function tireAgeFaqs(example = dateCodeExample(), sources = TIRE_AGE_SOURCES) {
  const when = tireAgeRetrievedLabel(sources[0]?.retrieved || TIRE_AGE_RETRIEVED);
  const pages = sources.length;
  return [
    {
      name: "How old is too old for a tire?",
      text: `The ${pages} pages retrieved ${when} do not share one number of years. NHTSA describes manufacturer recommendations as six to 10 years on TireWise and as every six years on its summer driving page. Other quoted figures include ten years after their date of manufacture, any tire in service for 6 years or more, and a total limit of 4 years. The U.S. Tire Manufacturers Association says calendar age alone cannot predict service life. This page quotes the pages and does not inspect a tire.`,
    },
    {
      name: `What does the date code ${example.code} mean?`,
      text: `${example.sentence} The decoder reads a four-digit year as 2000 through 2099. The date-code guide covers the Sunday-through-Saturday week and the older three-digit form.`,
    },
    {
      name: "Where does a two-year-old date code sit?",
      text: "Tire Rack discusses installing tires within 2, 3 or even 4 years from the date of manufacture and states a total limit of 4 years. Michelin quotes an inspection after five years of service, and Bridgestone quotes an inspection after five (5) years of use. The other quoted replacement figures are 6 or 10 years, or six to 10 years. A two-year manufacture date is a smaller count than the 6-year and 10-year figures. The U.S. Tire Manufacturers Association says calendar age alone does not predict service life. This comparison is not an inspection.",
    },
    {
      name: "Where does a seven-year-old date code sit?",
      text: "A manufacture date seven years before the reading is past the quoted 6-year replacement figures and short of the quoted 10-year figures. Those 6-year figures do not share a starting point: Goodyear counts time in service, and Discount Tire counts from the date of manufacture. NHTSA's TireWise sentence describes manufacturer recommendations as six to 10 years. Discount Tire says it will not service a tire at 10 years or more past the date of manufacture. This comparison is not an inspection.",
    },
  ];
}

export function tireAgeJsonLd({ description, dateModified, faqs }) {
  return [
    article({
      headline: "How old is too old for tires",
      description,
      path: TIRE_AGE_PATH,
      dateModified,
    }),
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.name,
        acceptedAnswer: { "@type": "Answer", text: item.text },
      })),
    },
  ];
}

export function tireAgeText(sources = TIRE_AGE_SOURCES) {
  const example = dateCodeExample();
  const faqs = tireAgeFaqs(example, sources);
  return [
    ...tireAgeAnswer(sources),
    tireAgeSourceLine(sources),
    otherSourceSentence(sources),
    positionsCaption(sources),
    ...sources.flatMap((source) => [source.organisation, source.detail || "", source.lead || "", source.pageLabel, ...source.quotes, source.dateQuote || ""]),
    ...dateSectionSentences(example),
    ...unknownSectionSentences(),
    ...faqs.flatMap((item) => [item.name, item.text]),
  ].join("\n");
}
