import { SP_DURATION_H } from "../shared/constants.js";

/**
 * Core imbalance arithmetic for a single settlement period.
 *
 * Convention:
 *  - imbalanceMw = actualPhysicalMw − contractedMw
 *  - SBP/SSP selection based on sign of imbalance, not system NIV
 *  - Energy in MWh uses an explicit SP_DURATION_H factor.
 */
export function computeImbalance(actualPhysicalMw, contractedMw) {
  return actualPhysicalMw - contractedMw;
}

export function selectImbalancePrice(imbalanceMw, sbp, ssp) {
  return imbalanceMw < 0 ? sbp : ssp;
}

export function computeImbalanceSettlement({
  actualPhysicalMw,
  contractedMw,
  sbp,
  ssp,
  spDurationH = SP_DURATION_H,
}) {
  const imbalanceMw = computeImbalance(actualPhysicalMw, contractedMw);
  const price = selectImbalancePrice(imbalanceMw, sbp, ssp);
  const mwh = imbalanceMw * spDurationH;
  const cash = mwh * price;

  return {
    imbalanceMw,
    price,
    mwh,
    cash,
  };
}

/**
 * Hub‑fee conservation helper.
 * Given all player settlements for an SP, returns:
 *  - sumPlayerImbCash: sum of all players' imbalance cash
 *  - hubFee: the equal and opposite P&L for the hub (−sumPlayerImbCash)
 */
export function computeHubFeeFromSettlements(settlements) {
  const sumPlayerImbCash = settlements.reduce(
    (acc, s) => acc + (s.imbCash || 0),
    0
  );
  const hubFee = -sumPlayerImbCash;
  return { sumPlayerImbCash, hubFee };
}

