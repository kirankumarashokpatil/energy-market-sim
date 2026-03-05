import { describe, it, expect } from "vitest";
import { canSubmitBmBid } from "./GateLogic.js";

describe("GateLogic", () => {
  it("allows BM bids only during BM phase", () => {
    expect(canSubmitBmBid("BM", 10_000)).toBe(true);
    expect(canSubmitBmBid("DA", 10_000)).toBe(false);
    expect(canSubmitBmBid("ID", 10_000)).toBe(false);
    expect(canSubmitBmBid("SETTLED", 10_000)).toBe(false);
    expect(canSubmitBmBid("UNKNOWN", 10_000)).toBe(false);
  });

  it("enforces gate closure based on timer expiry", () => {
    const phase = "BM";

    // 1 second before gate closure → bid accepted
    expect(canSubmitBmBid(phase, 1000)).toBe(true);

    // At or after gate closure instant → bid rejected
    expect(canSubmitBmBid(phase, 0)).toBe(false);
    expect(canSubmitBmBid(phase, -1)).toBe(false);
  });
});


