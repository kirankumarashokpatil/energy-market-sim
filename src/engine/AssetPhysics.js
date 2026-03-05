import { ASSETS, MIN_SOC, MAX_SOC, SP_DURATION_H } from '../shared/constants.js';
import { clamp } from '../shared/utils.js';

export function availMW(def, sofuel, market) {
    if (!def) return 0;
    const { isShort, wf, sf } = market;
    if (def.kind === "soc") return isShort
        ? clamp(((sofuel - MIN_SOC) / 100 * def.maxMWh * def.eff) / SP_DURATION_H, 0, def.maxMW)
        : clamp(((MAX_SOC - sofuel) / 100 * def.maxMWh / def.eff) / SP_DURATION_H, 0, def.maxMW);
    if (def.kind === "fuel") return isShort ? clamp(sofuel / SP_DURATION_H, 0, def.maxMW) : 0;
    if (def.kind === "wind") return isShort ? Math.round(wf * def.maxMW) : 0;
    if (def.kind === "solar") return isShort ? Math.round(sf * def.maxMW) : 0;
    if (def.kind === "none") return def.maxMW;
    return 0;
}

export function updateSoF(def, sofuel, mwAcc, isShort) {
    if (!def) return sofuel;
    const mwh = mwAcc * SP_DURATION_H; // Energy delivered/consumed in one settlement period

    if (def.kind === "soc") {
        // RTE definition:
        // When discharging (isShort === true): We lose more internal SoC than we export.
        //     SoC drop = MWh_exported / Eff
        // When charging (isShort === false): We gain less internal SoC than we import.
        //     SoC rise = MWh_imported * Eff
        const eff = def.eff || 1;

        if (isShort) {
            // Discharging to the grid
            const internalCostMwh = mwh / eff;
            return clamp(sofuel - (internalCostMwh / def.maxMWh) * 100, 0, 100);
        } else {
            // Charging from the grid
            const internalGainMwh = mwh * eff;
            return clamp(sofuel + (internalGainMwh / def.maxMWh) * 100, 0, 100);
        }
    }

    if (def.kind === "fuel") return isShort ? clamp(sofuel - mwh, 0, def.fuelMWh) : sofuel;
    return sofuel;
}

export function initSoF(def) {
    if (!def) return 0;
    if (def.kind === "soc") return def.startSoC;
    if (def.kind === "fuel") return def.startFuel ?? def.fuelMWh;
    return 0;
}
