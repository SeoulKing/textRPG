function narrativeFingerprint(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[“”"'‘’`]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function narrativeSentences(value: string) {
  const sentences = value.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) ?? [];
  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

export function withoutRepeatedSubwayNarrative(
  paragraphs: string[],
  alreadyDisplayed: string[] = [],
) {
  const seen = new Set(
    alreadyDisplayed
      .flatMap(narrativeSentences)
      .map(narrativeFingerprint)
      .filter(Boolean),
  );

  return paragraphs.flatMap((paragraph) => {
    const freshSentences = narrativeSentences(paragraph).filter((sentence) => {
      const fingerprint = narrativeFingerprint(sentence);
      if (!fingerprint || seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
    const freshParagraph = freshSentences.join(" ").trim();
    return freshParagraph ? [freshParagraph] : [];
  });
}
