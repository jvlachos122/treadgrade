export function refreshContent(url) {
  return `0;url=${url}`;
}

export function redirectCopy(redirect) {
  if (redirect.kind === "brand") {
    return {
      title: `${redirect.fromName} moved to ${redirect.toName}`,
      heading: `${redirect.fromName} points at ${redirect.toName}`,
      linkLabel: `${redirect.toName} UTQG grades`,
      sentences: [
        `${redirect.fromName} and ${redirect.toName} are one brand in NHTSA's UTQG file because the names differ only by punctuation.`,
        `The rows are on the ${redirect.toName} page, and ${redirect.toName} is the spelling NHTSA uses on the most rows.`,
      ],
    };
  }
  return {
    title: `${redirect.fromName} ${redirect.fromLine} moved`,
    heading: `${redirect.fromName} ${redirect.fromLine}`,
    linkLabel: `${redirect.toName} ${redirect.toLine} UTQG grades`,
    sentences: [
      `${redirect.fromName} ${redirect.fromLine} is published with ${redirect.toName} ${redirect.toLine} because the brand names differ only by punctuation.`,
      "This address points at that tire-line page.",
    ],
  };
}
