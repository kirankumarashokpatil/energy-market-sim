import { ASSETS, EVENTS, BOT_ROSTER, SCENARIOS, MIN_SOC, MAX_SOC, SP_DURATION_H } from '../shared/constants.js';
import { clamp, spTime } from '../shared/utils.js';

// ─── Deterministic RNG ───
function rng(seed) {
    let s = (seed | 0) >>> 0;
    return () => {
        s = ((Math.imul(s ^ (s >>> 15), 1 | s) + 0x6D2B79F5) | 0) >>> 0;
        let t = Math.imul(s ^ (s >>> 7), 61 | s) ^ s;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Market State for an SP (Forecast vs Actual) ───
export function marketForSp(sp, scenarioId = "NORMAL", injectedEvents = [], publishedForecast = null, manualNivOverride = null) {
    const sc = SCENARIOS[scenarioId] || SCENARIOS.NORMAL;
    const r = rng(sp * 1337 + 42); // Base RNG for expected state
    const errRng = rng(sp * 9999 + 777); // RNG for forecast errors and surprises

    // 1. BASE EXPECTED STATE (Day-Ahead Forecast)
    const hr = Math.floor((sp - 1) / 2);

    let expectedDemand, expectedWind, expectedSolar;
    if (publishedForecast && publishedForecast.demand && publishedForecast.wind) {
        const idx = (sp - 1) % 48;
        // Normalize the forecast engine's real-world MW (e.g. 35000 MW) into the game's 0-1 scale
        expectedDemand = clamp(publishedForecast.demand[idx] / 45000, 0.4, 1.2);
        expectedWind = clamp(publishedForecast.wind[idx] / 25000, 0, 1) * sc.windMod;
        expectedSolar = publishedForecast.solar ? clamp(publishedForecast.solar[idx] / 15000, 0, 1) : 0;
    } else {
        expectedDemand = 0.72 + 0.28 * (0.5 - 0.5 * Math.cos(((hr - 5) / 24) * 2 * Math.PI));
        expectedWind = (0.35 + 0.65 * r()) * sc.windMod;
        expectedSolar = hr >= 6 && hr <= 18 ? clamp(Math.sin(((hr - 6) / 12) * Math.PI), 0, 1) * (0.8 + 0.4 * r()) : 0;
    }

    const baseNIV = (r() - 0.52) * 650 * expectedDemand + sc.nivBias;
    const expectedRefPrice = (65 + r() * 55) * sc.priceMod;

    // 4 Distinct Regional European Prices
    const expectedPriceFR = (50 + 40 * Math.sin(((hr - 2) / 24) * 2 * Math.PI) + (r() * 15 - 5)) * sc.priceMod; // Stable nuclear, predictable daily curve
    const expectedPriceNO = (40 + 20 * Math.sin(((hr - 6) / 24) * 2 * Math.PI) + (r() * 5)) * sc.priceMod; // Nordic hydro: flat, cheap, highly stable
    const expectedPriceNL = (expectedRefPrice * 0.95) + (r() * 20 - 10); // Netherlands: strongly gas-coupled to GB but slightly discounted
    const expectedPriceDK = (30 + (1 - expectedWind) * 60 + (r() * 10)) * sc.priceMod; // Denmark: Highly inversely correlated to GB wind

    const forecast = {
        sp,
        hr,
        niv: manualNivOverride !== null ? clamp(manualNivOverride, -620, 620) : clamp(baseNIV, -620, 620),
        isShort: manualNivOverride !== null ? manualNivOverride < 0 : baseNIV < 0,
        wf: expectedWind,
        sf: expectedSolar,
        sbp: clamp((manualNivOverride !== null ? manualNivOverride < 0 : baseNIV < 0) ? expectedRefPrice * 1.32 : expectedRefPrice * 0.82, 10, 900),
        ssp: clamp((manualNivOverride !== null ? manualNivOverride < 0 : baseNIV < 0) ? expectedRefPrice * 0.72 : expectedRefPrice * 1.22, 5, 800),
        baseRef: expectedRefPrice,
        priceFR: expectedPriceFR,
        priceNO: expectedPriceNO,
        priceNL: expectedPriceNL,
        priceDK: expectedPriceDK
    };

    // 2. ACTUAL STATE (Reality hits during ID and BM)
    let event = null;
    let cum = 0;
    const er = errRng();
    for (const e of EVENTS) {
        const adj = e.prob * sc.eventProb;
        cum += adj;
        if (er < cum) { event = e; break; }
    }

    // Allow NESO to inject events manually
    const injected = injectedEvents.find(e => e.sp === sp);
    if (injected) {
        event = EVENTS.find(e => e.id === injected.eventId) || event;
    }

    // Forecast error applied (e.g. wind dropping or demand surging unexpectedly)
    const windError = (errRng() - 0.4) * 0.3; // -12% to +18% swing
    const demandErrorMv = (errRng() - 0.5) * 120;
    const solarError = (errRng() - 0.3) * 0.2; // -6% to +14% swing

    // True physical conditions
    const trueWind = event?.id === "WIND_UP" ? clamp(expectedWind * 1.6, 0, 1)
        : event?.id === "WIND_LOW" ? clamp(expectedWind * 0.3, 0, 1)
            : event?.id === "DUNKEL" ? clamp(expectedWind * 0.05, 0, 1)
                : clamp(expectedWind + windError, 0, 1);

    const trueSolar = clamp(expectedSolar + solarError, 0, 1);

    const trueNIV = manualNivOverride !== null ? clamp(manualNivOverride, -620, 620) : clamp(baseNIV + demandErrorMv + (event ? event.niv : 0), -620, 620);
    const trueIsShort = trueNIV < 0;
    const trueRefPrice = expectedRefPrice + (event ? event.pd : 0) + (trueIsShort ? 25 : -15);
    // Add real-time noise to foreign markets
    const truePriceFR = expectedPriceFR + (errRng() * 12 - 6);
    const truePriceNO = expectedPriceNO + (errRng() * 4 - 2); // Very steady
    const truePriceNL = expectedPriceNL + (errRng() * 16 - 8);
    const truePriceDK = expectedPriceDK + (windError * -40) + (errRng() * 10 - 5); // Exacerbated by wind error

    // Asset constraints caused by events (e.g. generator trips)
    const trippedAssets = event?.id === "TRIP" || event?.id === "CASCADE" ? generateTrips(errRng, event.id) : [];

    const actual = {
        sp,
        hr,
        niv: trueNIV,
        isShort: trueIsShort,
        wf: trueWind,
        sf: trueSolar,
        sbp: clamp(trueIsShort ? trueRefPrice * 1.32 : trueRefPrice * 0.82, 10, 900),
        ssp: clamp(trueIsShort ? trueRefPrice * 0.72 : trueRefPrice * 1.22, 5, 800),
        freq: clamp(50 + clamp(-trueNIV / 190000, -0.4, 0.4) * (0.5 + errRng() * 1.0), 49.3, 50.7),
        event,
        trippedAssets,
        baseRef: trueRefPrice,
        priceFR: truePriceFR,
        priceNO: truePriceNO,
        priceNL: truePriceNL,
        priceDK: truePriceDK
    };

    // Bots (Generate generic BM bots based on ACTUAL state)
    actual.bots = generateBots(sp, actual.isShort, actual.wf, actual.sf, actual.baseRef);

    // LoLP / VoLL Scarcity Pricing
    const approxCapacityGW = SYSTEM_PARAMS.baseDemandGW * 1.5; // rough estimate of total capacity
    const reserveMarginPct = ((approxCapacityGW - Math.abs(trueNIV) / 1000) / approxCapacityGW) * 100;
    if (reserveMarginPct < 5) { // LoLP > 5%
        const lolpMultiplier = Math.max(1, (10 - reserveMarginPct) / 2); // scale up to 2.5x at 0% margin
        actual.sbp = Math.min(SYSTEM_PARAMS.VoLL, actual.sbp * lolpMultiplier);
        actual.ssp = Math.max(0, actual.ssp / lolpMultiplier);
    }

    return { forecast, actual };
}

function generateTrips(r, eventId) {
    // Determine which bots or player assets randomly tripped
    const candidates = ["OCGT", "HYDRO", "BESS_L", "WIND"];
    const trips = [];
    trips.push(candidates[Math.floor(r() * candidates.length)]);
    if (eventId === "CASCADE") trips.push(candidates[Math.floor(r() * candidates.length)]);
    return trips;
}

function generateBots(sp, isShort, wf, sf, baseRef) {
    return BOT_ROSTER.map((ba, i) => {
        const br = rng(sp * 773 + i * 131);
        const def = ASSETS[ba.asset];
        if (!def) return null;
        const ok = def.sides === "both" || (def.sides === "short" && isShort) || (def.sides === "long" && !isShort);
        if (!ok) return null;
        let mxMW = def.maxMW;
        if (def.kind === "wind") { mxMW = Math.round(wf * mxMW); if (mxMW < 2) return null; }
        if (def.kind === "solar") { mxMW = Math.round(sf * mxMW); if (mxMW < 2) return null; }
        const pct = (isShort ? 0.55 : 1.15) + br() * 0.55;
        const price = Math.round((baseRef * pct) * 10) / 10;
        let mw = 6 + Math.round(br() * (mxMW * 0.65));

        // Enforce Minimum Stable Generation for bots
        if (def.minMw && mw < def.minMw) {
            // Either run at minMw or stay offline
            if (br() > 0.5 && def.minMw <= mxMW) {
                mw = def.minMw;
            } else {
                return null;
            }
        }

        return { id: `BOT_${i}`, name: ba.name, asset: ba.asset, isBot: true, mw, price, side: isShort ? "offer" : "bid", col: def.col };
    }).filter(Boolean);
}

// ─── Clear Balancing Mechanism ───
export function clearBM(bids, market) {
    const { isShort, sbp, ssp, niv } = market;
    const side = isShort ? "offer" : "bid";
    const cands = bids.filter(b => b.side === side && +b.mw > 0 && !isNaN(+b.price))
        .sort((a, b) => isShort ? +a.price - +b.price : +b.price - +a.price);
    let rem = Math.abs(niv), cp = isShort ? sbp : ssp;
    const acc = [];
    for (const b of cands) {
        if (rem <= 0) break;
        const mwAcc = Math.min(+b.mw, rem);
        cp = +b.price;
        acc.push({ ...b, mwAcc });
        rem -= mwAcc;
    }
    const result = acc.map((a, idx) => {
        const def = ASSETS[a.asset];
        const mwh = a.mwAcc * SP_DURATION_H;
        const grossRevenue = a.mwAcc * +a.price * SP_DURATION_H;
        const wearCost = (def?.wear || 0) * mwh;
        let netRevenue = grossRevenue - wearCost;
        
        // CfD adjustment for renewables
        let cfdAdjustment = 0;
        if (def?.strikePrice) {
            cfdAdjustment = (def.strikePrice - cp) * mwh;
            netRevenue += cfdAdjustment;
        }
        
        return {
            ...a,
            revenue: +netRevenue.toFixed(2),
            wearCost: +wearCost.toFixed(2),
            cfdAdjustment: +cfdAdjustment.toFixed(2),
            marginal: idx === acc.length - 1, // last accepted unit sets the clearing price
        };
    });
    return { accepted: result, cp, cleared: Math.abs(niv) - Math.max(0, rem), full: rem <= 0 };
}

// ─── Day-Ahead Auction Clearing (Pay-As-Clear) ───
export function clearDA(bids, market_forecast) {
    const offers = bids.filter(b => b.side === "offer" && +b.mw > 0 && !isNaN(+b.price))
        .sort((a, b) => +a.price - +b.price);
    const demands = bids.filter(b => b.side === "bid" && +b.mw > 0 && !isNaN(+b.price))
        .sort((a, b) => +b.price - +a.price);
    
    // Build supply curve (cumulative MW vs price)
    const supplySteps = [];
    let cumSupply = 0;
    for (const o of offers) {
        supplySteps.push([cumSupply, +o.price]);
        cumSupply += +o.mw;
        supplySteps.push([cumSupply, +o.price]);
    }
    
    // Build demand curve
    const demandSteps = [];
    let cumDemand = 0;
    for (const d of demands) {
        demandSteps.push([cumDemand, +d.price]);
        cumDemand += +d.mw;
        demandSteps.push([cumDemand, +d.price]);
    }
    
    // Find intersection
    let cp = market_forecast.baseRef; // default
    let volume = 0;
    const accepted_bids = [];
    
    // Simple intersection: find price where supply >= demand
    for (let i = 0; i < supplySteps.length; i += 2) {
        const [supMW, supPrice] = supplySteps[i];
        const demAtPrice = demandSteps.find(([demMW, demPrice]) => demPrice >= supPrice);
        if (demAtPrice) {
            const [demMW] = demAtPrice;
            if (supMW <= demMW) {
                cp = supPrice;
                volume = supMW;
                // Accept offers up to this price
                let accCum = 0;
                for (const o of offers) {
                    if (+o.price <= cp && accCum < volume) {
                        const accMW = Math.min(+o.mw, volume - accCum);
                        accepted_bids.push({ ...o, mwAcc: accMW, revenue: accMW * cp * SP_DURATION_H });
                        accCum += accMW;
                    }
                }
                // Accept bids down to this price
                accCum = 0;
                for (const d of demands) {
                    if (+d.price >= cp && accCum < volume) {
                        const accMW = Math.min(+d.mw, volume - accCum);
                        accepted_bids.push({ ...d, mwAcc: accMW, revenue: accMW * cp * SP_DURATION_H });
                        accCum += accMW;
                    }
                }
                break;
            }
        }
    }
    
    return { cp, volume, accepted_bids };
}

// ─── Feedback Market State (Post-Clearing Updates) ───
export function feedbackMarketState(market, clearResult) {
    const { isShort, niv, baseRef } = market;
    const { cp, cleared } = clearResult;
    
    // Post-clearing residual NIV (after BM dispatch)
    const residualNIV = niv - (isShort ? cleared : -cleared);
    
    // Dynamic Frequency based on residual NIV
    const freqDeviation = clamp(-residualNIV / 190000, -0.4, 0.4);
    const freq = clamp(50 + freqDeviation * (0.5 + Math.random() * 1.0), 49.3, 50.7);
    
    // Clearing-derived SBP/SSP
    let sbp, ssp;
    if (isShort) {
        // Short system (discharging): SBP = max(clearResult.cp, market.baseRef * 1.1), SSP drops to 80%
        sbp = Math.max(cp, baseRef * 1.1);
        ssp = baseRef * 0.8;
    } else {
        // Long system (charging): SSP = min(clearResult.cp, market.baseRef * 0.9), SBP rises to 120%
        ssp = Math.min(cp, baseRef * 0.9);
        sbp = baseRef * 1.2;
    }
    
    return {
        ...market,
        freq,
        sbp: clamp(sbp, 10, 900),
        ssp: clamp(ssp, 5, 800),
        residualNIV
    };
}

// ─── Forecasts ───
export function computeForecasts(currentSp, scenarioId, publishedForecast = null, maxOffsets = 4) {
    const fcasts = [];
    for (let offset = 1; offset <= maxOffsets; offset++) {
        const sp = currentSp + offset;
        const state = marketForSp(sp, scenarioId, [], publishedForecast);
        // During DA, players only see the forecast.
        fcasts.push({
            sp: state.forecast.sp,
            time: spTime(state.forecast.sp),
            niv: Math.round(state.forecast.niv),
            isShort: state.forecast.isShort,
            priceLo: Math.round(state.forecast.sbp * 0.8),
            priceHi: Math.round(state.forecast.sbp * 1.2),
            wf: Math.round(state.forecast.wf * 100),
            sf: Math.round(state.forecast.sf * 100),
            // We leak the event warning if it's close (simulates weather warning) - avoid leaking exact payload
            event: offset <= 2 && state.actual.event?.prob > 0.05 ? { id: state.actual.event.id, name: state.actual.event.name, emoji: state.actual.event.emoji } : null,
            confident: offset <= 2,
            ...state.forecast // include full raw forecast
        });
    }
    return fcasts;
}
