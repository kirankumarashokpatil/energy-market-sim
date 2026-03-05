/**
 * Gate‑closure helper for BM bids.
 *
 * Rules:
 *  - Bids are only accepted when phase === "BM".
 *  - After gate closure (timer expired), new bids must be rejected.
 *
 * msLeftMs is the remaining time in milliseconds for the current SP phase.
 * We treat msLeftMs <= 0 as "gate closed".
 */
export function canSubmitBmBid(phase, msLeftMs = Infinity) {
  if (phase !== "BM") return false;
  return msLeftMs > 0;
}


