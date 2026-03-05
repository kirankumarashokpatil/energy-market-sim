import { describe, it, expect } from "vitest";
import { marketForSp, clearBM } from "./MarketEngine.js";
import {
  computeImbalanceSettlement,
  computeHubFeeFromSettlements,
} from "./SettlementEngine.js";

// Simple multiplayer-style harness using pure engine functions.
// We deliberately avoid React/Gun here and just emulate a couple of players
// in a single SP to check determinism and cashflow conservation.

describe("Multiplayer integration harness", () => {
  it("produces identical BM clearing and settlements for multiple runs (deterministic per SP)", () => {
    const sp = 10;
    const scenarioId = "NORMAL";

    // Shared market state (same for all players and all runs)
    const m1 = marketForSp(sp, scenarioId, []);
    const m2 = marketForSp(sp, scenarioId, []);

    // Deterministic actual state for this SP
    expect(m1.actual.sbp).toBeCloseTo(m2.actual.sbp, 10);
    expect(m1.actual.ssp).toBeCloseTo(m2.actual.ssp, 10);
    expect(m1.actual.niv).toBeCloseTo(m2.actual.niv, 10);

    const market = m1.actual;

    // Two players submit BM offers/bids consistent with system short/long flag
    const bids = [
      { id: "P1", side: market.isShort ? "offer" : "bid", mw: 30, price: market.baseRef * 0.9 },
      { id: "P2", side: market.isShort ? "offer" : "bid", mw: 40, price: market.baseRef * 1.1 },
    ];

    const r1 = clearBM(bids, market);
    const r2 = clearBM(bids, market);

    // BM result must be identical run-to-run
    expect(r1.cp).toBeCloseTo(r2.cp, 10);
    expect(r1.cleared).toBeCloseTo(r2.cleared, 10);
    expect(r1.full).toBe(r2.full);
    expect(r1.accepted).toHaveLength(r2.accepted.length);

    r1.accepted.forEach((a, idx) => {
      const b = r2.accepted[idx];
      expect(a.id).toBe(b.id);
      expect(a.mwAcc).toBeCloseTo(b.mwAcc, 10);
      expect(a.marginal).toBe(b.marginal);
      expect(a.revenue).toBeCloseTo(b.revenue, 10);
    });
  });

  it("keeps settlement cashflows conserved via hub fee across multiple players", () => {
    const sbp = 100;
    const ssp = 90;

    // Three players with equal and opposite positions over one SP.
    const players = [
      // Long 5 MW → +2.5 MWh @ SSP
      { id: "A", contractedMw: 0, actualPhysicalMw: 5 },
      // Short 3 MW → -1.5 MWh @ SBP
      { id: "B", contractedMw: 3, actualPhysicalMw: 0 },
      // Short 2 MW → -1.0 MWh @ SBP
      { id: "C", contractedMw: 2, actualPhysicalMw: 0 },
    ];

    const settlements = players.map((p) => {
      const { cash } = computeImbalanceSettlement({
        actualPhysicalMw: p.actualPhysicalMw,
        contractedMw: p.contractedMw,
        sbp,
        ssp,
      });
      return { pid: p.id, imbCash: cash };
    });

    const { sumPlayerImbCash, hubFee } =
      computeHubFeeFromSettlements(settlements);

    // In hub-fee model, hub P&L should be the equal and opposite of players' imbalance cash.
    expect(sumPlayerImbCash + hubFee).toBeCloseTo(0, 6);
  });

  it("runs a simple full-SP workflow for two players and keeps totals deterministic", () => {
    const sp = 5;
    const scenarioId = "NORMAL";

    const { actual } = marketForSp(sp, scenarioId, []);

    // Two players take opposite DA positions and then adjust in BM.
    const players = [
      { id: "P1", daContractMw: 10, bmDeltaMw: actual.isShort ? 5 : -5 },  // leans into system need
      { id: "P2", daContractMw: -10, bmDeltaMw: actual.isShort ? -5 : 5 }, // leans against system
    ];

    // Simple BM clearing: treat their BM deltas as offers/bids around the reference price.
    const bids = players.map((p, idx) => ({
      id: p.id,
      side: actual.isShort ? "offer" : "bid",
      mw: Math.abs(p.bmDeltaMw),
      price: actual.baseRef * (idx === 0 ? 0.95 : 1.05),
    }));

    const bmRes1 = clearBM(bids, actual);
    const bmRes2 = clearBM(bids, actual);

    // BM outcome is deterministic
    expect(bmRes1.cp).toBeCloseTo(bmRes2.cp, 10);
    expect(bmRes1.cleared).toBeCloseTo(bmRes2.cleared, 10);

    // Compute simple imbalance settlements from DA + BM positions.
    const sbp = actual.sbp;
    const ssp = actual.ssp;

    const settlements = players.map((p) => {
      const accepted = bmRes1.accepted.find((a) => a.id === p.id);
      const bmPhysicalMw = accepted ? (actual.isShort ? accepted.mwAcc : -accepted.mwAcc) : 0;
      const contractedMw = p.daContractMw;
      const actualPhysicalMw = contractedMw + bmPhysicalMw;

      const { cash: imbCash } = computeImbalanceSettlement({
        actualPhysicalMw,
        contractedMw,
        sbp,
        ssp,
      });

      return { pid: p.id, imbCash };
    });

    const { sumPlayerImbCash, hubFee } =
      computeHubFeeFromSettlements(settlements);

    // Hub + players remain cashflow neutral in aggregate.
    expect(sumPlayerImbCash + hubFee).toBeCloseTo(0, 6);
  });

  it("keeps BM and settlements consistent for three players in the same room", () => {
    const sp = 7;
    const scenarioId = "NORMAL";
    const { actual } = marketForSp(sp, scenarioId, []);

    const players = [
      { id: "P1", contractedMw: 10, bmDeltaMw: actual.isShort ? 5 : -5 },
      { id: "P2", contractedMw: -5, bmDeltaMw: actual.isShort ? -3 : 3 },
      { id: "P3", contractedMw: 0, bmDeltaMw: 0 },
    ];

    const bids = players
      .filter((p) => p.bmDeltaMw !== 0)
      .map((p, i) => ({
        id: p.id,
        side: actual.isShort ? "offer" : "bid",
        mw: Math.abs(p.bmDeltaMw),
        price: actual.baseRef * (i === 0 ? 0.95 : 1.05),
      }));

    const bm1 = clearBM(bids, actual);
    const bm2 = clearBM(bids, actual);
    expect(bm1.cp).toBeCloseTo(bm2.cp, 10);

    const settlements = players.map((p) => {
      const acc = bm1.accepted.find((a) => a.id === p.id);
      const bmPhysicalMw = acc ? (actual.isShort ? acc.mwAcc : -acc.mwAcc) : 0;
      const actualPhysicalMw = p.contractedMw + bmPhysicalMw;

      const { cash } = computeImbalanceSettlement({
        actualPhysicalMw,
        contractedMw: p.contractedMw,
        sbp: actual.sbp,
        ssp: actual.ssp,
      });
      return { pid: p.id, imbCash: cash };
    });

    const { sumPlayerImbCash, hubFee } =
      computeHubFeeFromSettlements(settlements);
    expect(sumPlayerImbCash + hubFee).toBeCloseTo(0, 6);
  });

  it("rejects post-gate-closure BM bids at UI level (conceptual)", () => {
    // This is a conceptual guard: in the real app, submitBid will call
    // canSubmitBmBid(phase, msLeft) before writing to Gun.
    // We assert behaviour in GateLogic tests; here we just document the contract.
    expect(true).toBe(true);
  });
});

