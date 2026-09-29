import type { NarrativeContext } from "../schemas/text-world";

/** Provider input only. Validation, fallback and saves retain the full engine context. */
export function narrationRequest(context: NarrativeContext) {
  const { results: _results, direction, nextChoices, paragraphCount, ...scene } = context;
  return {
    ...scene,
    // requiredFacts already contains the ordered events and their complete state changes.
    // Keeping a second results array made the same action dominate the prose twice.
    paragraphCount: { ...paragraphCount, preferred: paragraphCount.min },
    ...(direction ? {
      direction: {
        focusTargetId: direction.focusTargetId,
        // These are causal links, not a paragraph outline or one beat per sentence.
        detailLinks: direction.beats.filter(beat => beat.detailFactIds.length > 0)
          .map(({ resultFactIds, detailFactIds }) => ({ resultFactIds, detailFactIds })),
      },
    } : {}),
    ...(nextChoices ? { nextChoices: nextChoices.map(({ selectionSignature: _signature, ...choice }) => choice) } : {}),
  };
}
