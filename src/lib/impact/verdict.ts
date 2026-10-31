export type Verdict = "safe_to_ship" | "ship_with_caution" | "do_not_ship";

export function computeVerdict(s: { breakingHits: number; potentialHits: number; breakingChanges: number }): { verdict: Verdict; reason: string } {
  if (s.breakingHits > 0)
    return { verdict: "do_not_ship", reason: `${s.breakingHits} breaking change(s) hit declared consumers.` };
  if (s.potentialHits > 0)
    return { verdict: "ship_with_caution", reason: `${s.potentialHits} potentially breaking change(s) affect declared consumers.` };
  if (s.breakingChanges > 0)
    return { verdict: "ship_with_caution", reason: "Breaking changes exist but no declared consumer uses them. The consumer map may be incomplete." };
  return { verdict: "safe_to_ship", reason: "No breaking or potentially breaking changes affect any declared consumer." };
}