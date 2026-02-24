import { useState, useEffect, useRef, useCallback } from "react";

/* ════════════════════════════════════════════════════════
   FONTS & BASE CSS
════════════════════════════════════════════════════════ */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap');`;

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;background:#050e16;overflow:hidden;font-size:13px;}
:root{
  --bg0:#050e16; --bg1:#08141f; --bg2:#0c1c2a; --bg3:#102332; --bg4:#162c3d;
  --ln:#1a3045;  --ln2:#234159; --ln3:#2d5270;
  --grn:#1de98b; --grn2:#0a5c38; --grnd:#071f13;
  --red:#f0455a; --red2:#5c0a14; --redd:#1f0709;
  --amb:#f5b222; --amb2:#5c3e00; --ambd:#1f1400;
  --blu:#38c0fc; --blu2:#05455c; --blud:#021520;
  --pur:#b78bfa; --pur2:#3d1a6e;
  --wht:#ddeeff; --gry:#4d7a96; --dim:#1e3d54; --fnt:#2a5570;
  --mono:'JetBrains Mono',monospace;
  --body:'Outfit',sans-serif;
}
::-webkit-scrollbar{width:3px;height:3px;}
::-webkit-scrollbar-track{background:var(--bg0);}
::-webkit-scrollbar-thumb{background:var(--ln2);border-radius:2px;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideLeft{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
@keyframes grnGlow{0%,100%{box-shadow:0 0 5px #1de98b44}50%{box-shadow:0 0 18px #1de98b}}
@keyframes redGlow{0%,100%{box-shadow:0 0 5px #f0455a44}50%{box-shadow:0 0 18px #f0455a}}
@keyframes ambGlow{0%,100%{box-shadow:0 0 5px #f5b22244}50%{box-shadow:0 0 16px #f5b222}}
@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes dispatch{0%{transform:scaleX(0);opacity:0}60%{transform:scaleX(1.05);opacity:1}100%{transform:scaleX(1);opacity:1}}
@keyframes accepted{0%{background:#1de98b33}100%{background:transparent}}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
@keyframes priceExplode{0%{transform:scale(1)}30%{transform:scale(1.15)}60%{transform:scale(0.95)}100%{transform:scale(1)}}
@keyframes alertPulse{0%,100%{border-color:#f0455a44}50%{border-color:#f0455a}}
@keyframes cashIn{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-20px);opacity:0}}
.blink{animation:blink 1.2s ease-in-out infinite}
.fadeUp{animation:fadeUp .4s ease both}
.slideLeft{animation:slideLeft .35s ease both}
.grn-glow{animation:grnGlow 2s ease-in-out infinite}
.red-glow{animation:redGlow 2s ease-in-out infinite}
.amb-glow{animation:ambGlow 2s ease-in-out infinite}
.shake{animation:shake .4s ease}
.price-explode{animation:priceExplode .6s ease}
.alert-pulse{animation:alertPulse 1s ease-in-out infinite}
`;

/* ════════════════════════════════════════════════════════
   MARKET ENGINE — Pure Functions
════════════════════════════════════════════════════════ */

const R = (base, range) => +(base + (Math.random() - .5) * range * 2).toFixed(2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const f2 = n => (+n).toFixed(2);
const f1 = n => (+n).toFixed(1);
const f0 = n => Math.round(n).toString();
const fP = (n, sign = true) => (sign ? (n >= 0 ? "+" : "-") : "") + "£" + Math.abs(n).toFixed(0);
const fPd = n => (n >= 0 ? "" : "-") + "£" + Math.abs(n).toFixed(0);

// Static generator fleet (everyone except you)
const FLEET = [
  { id: "THAN_WF", name: "Thanet Wind Farm", type: "WIND", baseMW: 220, baseCost: 38, costRange: 12, color: "#38c0fc" },
  { id: "HINK_B", name: "Hinkley B Nuclear", type: "NUCLEAR", baseMW: 450, baseCost: 56, costRange: 4, color: "#b78bfa" },
  { id: "WLNY_WF", name: "Walney Extension WF", type: "WIND", baseMW: 160, baseCost: 42, costRange: 14, color: "#38c0fc" },
  { id: "PILL_B", name: "Pillswood BESS", type: "BESS", baseMW: 196, baseCost: 88, costRange: 12, color: "#f5b222" },
  { id: "DRAX_1", name: "Drax Biomass Unit 1", type: "BIOMASS", baseMW: 500, baseCost: 108, costRange: 8, color: "#1de98b" },
  { id: "GRAN_G1", name: "Grain CCGT", type: "CCGT", baseMW: 400, baseCost: 118, costRange: 10, color: "#fb923c" },
  { id: "PEMB_GT", name: "Pembroke Gas Turbine", type: "OCGT", baseMW: 228, baseCost: 145, costRange: 20, color: "#f0455a" },
  { id: "IFA2", name: "IFA2 Interconnector", type: "INTERCONN", baseMW: 500, baseCost: 152, costRange: 30, color: "#c084fc" },
];

// Static demand fleet (Consumer Agents in the making)
const CONSUMERS = [
  { id: "RES_HEAT", name: "Residential Heating", type: "HEAT", baseMW: 300, basePrice: 200, priceRange: 50, color: "#f0455a" },
  { id: "EV_CHARGING", name: "EV Charging Fleet", type: "EV", baseMW: 150, basePrice: 120, priceRange: 30, color: "#1de98b" },
  { id: "HEAVY_IND", name: "Heavy Industry", type: "IND", baseMW: 400, basePrice: 80, priceRange: 20, color: "#fb923c" },
  { id: "DATA_CENTERS", name: "Data Centers", type: "TECH", baseMW: 250, basePrice: 300, priceRange: 0, color: "#b78bfa" }, // Highly inelastic
  { id: "EXPORT_IFA2", name: "IFA2 Export", type: "INTERCONN", baseMW: 300, basePrice: 60, priceRange: 40, color: "#c084fc" },
];

// Market events that fire occasionally
const EVENTS = [
  { id: "WIND_DROP", name: "Wind Drop", icon: "💨", desc: "Wind output fell sharply — grid needs more generation", nivDelta: -180, priceDelta: +22, prob: .10 },
  { id: "WIND_SURGE", name: "Wind Surge", icon: "🌬", desc: "Wind surged — grid has excess generation", nivDelta: +150, priceDelta: -18, prob: .08 },
  { id: "TRIP", name: "Generator Trip", icon: "⚡", desc: "Large plant tripped offline — emergency generation needed", nivDelta: -280, priceDelta: +45, prob: .06 },
  { id: "DEMAND_HI", name: "Demand Spike", icon: "📈", desc: "Demand higher than forecast — more power needed", nivDelta: -120, priceDelta: +15, prob: .09 },
  { id: "DEMAND_LO", name: "Demand Drop", icon: "📉", desc: "Demand lower than forecast — grid long on power", nivDelta: +100, priceDelta: -12, prob: .07 },
  { id: "FREQ_LOW", name: "Low Frequency", icon: "🔴", desc: "Frequency fell below 49.8 Hz — rapid response needed", nivDelta: -90, priceDelta: +30, prob: .06 },
  { id: "INTERCON", name: "Interconnector On", icon: "🔌", desc: "IFA2 interconnector ramped up — cheap imports arriving", nivDelta: +200, priceDelta: -25, prob: .06 },
  { id: "DUNKEL", name: "DUNKELFLAUTE", icon: "🌑", desc: "No wind AND no sun — worst case for renewables! All thermal must fire!", nivDelta: -350, priceDelta: +65, prob: .03 },
  { id: "CASCADE", name: "Cascade Trip", icon: "💥", desc: "Generator trip caused cascade failure — multiple units offline!", nivDelta: -420, priceDelta: +80, prob: .02 },
  { id: "COLD_SNAP", name: "Cold Snap", icon: "🥶", desc: "Sudden temperature drop — heating demand surging across GB", nivDelta: -200, priceDelta: +35, prob: .04 },
  { id: "SOLAR_EDGE", name: "Solar Edge", icon: "🌅", desc: "Solar output ramping down at sunset — evening cliff approaching", nivDelta: -160, priceDelta: +20, prob: .05 },
  { id: "CABLE_FIRE", name: "Cable Fire", icon: "🔥", desc: "Subsea cable fault — interconnector capacity lost!", nivDelta: -300, priceDelta: +55, prob: .02 },
  { id: "PRICE_SPIKE", name: "Price Spike", icon: "🚀", desc: "Scarcity pricing triggered — LOLP multiplier active!", nivDelta: -250, priceDelta: +90, prob: .02 },
];

// Core clearing: Uniform Pricing Market Operator
function clearMarketUniform(supply, demand) {
  // Sort Supply ascending (Cheapest generation first)
  const sortedSupply = [...supply].sort((a, b) => a.price - b.price);

  // Sort Demand descending (Highest willingness to pay first)
  const sortedDemand = [...demand].sort((a, b) => b.price - a.price);

  let pClear = 50; // default fallout price
  let qClear = 0;
  let sIndex = 0;
  let dIndex = 0;
  let currentSupplied = 0;
  let currentDemanded = 0;

  const MAX_PRICE = 500;

  // Find intersection
  while (sIndex < sortedSupply.length && dIndex < sortedDemand.length) {
    const sNode = sortedSupply[sIndex];
    const dNode = sortedDemand[dIndex];

    // If the cheapest available supply is more expensive than the highest remaining demand,
    // the market clears. No further trades can happen.
    if (sNode.price > dNode.price) {
      // The clearing price is conventionally set midway between the last accepted supply/demand,
      // or simply the marginal accepted bid.
      pClear = (sNode.price + dNode.price) / 2;
      break;
    }

    // Determine how much volume can clear at this marginal step
    const supplyAvailable = sNode.mw - currentSupplied;
    const demandNeeded = dNode.mw - currentDemanded;
    const volumeToClear = Math.min(supplyAvailable, demandNeeded);

    qClear += volumeToClear;
    currentSupplied += volumeToClear;
    currentDemanded += volumeToClear;
    pClear = sNode.price; // Marginal unit sets the price

    if (currentSupplied >= sNode.mw) {
      sIndex++;
      currentSupplied = 0;
    }
    if (currentDemanded >= dNode.mw) {
      dIndex++;
      currentDemanded = 0;
    }
  }

  pClear = clamp(pClear, -50, MAX_PRICE);

  // Allocate volumes based on P_clear
  const finalSupply = sortedSupply.map(u => ({
    ...u,
    // Generators (Supply) are happy to produce if the market pays them MORE than their minimum offer
    accepted: pClear >= u.price,
    dispatchedMW: pClear >= u.price ? u.mw : 0
  }));

  const finalDemand = sortedDemand.map(u => ({
    ...u,
    // Consumers (Demand) are happy to consume if the market charges them LESS than their maximum bid
    accepted: pClear <= u.price,
    dispatchedMW: pClear <= u.price ? u.mw : 0
  }));

  return {
    supply: finalSupply,
    demand: finalDemand,
    clearingPrice: pClear,
    clearedVolume: qClear
  };
}

// Build full supply and demand curves for the market
function buildMarketCurves(userBidPrice, userBidVol, userBidDir, eventFactor = 1, event = null, genMult = 1.0, conMult = 1.0) {
  // 1. Supply Curve (Generators)
  let supply = FLEET.map(f => {
    let mw = clamp(f.baseMW + R(0, 30), 10, f.baseMW * 1.1);
    let price = clamp(R(f.baseCost, f.costRange) * eventFactor, 20, 300);

    if (event) {
      const eid = event.id;
      if (f.type === "WIND" && (eid === "WIND_DROP" || eid === "DUNKEL")) mw = clamp(f.baseMW * (eid === "DUNKEL" ? 0.05 : 0.2) + R(0, 10), 5, f.baseMW * 0.3);
      if (f.type === "WIND" && eid === "WIND_SURGE") { mw = clamp(f.baseMW * 1.4 + R(0, 20), f.baseMW, f.baseMW * 1.5); price = clamp(price * 0.6, 10, 60); }
      if (f.type === "INTERCONN" && (eid === "CABLE_FIRE" || eid === "DUNKEL")) mw = clamp(f.baseMW * 0.1, 5, 50);
      if (f.type === "NUCLEAR" && eid === "CASCADE") mw = clamp(f.baseMW * 0.3, 20, 200);
      if ((f.type === "CCGT" || f.type === "OCGT") && (eid === "DUNKEL" || eid === "CASCADE" || eid === "COLD_SNAP")) price = clamp(price * 1.4, 80, 300);
    }
    // Apply the macro-agent pricing strategy (markup/withholding)
    price = clamp(price * genMult, 1, 999);

    return { ...f, price, mw };
  });

  // 2. Demand Curve (Consumers)
  let demand = CONSUMERS.map(c => {
    let mw = clamp(c.baseMW + R(0, 40), 50, c.baseMW * 1.2);
    let price = clamp(R(c.basePrice, c.priceRange), 20, 500);

    if (event) {
      const eid = event.id;
      if (eid === "DEMAND_HI" || eid === "COLD_SNAP") mw *= 1.3;
      if (eid === "DEMAND_LO") mw *= 0.7;
    }
    // Apply the macro-agent pricing strategy (discount seeking / demand destruction)
    price = clamp(price * conMult, 1, 999);

    return { ...c, price, mw };
  });

  // 3. Insert BESS Agent
  const yourUnit = {
    id: "BESS_YOU", name: "YOUR BATTERY", type: "BESS",
    mw: userBidDir !== "HOLD" ? userBidVol : 0,
    price: userBidPrice, color: "#f5b222", isYou: true
  };

  if (yourUnit.mw > 0) {
    if (userBidDir === "SELL") {
      supply.push(yourUnit);
    } else if (userBidDir === "BUY") {
      demand.push(yourUnit);
    }
  }

  // Rank purely for UI purposes (Optional but keeps UI clean)
  supply.sort((a, b) => a.price - b.price).forEach((u, i) => { u.rank = i + 1; });
  demand.sort((a, b) => b.price - a.price).forEach((u, i) => { u.rank = i + 1; });

  return { supply, demand };
}

function narrateSP(sp, niv, clearing, yourResult, event) {
  const t = spToTime(sp);
  const short = niv < 0;
  let msg = `SP ${sp} (${t}): `;
  if (event) msg += `${event.icon} ${event.name} — ${event.desc}. `;
  msg += `System ${short ? `SHORT ${f0(Math.abs(niv))}MW` : `LONG ${f0(niv)}MW`}. `;
  msg += `Clearing: £${f2(clearing.clearingPrice)}/MWh. `;
  if (yourResult.accepted) {
    msg += `✓ YOUR BID ACCEPTED — dispatched ${f0(yourResult.dispatchedMW)}MW @ £${f2(clearing.clearingPrice)}/MWh`;
  } else {
    const isSell = yourResult.dir === "SELL";
    const reason = yourResult.priceRejected
      ? (isSell
        ? `Your offer (£${f2(yourResult.yourPrice)}) was above clearing (£${f2(clearing.clearingPrice)}). Cheaper units dispatched instead.`
        : `Your bid (£${f2(yourResult.yourPrice)}) was below clearing (£${f2(clearing.clearingPrice)}). Consumers willing to pay more were dispatched instead.`)
      : `System needed volume was fully met before reaching your rank (#${yourResult.rank}).`;
    msg += `✗ NOT DISPATCHED — ${reason}`;
  }
  return msg;
}

const spToTime = sp => {
  const h = Math.floor(((sp - 1) * 30) / 60) % 24;
  const m = ((sp - 1) * 30) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/* ════════════════════════════════════════════════════════
   INITIAL STATE
════════════════════════════════════════════════════════ */
function initState() {
  const userBidPrice = 82;
  const userBidVol = 50;
  const userBidDir = "SELL";
  const startSP = 28;
  const startNIV = -95;
  const curves = buildMarketCurves(userBidPrice, userBidVol, userBidDir, 1, null);
  const clearing = clearMarketUniform(curves.supply, curves.demand);

  return {
    // simulation control
    running: true,
    speed: 2,          // 1x, 2x, 4x — auto-start at 2x for exciting pace
    tick: 0,
    simSeconds: 0,     // total sim seconds elapsed
    intervalTimer: 0,  // counts to INTERVAL_SECS then triggers a clearing

    // market state
    sp: startSP,
    freq: 50.01,
    niv: startNIV,
    baseNIV: -95,
    activeEvent: null,

    // prices
    spotPrice: 110.80,
    sbp: 112.50,
    ssp: 108.20,
    priceHist: Array.from({ length: 40 }, (_, i) => ({ t: i, open: 108 + Math.random() * 8, close: 108 + Math.random() * 8, high: 0, low: 0 })).map(c => ({ ...c, high: Math.max(c.open, c.close) + Math.random() * 3, low: Math.min(c.open, c.close) - Math.random() * 3 })),

    // user bid
    userBidPrice,
    userBidVol,
    userBidDir: "SELL", // SELL = offer power, BUY = take power (charge)

    // battery
    soc: 62,
    maxMW: 50,
    maxMWh: 200,

    // clearing
    marketCurves: curves,
    clearing,

    // history — one record per SP
    spHistory: [],

    // lifecycle
    lcStep: 0,
    lcFlash: false,

    // narrative / events
    narrative: "⚡ LIVE — Balancing Mechanism running. Watching for dispatch opportunities...",
    eventLog: [],

    // P&L
    totalPnl: 0,
    sessionRevenue: 0,
    sessionCost: 0,
    dispatchedSPs: 0,
    missedSPs: 0,

    // Marginal Costs
    marginalCost: 45, // £/MWh (opportunity cost of stored energy + degradation)

    // animated dispatch
    dispatchFlash: false,

    // enhanced features
    extremeEvent: false,
    peakPrice: 0,
    streakCount: 0,
    bestStreak: 0,

    // RL Agent Mode (BESS)
    rlEnabled: true,       // Toggle for AI mode
    rlEpsilon: 1.0,        // Exploration rate (starts high)
    qTable: {},            // State -> Action -> Q-Value
    rlState: null,         // Current state key
    rlAction: null,        // Current action taken

    // Macro-Agents (Generators & Consumers)
    genQTable: {},
    genAction: 0,          // Current generator pricing strategy
    genEpsilon: 1.0,

    conQTable: {},
    conAction: 0,          // Current consumer pricing strategy
    conEpsilon: 1.0,

    // Live Market connection
    useLiveMarket: false,  // Toggle between Sim and Live Elexon Data
    liveDataStale: false,
    liveLastUpdated: null,
  };
}

const INTERVAL_SECS = 12; // real seconds per settlement period

/* ════════════════════════════════════════════════════════
   RL ENGINE — Q-Learning
════════════════════════════════════════════════════════ */

// Discretize state for Q-table
function getRLState(niv, soc, freq) {
  const nState = niv < -200 ? "VL" : niv < -50 ? "L" : niv > 200 ? "VH" : niv > 50 ? "H" : "BAL";
  const sState = soc < 20 ? "E" : soc > 80 ? "F" : "M";
  const fState = freq < 49.85 ? "LO" : freq > 50.15 ? "HI" : "OK";
  return `${nState}_${sState}_${fState}`;
}

// Map RL action index to bid parameters: [Direction, PriceOffset]
// PriceOffset is relative to the current estimated clearing price (SBP)
const RL_ACTIONS = [
  { dir: "SELL", offset: -35, name: "Aggressive Sell" },
  { dir: "SELL", offset: -5, name: "Competitive Sell" },
  { dir: "SELL", offset: +20, name: "Speculative Sell" },
  { dir: "BUY", offset: +35, name: "Aggressive Buy" },
  { dir: "BUY", offset: +5, name: "Competitive Buy" },
  { dir: "BUY", offset: -20, name: "Speculative Buy" },
];

// Generator Macro-Actions (Multiplier on their Base Cost)
const GEN_ACTIONS = [
  { mult: 1.0, name: "Marginal Cost (Honest)" },
  { mult: 1.1, name: "Markup (+10%)" },
  { mult: 1.4, name: "Scarcity Pricing (+40%)" },
  { mult: 2.0, name: "Economic Withholding (Spike)" },
];

// Consumer Macro-Actions (Multiplier on their Willingness to Pay)
const CON_ACTIONS = [
  { mult: 1.0, name: "Value of Lost Load (Desperate)" },
  { mult: 0.8, name: "Discount Seeking (-20%)" },
  { mult: 0.5, name: "Deep Discount (-50%)" },
  { mult: 0.2, name: "Demand Destruction (Avoid Cost)" },
];

function getBestAction(qTable, stateKey) {
  if (!qTable[stateKey]) return null;
  let bestA = 0;
  let maxQ = -Infinity;
  for (let i = 0; i < RL_ACTIONS.length; i++) {
    const q = qTable[stateKey][i] || 0;
    if (q > maxQ) { maxQ = q; bestA = i; }
  }
  return bestA;
}

/* ════════════════════════════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════════════════════════════ */

// ── Sparkline ──────────────────────────────────────────
function Spark({ data, w = 120, h = 28, color = "#1de98b", strokeW = 1.8 }) {
  if (!data || data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data), rng = hi - lo || 1;
  const px = (i) => (i / (data.length - 1)) * w;
  const py = (v) => h - ((v - lo) / rng) * h * .88 - h * .06;
  const pts = data.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const id = `sg${Math.abs(color.charCodeAt(1))}`;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity=".3" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" />
      <circle cx={px(data.length - 1)} cy={py(data.at(-1))} r="2.5" fill={color} />
    </svg>
  );
}

// ── OHLC Price Chart ──────────────────────────────────
function OHLCChart({ bars, sbp, ssp, currentPrice }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = c.clientWidth || 400, H = c.clientHeight || 160;
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (!bars || bars.length < 2) return;

    const PAD_L = 46, PAD_R = 48, PAD_T = 8, PAD_B = 22;
    const allV = bars.flatMap(b => [b.high, b.low]).concat([sbp, ssp, currentPrice]);
    const lo = Math.min(...allV) - 3, hi = Math.max(...allV) + 3, rng = hi - lo;
    const toX = i => PAD_L + (i / (bars.length - 1)) * (W - PAD_L - PAD_R);
    const toY = v => PAD_T + (1 - (v - lo) / rng) * (H - PAD_T - PAD_B);
    const barW = Math.max(3, (W - PAD_L - PAD_R) / bars.length * .55);

    // grid
    for (let i = 0; i <= 4; i++) {
      const val = lo + (rng / 4) * i, y = toY(val);
      ctx.strokeStyle = "#1a304522"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      ctx.fillStyle = "#4d7a96"; ctx.font = "9px JetBrains Mono";
      ctx.textAlign = "right"; ctx.fillText("£" + val.toFixed(0), PAD_L - 4, y + 3);
    }

    // reference lines (SBP / SSP)
    [[sbp, "#f5b222", "SBP"], [ssp, "#38c0fc", "SSP"]].forEach(([v, col, lbl]) => {
      const y = toY(v);
      ctx.strokeStyle = col + "88"; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = col; ctx.font = "bold 9px JetBrains Mono";
      ctx.textAlign = "left"; ctx.fillText(`${lbl} £${v.toFixed(1)}`, W - PAD_R + 4, y + 3);
    });

    // OHLC bars
    bars.forEach((b, i) => {
      const x = toX(i), bull = b.close >= b.open;
      const col = bull ? "#1de98b" : "#f0455a";
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, toY(b.high)); ctx.lineTo(x, toY(b.low)); ctx.stroke();
      const y1 = toY(Math.max(b.open, b.close)), y2 = toY(Math.min(b.open, b.close));
      const bh = Math.max(1, y2 - y1);
      ctx.fillStyle = bull ? "#1de98b44" : "#f0455a44";
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.fillRect(x - barW / 2, y1, barW, bh);
      ctx.strokeRect(x - barW / 2, y1, barW, bh);
    });

    // current price line
    const cy = toY(currentPrice);
    ctx.strokeStyle = "#f5b222"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(PAD_L, cy); ctx.lineTo(W - PAD_R, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f5b222"; ctx.shadowColor = "#f5b222"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(W - PAD_R, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

    // x-axis labels (SP numbers)
    ctx.fillStyle = "#4d7a96"; ctx.font = "8px JetBrains Mono"; ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(bars.length / 6));
    bars.forEach((b, i) => {
      if (i % step === 0) ctx.fillText(`SP${b.sp || i}`, toX(i), H - 6);
    });
  }, [bars, sbp, ssp, currentPrice]);

  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

// ── Battery Visual ─────────────────────────────────────
function BatteryViz({ soc, dispatching, direction, maxMW, maxMWh }) {
  const col = soc < 20 ? "#f0455a" : soc < 40 ? "#f5b222" : "#1de98b";
  const currentMWh = (soc / 100 * maxMWh).toFixed(1);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <div>
          <span style={{ fontFamily: "var(--body)", fontSize: 20, fontWeight: 900, color: col, lineHeight: 1 }}>{f0(soc)}</span>
          <span style={{ fontFamily: "var(--body)", fontSize: 11, color: "var(--gry)", marginLeft: 2 }}>%</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--gry)" }}>{currentMWh} / {maxMWh} MWh</div>
          {dispatching && (
            <div style={{
              fontFamily: "var(--body)", fontSize: 10, color: direction === "SELL" ? "#1de98b" : "#38c0fc", fontWeight: 700,
              animation: "blink 0.8s ease-in-out infinite"
            }}>
              {direction === "SELL" ? "⚡ DISCHARGING →" : "⚡ ← CHARGING"}
            </div>
          )}
        </div>
      </div>
      {/* Battery bar */}
      <div style={{
        height: 12, background: "var(--bg3)", borderRadius: 6, overflow: "hidden",
        border: "1px solid var(--ln)", position: "relative", boxShadow: "inset 0 1px 3px #00000044"
      }}>
        <div style={{
          height: "100%", width: `${soc}%`, borderRadius: 8, transition: "width 1.2s ease",
          background: `linear-gradient(90deg, ${col}66, ${col})`,
          boxShadow: `inset 0 1px 2px #ffffff22`
        }}>
          {dispatching && direction === "SELL" && (
            <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg,transparent,transparent 12px,rgba(255,255,255,0.08) 12px,rgba(255,255,255,0.08) 24px)", animation: "ticker 1s linear infinite" }} />
          )}
        </div>
        {[25, 50, 75].map(p => (
          <div key={p} style={{ position: "absolute", top: 0, bottom: 0, left: `${p}%`, width: 1, background: "#00000055" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: "var(--mono)", fontSize: 8, color: "var(--fnt)" }}>
        {["0%", "25%", "50%", "75%", "100%"].map(l => <span key={l}>{l}</span>)}
      </div>
    </div>
  );
}

// ── NIV Meter ─────────────────────────────────────────
function NIVMeter({ niv, activeEvent }) {
  const short = niv < 0;
  const col = short ? "#f0455a" : "#1de98b";
  const pct = clamp(Math.abs(niv) / 400 * 45, 1, 46);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <div>
          <span style={{ fontFamily: "var(--body)", fontSize: 22, fontWeight: 900, color: col }}>
            {niv > 0 ? "+" : ""}{f0(niv)} MW
          </span>
        </div>
        <div style={{
          padding: "3px 8px", borderRadius: 4, background: col + "22", border: `1px solid ${col}55`,
          fontFamily: "var(--body)", fontSize: 11, fontWeight: 700, color: col
        }}>
          {short ? "⬇ SYSTEM SHORT" : "⬆ SYSTEM LONG"}
        </div>
      </div>
      <div style={{ height: 14, background: "var(--bg3)", borderRadius: 7, position: "relative", border: "1px solid var(--ln)" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "var(--ln2)", borderRadius: 1 }} />
        <div style={{
          position: "absolute", top: 2, bottom: 2, borderRadius: 5,
          width: `${pct}%`, background: col, boxShadow: `0 0 10px ${col}66`,
          [short ? "right" : "left"]: "50%", transition: "all .7s ease"
        }} />
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--mono)", fontSize: 8, color: "var(--ln3)", pointerEvents: "none"
        }}>
          BALANCED
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: "var(--mono)", fontSize: 8, color: "var(--fnt)" }}>
        <span>−400 MW</span><span>0 MW</span><span>+400 MW</span>
      </div>
      {activeEvent ? (
        <div style={{
          marginTop: 5, padding: "5px 8px", borderRadius: 4, background: "#f5b22218",
          border: "1px solid #f5b22255", fontFamily: "var(--body)", fontSize: 10, color: "#f5b222"
        }}>
          {activeEvent.icon} {activeEvent.name}: {activeEvent.desc}
        </div>
      ) : (
        <div style={{ marginTop: 5, fontFamily: "var(--body)", fontSize: 10, color: "var(--gry)" }}>
          {short ? "Grid needs generation → your SELL bids are competitive"
            : "Grid has surplus → SELL bids less likely to clear"}
        </div>
      )}
    </div>
  );
}

// ── Frequency Gauge ───────────────────────────────────
function FreqGauge({ freq }) {
  const dev = freq - 50;
  const col = Math.abs(dev) > .2 ? "#f0455a" : Math.abs(dev) > .1 ? "#f5b222" : "#1de98b";
  const pct = clamp(50 + (dev / .5) * 50, 2, 98);
  const msg = Math.abs(dev) > .2 ? "⚠ Critical — emergency balancing needed"
    : Math.abs(dev) > .1 ? "△ Deviation detected — monitoring"
      : "✓ Stable — within normal operating band";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: col }}>{freq.toFixed(3)}</span>
        <span style={{ fontFamily: "var(--body)", fontSize: 10, color: "var(--gry)" }}>Hz  (target 50.000)</span>
      </div>
      <div style={{
        height: 12, borderRadius: 6, position: "relative", border: "1px solid var(--ln)",
        background: "linear-gradient(90deg,#f0455a33 0%,#f5b22233 20%,#1de98b22 40%,#1de98b22 60%,#f5b22233 80%,#f0455a33 100%)"
      }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--ln2)" }} />
        <div style={{
          position: "absolute", top: 1, bottom: 1, width: 10, borderRadius: 5, left: `calc(${pct}% - 5px)`,
          background: col, boxShadow: `0 0 8px ${col}`, transition: "left .35s ease"
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: "var(--mono)", fontSize: 8, color: "var(--fnt)" }}>
        <span>49.5</span><span>49.8</span><span>50.0</span><span>50.2</span><span>50.5</span>
      </div>
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────
function Panel({ title, icon, subtitle, accent = "#38c0fc", children, style = {}, bodyStyle = {} }) {
  return (
    <div style={{
      background: "var(--bg1)", border: "1px solid var(--ln)", borderRadius: 5,
      display: "flex", flexDirection: "column", overflow: "hidden", ...style
    }}>
      <div style={{
        padding: "4px 8px", borderBottom: "1px solid var(--ln)", flexShrink: 0,
        background: `linear-gradient(90deg,${accent}12,transparent 70%)`
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {icon && <span style={{ fontSize: 10 }}>{icon}</span>}
          <span style={{ fontFamily: "var(--body)", fontSize: 11, fontWeight: 800, color: accent }}>{title}</span>
        </div>
        {subtitle && <div style={{ fontFamily: "var(--body)", fontSize: 8, color: "var(--gry)", marginTop: 1 }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "5px 8px", ...bodyStyle }}>
        {children}
      </div>
    </div>
  );
}

// ── Small stat ─────────────────────────────────────────
function Stat({ label, value, hint, col = "var(--wht)", big = false }) {
  return (
    <div style={{ padding: "5px 0", borderBottom: "1px solid var(--ln)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--body)", fontSize: 10, color: "var(--gry)" }}>{label}</div>
          {hint && <div style={{ fontFamily: "var(--body)", fontSize: 8, color: "var(--dim)", marginTop: 1, maxWidth: 120 }}>{hint}</div>}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: big ? 14 : 11, fontWeight: 700, color: col, textAlign: "right" }}>{value}</div>
      </div>
    </div>
  );
}

// ── Chip ───────────────────────────────────────────────
const Chip = ({ children, col = "#4d7a96" }) => (
  <span style={{
    fontFamily: "var(--mono)", fontSize: 9, padding: "2px 6px", borderRadius: 3,
    background: col + "22", border: `1px solid ${col}55`, color: col, fontWeight: 600, whiteSpace: "nowrap"
  }}>
    {children}
  </span>
);

/* ════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════ */
export default function App() {
  const [S, setS] = useState(initState);
  const iRef = useRef(null);

  // ── RECORDING ─────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const recTimerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 30 },
        audio: false,
        preferCurrentTab: true,
      });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `GridForge_BM_Sim_${ts}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setRecording(false);
        setRecTime(0);
        clearInterval(recTimerRef.current);
      };
      // If user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
          mediaRecRef.current.stop();
        }
      };
      mr.start(1000); // capture in 1s chunks
      mediaRecRef.current = mr;
      setRecording(true);
      setRecTime(0);
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch (err) {
      console.log('Recording cancelled or not supported:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
    }
  };

  const fmtRecTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── TICK ──────────────────────────────────────────────
  const tick = useCallback(() => {
    setS(prev => {
      const p = { ...prev };
      p.tick++;
      p.simSeconds++;

      // ── frequency tied logically to grid balance (NIV) + BM Actions
      const yourDispatchDelta = (prev.yourResult && prev.yourResult.accepted && prev.userBidDir !== "HOLD")
        ? (prev.userBidDir === "SELL" ? prev.yourResult.dispatchedMW : -prev.yourResult.dispatchedMW)
        : 0;
      const effectiveNIV = prev.niv + yourDispatchDelta;

      // ±500MW corresponds roughly to ±0.35Hz deviation.
      const targetFreq = 50.0 + (effectiveNIV / 500) * 0.35;
      // Drift smoothly towards target with some analog noise (grid inertia)
      p.freq = clamp(prev.freq + (targetFreq - prev.freq) * 0.08 + (Math.random() - 0.5) * 0.015, 49.5, 50.5);

      // ── interval timer → trigger market clearing
      const ISEC = Math.max(3, Math.round(INTERVAL_SECS / prev.speed));
      p.intervalTimer = prev.intervalTimer + 1;

      if (p.intervalTimer >= ISEC) {
        p.intervalTimer = 0;

        // ── advance SP
        p.sp = (prev.sp % 48) + 1;

        // ── fire a random event?
        let event = null;
        if (!p.useLiveMarket) {
          const roll = Math.random();
          let cumProb = 0;
          for (const ev of EVENTS) {
            cumProb += ev.prob;
            if (roll < cumProb) { event = ev; break; }
          }
        }
        p.activeEvent = event;

        // ── update NIV from event + natural drift
        if (!p.useLiveMarket) {
          const eventNIV = event ? event.nivDelta : 0;
          const drift = (Math.random() - .5) * 60;
          p.niv = clamp(prev.niv * .6 + eventNIV + drift, -500, 500);
          p.baseNIV = p.niv;
        }

        // ── build price (If Live, relies on useEffect fetch. If sim, relies on uniform pricing clearing below)
        if (!p.useLiveMarket) {
          // We no longer build synthetic prices here!
          // We let the new Market Operator determine it based on supply vs demand intersection.
        }

        // ── RL Engine: Learn from PREVIOUS turn's result
        const stateKey = getRLState(p.niv, prev.soc, prev.freq);
        p.rlState = stateKey;

        // ── 1. BESS Agent Learning
        if (p.rlEnabled && prev.rlState && p.rlAction !== null) {
          let reward = 0;
          if (prev.yourResult && prev.yourResult.accepted && prev.userBidDir !== "HOLD") {
            const mwh = prev.yourResult.dispatchedMW * 0.5;
            const baselineValue = 85; // Shadow price of MWh inventory

            if (prev.userBidDir === "SELL") {
              // Selling: Cashflow - Re-purchase Cost - Degradation
              reward = prev.yourResult.revenue - (mwh * baselineValue) - (p.marginalCost * mwh);
            } else if (prev.userBidDir === "BUY") {
              // Buying: -Cashflow(cost) + Asset Value - Degradation
              reward = prev.yourResult.revenue + (mwh * baselineValue) - (p.marginalCost * mwh);
            }
          }
          if (prev.soc > 90) reward -= 50;
          if (prev.soc < 10) reward -= 50;

          const qT = { ...p.qTable };
          if (!qT[prev.rlState]) qT[prev.rlState] = new Array(RL_ACTIONS.length).fill(0);
          let oldQ = qT[prev.rlState][p.rlAction] || 0;

          if (!qT[stateKey]) qT[stateKey] = new Array(RL_ACTIONS.length).fill(0);
          const maxNextQ = Math.max(...qT[stateKey]);

          qT[prev.rlState][p.rlAction] = oldQ + 0.05 * (reward + 0.99 * maxNextQ - oldQ);
          p.qTable = qT;
          p.rlEpsilon = Math.max(0.05, p.rlEpsilon * 0.98);
        }

        // ── 2. Macro-Agent Learning (Generators & Consumers)
        if (!p.useLiveMarket && prev.rlState) {
          const ALPHA_MACRO = 0.05;
          const GAMMA_MACRO = 0.8; // Macro agents don't have long storage horizons

          // GENERATOR RL
          let genReward = 0;
          if (prev.clearing && prev.clearing.supply) {
            // Reward = (Clearing Price - Base Cost) * Dispatched MW
            prev.clearing.supply.forEach(g => {
              if (g.accepted && !g.isYou) {
                genReward += (prev.sbp - g.baseCost) * g.dispatchedMW;
              }
            });
          }
          const gQ = { ...p.genQTable };
          if (!gQ[prev.rlState]) gQ[prev.rlState] = new Array(GEN_ACTIONS.length).fill(0);
          let oldGQ = gQ[prev.rlState][p.genAction] || 0;
          if (!gQ[stateKey]) gQ[stateKey] = new Array(GEN_ACTIONS.length).fill(0);
          gQ[prev.rlState][p.genAction] = oldGQ + ALPHA_MACRO * (genReward + GAMMA_MACRO * Math.max(...gQ[stateKey]) - oldGQ);
          p.genQTable = gQ;
          p.genEpsilon = Math.max(0.05, p.genEpsilon * 0.99); // Slower decay for macro agents

          // CONSUMER RL
          let conReward = 0;
          if (prev.clearing && prev.clearing.demand) {
            // Reward = (Willingness to Pay - Clearing Price) * Dispatched MW  (Consumer Surplus)
            prev.clearing.demand.forEach(c => {
              if (c.accepted && !c.isYou) {
                conReward += (c.basePrice - prev.sbp) * c.dispatchedMW;
              }
            });
          }
          const cQ = { ...p.conQTable };
          if (!cQ[prev.rlState]) cQ[prev.rlState] = new Array(CON_ACTIONS.length).fill(0);
          let oldCQ = cQ[prev.rlState][p.conAction] || 0;
          if (!cQ[stateKey]) cQ[stateKey] = new Array(CON_ACTIONS.length).fill(0);
          cQ[prev.rlState][p.conAction] = oldCQ + ALPHA_MACRO * (conReward + GAMMA_MACRO * Math.max(...cQ[stateKey]) - oldCQ);
          p.conQTable = cQ;
          p.conEpsilon = Math.max(0.05, p.conEpsilon * 0.99);
        }

        // ── BESS Agent Action Selection
        if (p.rlEnabled) {
          let actionIdx = 0;
          if (Math.random() < p.rlEpsilon) {
            actionIdx = Math.floor(Math.random() * RL_ACTIONS.length);
          } else {
            actionIdx = getBestAction(p.qTable, stateKey) ?? Math.floor(Math.random() * RL_ACTIONS.length);
          }
          p.rlAction = actionIdx;
          const chosen = RL_ACTIONS[actionIdx];
          p.userBidDir = chosen.dir;
          if (chosen.dir === "HOLD") {
            p.userBidVol = 0;
            p.userBidPrice = p.sbp;
          } else {
            p.userBidPrice = clamp(p.sbp + chosen.offset, -50, 200);
            if (chosen.dir === "SELL") {
              p.userBidVol = clamp(prev.maxMW, 0, (prev.soc - 5) / 100 * prev.maxMWh * 2);
            } else {
              p.userBidVol = clamp(prev.maxMW, 0, (95 - prev.soc) / 100 * prev.maxMWh * 2);
            }
          }
        }

        // ── Macro-Agent Action Selection
        if (!p.useLiveMarket) {
          // Gen Action
          if (Math.random() < p.genEpsilon) p.genAction = Math.floor(Math.random() * GEN_ACTIONS.length);
          else {
            const qs = p.genQTable[stateKey] || new Array(GEN_ACTIONS.length).fill(0);
            p.genAction = qs.indexOf(Math.max(...qs));
          }

          // Con Action
          if (Math.random() < p.conEpsilon) p.conAction = Math.floor(Math.random() * CON_ACTIONS.length);
          else {
            const cqs = p.conQTable[stateKey] || new Array(CON_ACTIONS.length).fill(0);
            p.conAction = cqs.indexOf(Math.max(...cqs));
          }
        }

        // ── rebuild market curves with user's bid (pass event for logical MW adjustments)
        const eventFactor = event
          ? (event.priceDelta > 40 ? 1.5 : event.nivDelta < 0 ? 1.2 : 0.85)
          : 1.0;

        const genMult = GEN_ACTIONS[p.genAction]?.mult || 1.0;
        const conMult = CON_ACTIONS[p.conAction]?.mult || 1.0;

        const curves = buildMarketCurves(p.userBidPrice, p.userBidVol, p.userBidDir, eventFactor, event, genMult, conMult);
        p.marketCurves = curves;

        let yourResult = { accepted: false, dispatchedMW: 0, revenue: 0, profit: 0, rank: 0, yourPrice: p.userBidPrice, priceRejected: false, dir: p.userBidDir };

        // Always run the market clearing to find the true price intersection
        const clearing = clearMarketUniform(curves.supply, curves.demand);
        p.clearing = clearing;

        if (!p.useLiveMarket) {
          p.sbp = clearing.clearingPrice;
          p.ssp = Math.max(0, clearing.clearingPrice - R(2, 4));
          p.spotPrice = clearing.clearingPrice;
        }

        if (p.userBidVol > 0) {
          const isSell = p.userBidDir === "SELL";
          const stack = isSell ? clearing.supply : clearing.demand;
          const you = stack.find(u => u.isYou);

          if (you) {
            const energyMWh = you.dispatchedMW * 0.5;

            // Cashflow: Positive when selling, Negative when buying
            const cashflow = isSell
              ? energyMWh * clearing.clearingPrice
              : -(energyMWh * clearing.clearingPrice);

            // True net economic value added this turn in CASH (excluding paper inventory)
            const profit = you.accepted ? (cashflow - (p.marginalCost * energyMWh)) : 0;

            yourResult = {
              accepted: you.accepted,
              dispatchedMW: you.dispatchedMW,
              revenue: you.accepted ? cashflow : 0,
              profit: you.accepted ? profit : 0,
              rank: you.rank,
              yourPrice: p.userBidPrice,
              priceRejected: !you.accepted && (isSell ? p.userBidPrice > clearing.clearingPrice : p.userBidPrice < clearing.clearingPrice),
              dir: p.userBidDir
            };
          }
        }

        p.yourResult = yourResult;

        if (yourResult.accepted && yourResult.dispatchedMW > 0) {
          const energy = yourResult.dispatchedMW * 0.5; // MWh per SP
          const factor = p.userBidDir === "SELL" ? -1 : 1; // discharge vs charge
          p.soc = clamp(prev.soc + factor * (energy / prev.maxMWh) * 100, 5, 100);
        } else {
          // small passive drift
          p.soc = clamp(prev.soc + .4, 5, 100);
        }

        // ── P&L + streaks
        p.totalPnl = prev.totalPnl + (yourResult.profit || 0);
        p.peakPrice = Math.max(prev.peakPrice || 0, p.sbp);
        p.extremeEvent = event && (event.id === "DUNKEL" || event.id === "CASCADE" || event.id === "CABLE_FIRE" || event.id === "PRICE_SPIKE");
        if (yourResult.accepted) {
          p.sessionRevenue = (prev.sessionRevenue || 0) + yourResult.revenue;
          p.sessionCost = (prev.sessionCost || 0) + (p.marginalCost * 0.5 * yourResult.dispatchedMW);
          p.dispatchedSPs = (prev.dispatchedSPs || 0) + 1;
          p.dispatchFlash = true;
          p.streakCount = (prev.streakCount || 0) + 1;
          p.bestStreak = Math.max(prev.bestStreak || 0, p.streakCount);
          p.lcStep = 4; // dispatched
          setTimeout(() => setS(s => ({ ...s, dispatchFlash: false, lcStep: 5 })), 1800);
        } else {
          p.missedSPs = (prev.missedSPs || 0) + 1;
          p.streakCount = 0;
          p.lcStep = Math.random() > .5 ? 3 : 2; // stuck at ranked/rejected
        }

        // ── OHLC bar for this SP
        const bar = {
          sp: p.sp,
          open: prev.spotPrice,
          close: p.spotPrice,
          high: Math.max(prev.spotPrice, p.spotPrice) + Math.random() * 3,
          low: Math.min(prev.spotPrice, p.spotPrice) - Math.random() * 3,
        };
        p.priceHist = [...prev.priceHist.slice(-44), bar];

        // ── spHistory record
        const spRec = {
          sp: p.sp,
          time: spToTime(p.sp),
          niv: p.niv,
          clearingPrice: p.clearing?.clearingPrice || prev.sbp,
          yourAccepted: yourResult.accepted,
          yourMW: yourResult.dispatchedMW,
          yourRevenue: yourResult.profit || 0, // In the history log table, display Profit
          yourRank: yourResult.rank,
          eventName: event?.name || null,
          eventIcon: event?.icon || null,
        };
        p.spHistory = [spRec, ...prev.spHistory].slice(0, 20);

        // ── narrative
        p.narrative = narrateSP(p.sp, p.niv, p.clearing || { clearingPrice: p.sbp }, yourResult, event);

        // ── event log
        if (event) {
          p.eventLog = [{
            sp: p.sp, time: spToTime(p.sp),
            text: `${event.icon} ${event.name}: ${event.desc}`,
            price: p.sbp,
          }, ...prev.eventLog].slice(0, 8);
        }

      } else {
        // between clearing intervals — smooth price movement
        p.spotPrice = clamp(prev.spotPrice + (Math.random() - .5) * .8, 55, 280);
        p.sbp = clamp(prev.sbp + (Math.random() - .5) * .6, 55, 280);
        p.ssp = clamp(prev.ssp + (Math.random() - .5) * .5, 50, 270);

        const yourDispatchDelta = (prev.yourResult && prev.yourResult.accepted && prev.userBidDir !== "HOLD")
          ? (prev.userBidDir === "SELL" ? prev.yourResult.dispatchedMW : -prev.yourResult.dispatchedMW)
          : 0;
        const effectiveNIV = prev.niv + yourDispatchDelta;

        const targetFreq = 50.0 + (effectiveNIV / 500) * 0.35;
        p.freq = clamp(prev.freq + (targetFreq - prev.freq) * 0.08 + (Math.random() - 0.5) * 0.015, 49.5, 50.5);
      }

      // ── capture average
      p.capturePx = p.dispatchedSPs > 0
        ? (prev.sessionRevenue || 0) / ((prev.dispatchedSPs || 1) * (prev.userBidVol / 2))
        : 0;

      return p;
    });
  }, []);

  // ── TIMER ─────────────────────────────────────────────
  useEffect(() => {
    if (S.running) iRef.current = setInterval(tick, 900);
    else clearInterval(iRef.current);
    return () => clearInterval(iRef.current);
  }, [S.running, tick]);

  // ── LIVE MARKET DATA FETCH (BMRS API) ──────────────────
  useEffect(() => {
    if (!S.useLiveMarket) return;

    let isFetching = false;
    const fetchElexon = async () => {
      if (isFetching || !S.useLiveMarket) return;
      isFetching = true;
      try {
        // Elexon BMRS Insights API
        const today = new Date().toISOString().split('T')[0];
        // Fetch SP 1 as an aggressive test, or we can fetch latest.
        // For simulation purposes, we loop through periods to keep it moving.
        const pd = clamp(S.sp, 1, 48);
        const url = `https://data.elexon.co.uk/bmrs/api/v1/balancing/settlement/system-prices/${today}/${pd}`;

        const res = await fetch(url, { headers: { "Accept": "application/json" } });
        if (!res.ok) throw new Error("API error");
        const json = await res.json();

        if (json && json.data && json.data.length > 0) {
          const d = json.data[0];
          setS(prev => ({
            ...prev,
            sbp: d.systemBuyPrice,
            ssp: d.systemSellPrice,
            spotPrice: (d.systemBuyPrice + d.systemSellPrice) / 2,
            niv: d.netImbalanceVolume,
            liveDataStale: false,
            liveLastUpdated: new Date().toLocaleTimeString(),
            narrative: `📶 Connected to Elexon BMRS: Pulled SP ${pd} Prices live.`
          }));
        } else {
          setS(p => ({ ...p, liveDataStale: true }));
        }
      } catch (err) {
        console.warn("BMRS Fetch Failed:", err);
        setS(p => ({ ...p, liveDataStale: true, narrative: `⚠ Elexon connection failed. Simulation mode fallback.` }));
      }
      isFetching = false;
    };

    // Poll every 5 seconds if live mode is on
    fetchElexon();
    const liveTimer = setInterval(fetchElexon, 5000);
    return () => clearInterval(liveTimer);
  }, [S.useLiveMarket, S.sp]);

  // ── USER ACTIONS ───────────────────────────────────────
  const updateBid = (field, val) => {
    setS(p => {
      const np = { ...p, [field]: val };
      const eventFactor = p.activeEvent ? (p.activeEvent.priceDelta > 40 ? 1.5 : p.activeEvent.nivDelta < 0 ? 1.2 : 0.85) : 1.0;

      const genMult = GEN_ACTIONS[p.genAction]?.mult || 1.0;
      const conMult = CON_ACTIONS[p.conAction]?.mult || 1.0;

      np.marketCurves = buildMarketCurves(
        field === "userBidPrice" ? val : p.userBidPrice,
        field === "userBidVol" ? val : p.userBidVol,
        field === "userBidDir" ? val : p.userBidDir,
        eventFactor,
        p.activeEvent,
        genMult,
        conMult
      );
      return np;
    });
  };

  // ── DERIVED ────────────────────────────────────────────
  const gateCountdown = INTERVAL_SECS - S.intervalTimer;
  const gateUrgent = gateCountdown <= 3;
  const pnlCol = S.totalPnl >= 0 ? "#1de98b" : "#f0455a";
  const freqCol = Math.abs(S.freq - 50) > .2 ? "#f0455a" : Math.abs(S.freq - 50) > .1 ? "#f5b222" : "#1de98b";

  // Find your active bid in either the supply or demand curve
  const yourMerit = S.userBidDir === "SELL"
    ? S.marketCurves?.supply.find(u => u.id === "BESS_YOU")
    : S.userBidDir === "BUY"
      ? S.marketCurves?.demand.find(u => u.id === "BESS_YOU")
      : null;

  const yourRank = yourMerit?.rank || "?";
  const yourWillClear = S.userBidDir === "SELL"
    ? yourMerit?.price <= S.sbp
    : S.userBidDir === "BUY"
      ? yourMerit?.price >= S.sbp
      : false;

  // rl stats 
  const rlQVals = S.qTable[S.rlState] || [0, 0, 0, 0, 0, 0];
  const maxQAction = getBestAction(S.qTable, S.rlState);
  const STEPS = ["Created", "Submitted", "Ranked in Queue", "Accepted by ESO", "Dispatched", "Settled & Paid"];
  const STEP_HINTS = [
    "Bid object built with your price & volume",
    "Sent to ESO via BM system before gate closure",
    `Currently ranked #${yourRank} in the ${S.userBidDir} stack`,
    "ESO issued Balancing Order to dispatch your unit",
    "Battery is discharging power to the grid",
    "Revenue confirmed and recorded in settlement",
  ];
  const histRevs = S.spHistory.map(s => s.yourRevenue);
  const totalAccepted = S.spHistory.filter(s => s.yourAccepted).length;
  const totalSPs = S.spHistory.length;

  return (
    <>
      <style>{FONTS + BASE_CSS}</style>
      <div style={{
        width: "100vw", height: "100vh", background: "var(--bg0)",
        display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "var(--body)"
      }}>

        {/* ══ TOP BAR ══════════════════════════════════════════════ */}
        <div style={{
          height: 44, background: "var(--bg1)", borderBottom: "1px solid var(--ln)",
          display: "flex", alignItems: "center", padding: "0 12px", gap: 0, flexShrink: 0
        }}>

          {/* Logo */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7, paddingRight: 12,
            borderRight: "1px solid var(--ln)", marginRight: 10
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: "linear-gradient(135deg,#f5b222,#38c0fc)",
              boxShadow: "0 0 10px #38c0fc55"
            }} />
            <div>
              <div style={{ fontFamily: "var(--body)", fontWeight: 900, fontSize: 15, color: "var(--wht)", lineHeight: 1, letterSpacing: .5 }}>GRIDFORGE</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 7, color: "var(--gry)", letterSpacing: "2px" }}>BALANCING MECHANISM</div>
            </div>
          </div>

          {/* Live tickers */}
          {[
            { label: "Spot Price", val: `£${f2(S.spotPrice)}/MWh`, col: "#38c0fc" },
            { label: "SBP — ESO pays", val: `£${f2(S.sbp)}/MWh`, col: "#f5b222" },
            { label: "SSP — ESO sells", val: `£${f2(S.ssp)}/MWh`, col: "#38c0fc" },
            { label: "Grid Balance", val: `${S.niv > 0 ? "+" : ""}${f0(S.niv)} MW`, col: S.niv < 0 ? "#f0455a" : "#1de98b" },
            { label: "Frequency", val: `${S.freq.toFixed(3)} Hz`, col: freqCol },
            { label: "Settlement", val: `SP ${S.sp} / 48`, col: "var(--gry)" },
          ].map((item, i) => (
            <div key={i} style={{
              display: "flex", flexDirection: "column", padding: "0 11px",
              borderRight: "1px solid var(--ln)", minWidth: 82
            }}>
              <div style={{ fontSize: 8, color: "var(--gry)", marginBottom: 1 }}>{item.label}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: item.col, lineHeight: 1 }}>{item.val}</div>
            </div>
          ))}

          {/* Gate countdown */}
          <div style={{
            display: "flex", flexDirection: "column", padding: "0 11px",
            borderRight: "1px solid var(--ln)", minWidth: 105,
            background: gateUrgent ? "#f0455a11" : "transparent"
          }}>
            <div style={{ fontSize: 8, color: gateUrgent ? "#f0455a" : "var(--gry)", marginBottom: 1 }}>
              {gateUrgent ? "⚠ Clearing NOW!" : "Next Clearing In"}
            </div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700,
              color: gateUrgent ? "#f0455a" : "#f5b222",
              animation: gateUrgent ? "blink .7s ease-in-out infinite" : "none"
            }}>
              {gateCountdown}s — SP {S.sp}
            </div>
          </div>

          {/* P&L */}
          <div style={{
            display: "flex", flexDirection: "column", padding: "0 11px",
            borderRight: "1px solid var(--ln)", minWidth: 100
          }}>
            <div style={{ fontSize: 8, color: "var(--gry)", marginBottom: 1 }}>Your Total Profit</div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: pnlCol,
              textShadow: `0 0 8px ${pnlCol}66`
            }}>{fPd(S.totalPnl)}</div>
          </div>

          {/* Your bid summary */}
          <div style={{
            display: "flex", flexDirection: "column", padding: "0 11px",
            borderRight: "1px solid var(--ln)", minWidth: 130
          }}>
            <div style={{ fontSize: 8, color: "var(--gry)", marginBottom: 1 }}>Your Active Bid</div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
              color: yourWillClear ? "#1de98b" : "#f0455a"
            }}>
              SELL £{f2(S.userBidPrice)}/{S.userBidVol}MW · Rank #{yourRank}
              {yourWillClear ? " ✓" : " ✗"}
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {/* Speed */}
            <div style={{ display: "flex", gap: 2 }}>
              {[1, 2, 4].map(sp => (
                <button key={sp} onClick={() => setS(p => ({ ...p, speed: sp }))} style={{
                  fontFamily: "var(--mono)", fontSize: 9, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                  background: S.speed === sp ? "#f5b22222" : "var(--bg2)",
                  border: `1px solid ${S.speed === sp ? "#f5b22288" : "var(--ln)"}`,
                  color: S.speed === sp ? "#f5b222" : "var(--gry)"
                }}>{sp}×</button>
              ))}
            </div>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: S.running ? "#1de98b" : "#f0455a",
              boxShadow: `0 0 8px ${S.running ? "#1de98b" : "#f0455a"}`,
              animation: S.running ? "blink 1.5s ease-in-out infinite" : "none"
            }} />
            <button onClick={() => setS(p => ({ ...p, running: !p.running }))} style={{
              fontFamily: "var(--body)", fontSize: 11, fontWeight: 700, padding: "5px 14px",
              borderRadius: 4, cursor: "pointer", border: "none",
              background: S.running ? "#f0455a22" : "#1de98b22",
              color: S.running ? "#f0455a" : "#1de98b",
              outline: `1px solid ${S.running ? "#f0455a88" : "#1de98b88"}`
            }}>{S.running ? "⏸ Pause" : "▶ Start"}</button>
            <button onClick={() => setS(initState)} style={{
              fontFamily: "var(--body)", fontSize: 11, padding: "5px 10px", borderRadius: 4,
              cursor: "pointer", background: "var(--bg2)", border: "1px solid var(--ln)", color: "var(--gry)"
            }}>↺</button>

            {/* Live Data Toggle */}
            <button onClick={() => setS(p => ({ ...p, useLiveMarket: !p.useLiveMarket }))} style={{
              fontFamily: "var(--body)", fontSize: 11, fontWeight: 700, padding: "5px 10px",
              borderRadius: 4, cursor: "pointer",
              background: S.useLiveMarket ? "#38c0fc22" : "var(--bg2)",
              color: S.useLiveMarket ? "#38c0fc" : "var(--gry)",
              border: `1px solid ${S.useLiveMarket ? "#38c0fc" : "var(--ln)"}`,
              display: "flex", alignItems: "center", gap: 5
            }}>
              {S.useLiveMarket ? "📡 LIVE UK GRID" : "🎮 OFFLINE SIM"}
            </button>

            {/* Record button */}
            <button onClick={recording ? stopRecording : startRecording} style={{
              fontFamily: "var(--body)", fontSize: 11, fontWeight: 700, padding: "5px 14px",
              borderRadius: 4, cursor: "pointer", border: "none",
              background: recording ? "#f0455a22" : "#b78bfa22",
              color: recording ? "#f0455a" : "#b78bfa",
              outline: `1px solid ${recording ? "#f0455a88" : "#b78bfa88"}`,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {recording && (
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: "#f0455a",
                  animation: "blink 1s ease-in-out infinite"
                }} />
              )}
              {recording ? `⏹ Stop ${fmtRecTime(recTime)}` : "🔴 Record"}
            </button>
          </div>
        </div>

        {/* ══ NARRATIVE TICKER ══════════════════════════════════════ */}
        <div style={{
          height: 26, background: "var(--bg2)", borderBottom: "1px solid var(--ln)",
          display: "flex", alignItems: "center", overflow: "hidden", flexShrink: 0,
          borderLeft: `3px solid ${S.dispatchFlash ? "#1de98b" : "#38c0fc"}`
        }}>
          <div style={{
            padding: "0 10px", fontFamily: "var(--mono)", fontSize: 9,
            color: S.dispatchFlash ? "#1de98b" : "#f5b222", fontWeight: 600, whiteSpace: "nowrap",
            animation: S.dispatchFlash ? "fadeUp .4s ease" : "none"
          }}>
            {S.narrative}
          </div>
        </div>

        {/* ══ MAIN GRID ══════════════════════════════════════════════ */}
        <div style={{
          flex: 1, minHeight: 0, display: "grid",
          gridTemplateColumns: "168px 1.3fr 0.7fr 160px",
          gridTemplateRows: "0.85fr 1.15fr",
          gap: 4, padding: 4, overflow: "hidden"
        }}>

          {/* ── LEFT COL (spans both rows) ── */}
          <div style={{ gridRow: "1/3", display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>

            {/* Battery */}
            <Panel icon="🔋" title="Battery (BESS)" accent="#1de98b"
              subtitle={
                <div style={{ display: "flex", gap: 3, alignItems: "center", marginTop: 2 }}>
                  <input type="number" value={S.maxMW} onChange={e => { updateBid("maxMW", +e.target.value); updateBid("userBidVol", Math.min(S.userBidVol, +e.target.value)); }}
                    style={{ width: 44, background: "var(--bg3)", border: "1px solid var(--ln)", color: "var(--gry)", fontSize: 9, borderRadius: 2, padding: "1px 2px", fontFamily: "var(--mono)" }} />
                  <span>MW</span>
                  <span style={{ color: "var(--ln)" }}>/</span>
                  <input type="number" value={S.maxMWh} onChange={e => updateBid("maxMWh", +e.target.value)}
                    style={{ width: 50, background: "var(--bg3)", border: "1px solid var(--ln)", color: "var(--gry)", fontSize: 9, borderRadius: 2, padding: "1px 2px", fontFamily: "var(--mono)" }} />
                  <span>MWh</span>
                </div>
              }>
              <BatteryViz soc={Math.round(S.soc * 10) / 10}
                dispatching={S.lcStep === 4} direction={S.userBidDir} maxMW={S.maxMW} maxMWh={S.maxMWh} />
            </Panel>

            {/* Bid Controls */}
            <Panel icon="🎛" title={S.rlEnabled && S.running ? "AI Bid Engine (RL)" : "Your Bid Settings"} accent="#f5b222"
              subtitle={S.rlEnabled && S.running ? "Q-Learning Agent actively trading" : "Set price & volume — affects your rank in the merit order"}>

              {S.rlEnabled && S.running ? (
                // RL VISUALIZER
                <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--gry)" }}>CURRENT STATE</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#b78bfa" }}>[{S.rlState}]</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: "var(--gry)" }}>AI STRATEGY</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: S.rlEpsilon > Math.random() ? "#38c0fc" : "#1de98b" }}>
                        {S.rlEpsilon > Math.random() ? "EXPLORING" : "EXPLOITING"}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 9, color: "var(--gry)", marginBottom: 4 }}>ACTION Q-VALUES</div>
                  <div style={{ display: "grid", gap: 3 }}>
                    {RL_ACTIONS.map((act, i) => {
                      const isChosen = S.rlAction === i;
                      const qv = rlQVals[i] || 0;
                      return (
                        <div key={i} style={{
                          display: "flex", justifyContent: "space-between", padding: "4px 8px", borderRadius: 3,
                          background: isChosen ? "#f5b22222" : "var(--bg3)", border: `1px solid ${isChosen ? "#f5b222" : "var(--ln)"}`
                        }}>
                          <div style={{ fontSize: 10, color: isChosen ? "#f5b222" : "var(--wht)", fontWeight: isChosen ? 700 : 400 }}>{act.name}</div>
                          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: isChosen ? "#f5b222" : "var(--gry)" }}>Q: {qv.toFixed(0)}</div>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ marginTop: 12, padding: "8px", background: "var(--bg2)", borderRadius: 4, border: "1px solid var(--ln)" }}>
                    <div style={{ fontSize: 10, color: "var(--gry)", marginBottom: 4 }}>SUBMITTED BID</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 800, color: S.userBidDir === "SELL" ? "#f5b222" : "#38c0fc" }}>
                      {S.userBidDir} {f0(S.userBidVol)}MW @ £{f2(S.userBidPrice)}
                    </div>
                  </div>

                  <button onClick={() => setS(p => ({ ...p, rlEnabled: false }))} style={{ marginTop: "auto", padding: 6, background: "var(--bg3)", border: "1px solid var(--ln)", borderRadius: 4, color: "var(--wht)", cursor: "pointer", fontSize: 10 }}>
                    Disable AI Agent
                  </button>
                </div>
              ) : (
                // MANUAL UI
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button onClick={() => updateBid("userBidDir", "SELL")} style={{
                      flex: 1, padding: "4px 0", borderRadius: 4, border: `1px solid ${S.userBidDir === "SELL" ? "#f5b222" : "var(--ln)"}`,
                      background: S.userBidDir === "SELL" ? "#f5b22222" : "transparent",
                      color: S.userBidDir === "SELL" ? "#f5b222" : "var(--gry)",
                      fontFamily: "var(--body)", fontSize: 10, fontWeight: 700, cursor: "pointer"
                    }}>SELL (Discharge)</button>
                    <button onClick={() => updateBid("userBidDir", "BUY")} style={{
                      flex: 1, padding: "4px 0", borderRadius: 4, border: `1px solid ${S.userBidDir === "BUY" ? "#38c0fc" : "var(--ln)"}`,
                      background: S.userBidDir === "BUY" ? "#38c0fc22" : "transparent",
                      color: S.userBidDir === "BUY" ? "#38c0fc" : "var(--gry)",
                      fontFamily: "var(--body)", fontSize: 10, fontWeight: 700, cursor: "pointer"
                    }}>BUY (Charge)</button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 10, color: "var(--gry)" }}>Bid Price (£/MWh)</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: S.userBidDir === "SELL" ? "#f5b222" : "#38c0fc" }}>
                        {fP(S.userBidPrice, true)}
                      </div>
                    </div>
                    <input type="range" min={-50} max={200} step={0.5}
                      value={S.userBidPrice}
                      onChange={e => updateBid("userBidPrice", +e.target.value)}
                      style={{ width: "100%", accentColor: S.userBidDir === "SELL" ? "#f5b222" : "#38c0fc" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "var(--fnt)", marginTop: 2 }}>
                      <span>-£50</span><span>£200</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 10, color: "var(--gry)" }}>Volume (MW)</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--wht)" }}>{S.userBidVol} MW</div>
                    </div>
                    <input type="range" min={5} max={S.maxMW} step={5}
                      value={S.userBidVol}
                      onChange={e => updateBid("userBidVol", +e.target.value)}
                      style={{ width: "100%", accentColor: "var(--wht)" }} />
                  </div>

                  {(!S.rlEnabled && S.running) && (
                    <button onClick={() => setS(p => ({ ...p, rlEnabled: true }))} style={{ marginTop: "auto", padding: 6, background: "#b78bfa22", border: "1px solid #b78bfa88", borderRadius: 4, color: "#b78bfa", fontWeight: 700, cursor: "pointer", fontSize: 10 }}>
                      Enable AI Agent
                    </button>
                  )}

                  {/* rank indicator */}
                  <div style={{
                    padding: "4px 6px", borderRadius: 3, marginTop: 8,
                    background: yourWillClear ? "#1de98b12" : "#f0455a12",
                    border: `1px solid ${yourWillClear ? "#1de98b44" : "#f0455a44"}`
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: yourWillClear ? "#1de98b" : "#f0455a" }}>
                      {yourWillClear ? `✓ Rank #${yourRank} — ACCEPTED` : `✗ Rank #${yourRank} — REJECTED`}
                    </div>
                  </div>
                </>
              )}
            </Panel>

            <Panel icon="⚡" title="Grid Frequency" accent="#f5b222">
              <FreqGauge freq={S.freq} />
            </Panel>
          </div>

          {/* ── CENTRE-LEFT TOP: PRICE CHART ── */}
          <div style={{ gridColumn: 2, gridRow: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            <Panel icon="📈" title="Electricity Price — OHLC Chart" accent="#38c0fc"
              subtitle={`Each candle = one 30-min settlement period. Green = price rose, Red = price fell. SBP/SSP dashed lines.`}
              style={{ flex: 1 }}>
              <OHLCChart bars={S.priceHist} sbp={S.sbp} ssp={S.ssp} currentPrice={S.spotPrice} />
            </Panel>
          </div>

          {/* ── CENTRE-LEFT BOTTOM: MERIT ORDER ── */}
          <div style={{ gridColumn: 2, gridRow: 2 }}>
            <Panel icon="🏆" title="Supply Curve (Generation & Discharge)" accent="#f5b222"
              subtitle={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Cheapest energy accepted first. Clears against demand curve.</span>
                  {!S.useLiveMarket && (
                    <span style={{ background: "#f5b22222", padding: "2px 6px", borderRadius: 4, border: "1px solid #f5b22255", color: "#f5b222", fontWeight: 700 }}>
                      AI Gen Strategy: {GEN_ACTIONS[S.genAction]?.name || "None"}
                    </span>
                  )}
                </div>
              }>
              <div style={{
                display: "grid", gridTemplateColumns: "20px 1fr 62px 58px 58px 68px", gap: 3,
                fontSize: 8, color: "var(--gry)", padding: "2px 3px", borderBottom: "1px solid var(--ln)", marginBottom: 4
              }}>
                <span>#</span><span>Participant</span><span>Offer £/MWh</span><span>MW</span><span>Type</span><span>Status</span>
              </div>
              <div style={{ flex: 1 }}>
                {(S.marketCurves?.supply || []).map((m, i) => {
                  const col = m.color || "#888";
                  const isClearing = Math.abs(m.price - S.sbp) < 3;
                  return (
                    <div key={m.id} className={i === 0 ? "fadeUp" : ""} style={{
                      display: "grid", gridTemplateColumns: "20px 1fr 62px 58px 58px 68px", gap: 3,
                      padding: "4px 3px", marginBottom: 2, borderRadius: 3, alignItems: "center",
                      background: m.isYou ? "#f5b22210" : m.accepted ? "#1de98b06" : "#f0455a06",
                      border: `1px solid ${m.isYou ? "#f5b22244" : m.accepted ? "#1de98b22" : "#f0455a22"}`,
                      borderLeft: `2px solid ${m.isYou ? "#f5b222" : m.accepted ? "#1de98b" : "#f0455a33"}`,
                      transition: "all .5s ease"
                    }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", fontWeight: 700 }}>{m.rank}</span>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: m.isYou ? 800 : 500, color: m.isYou ? "#f5b222" : "var(--wht)" }}>{m.name}</div>
                        <div style={{ fontSize: 8, color: col }}>{m.type}</div>
                      </div>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                        color: m.price > S.sbp ? "#f0455a" : "#1de98b"
                      }}>£{f1(m.price)}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gry)" }}>{f0(m.mw)} MW</span>
                      <Chip col={col}>{m.type}</Chip>
                      <Chip col={m.accepted ? "#1de98b" : "#f0455a"}>
                        {m.accepted ? `✓ Accept` : "✗ Skip"}
                      </Chip>
                    </div>
                  );
                })}
              </div>
              <div style={{
                marginTop: 5, padding: "4px 8px", borderRadius: 4,
                background: "#f5b22210", border: "1px solid #f5b22233",
                fontFamily: "var(--mono)", fontSize: 9, color: "#f5b222"
              }}>
                ── Clearing price £{f2(S.sbp)}/MWh — everything below this line is accepted ──
              </div>
            </Panel>

            <Panel icon="🛒" title="Demand Curve (Consumer & Charge)" accent="#38c0fc"
              style={{ marginTop: 5 }}
              subtitle={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Highest willingness to pay accepted first. Clears against supply curve.</span>
                  {!S.useLiveMarket && (
                    <span style={{ background: "#38c0fc22", padding: "2px 6px", borderRadius: 4, border: "1px solid #38c0fc55", color: "#38c0fc", fontWeight: 700 }}>
                      AI Consumer Strategy: {CON_ACTIONS[S.conAction]?.name || "None"}
                    </span>
                  )}
                </div>
              }>
              <div style={{
                display: "grid", gridTemplateColumns: "20px 1fr 62px 58px 58px 68px", gap: 3,
                fontSize: 8, color: "var(--gry)", padding: "2px 3px", borderBottom: "1px solid var(--ln)", marginBottom: 4
              }}>
                <span>#</span><span>Participant</span><span>Bid £/MWh</span><span>MW</span><span>Type</span><span>Status</span>
              </div>
              <div style={{ flex: 1, maxHeight: 180, overflow: "auto" }}>
                {(S.marketCurves?.demand || []).map((m, i) => {
                  const col = m.color || "#888";
                  return (
                    <div key={m.id} className={i === 0 ? "slideLeft" : ""} style={{
                      display: "grid", gridTemplateColumns: "20px 1fr 62px 58px 58px 68px", gap: 3,
                      padding: "4px 3px", marginBottom: 2, borderRadius: 3, alignItems: "center",
                      background: m.isYou ? "#38c0fc10" : m.accepted ? "#1de98b06" : "#f0455a06",
                      border: `1px solid ${m.isYou ? "#38c0fc44" : m.accepted ? "#1de98b22" : "#f0455a22"}`,
                      borderLeft: `2px solid ${m.isYou ? "#38c0fc" : m.accepted ? "#1de98b" : "#f0455a33"}`,
                      transition: "all .5s ease"
                    }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", fontWeight: 700 }}>{m.rank}</span>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: m.isYou ? 800 : 500, color: m.isYou ? "#38c0fc" : "var(--wht)" }}>{m.name}</div>
                        <div style={{ fontSize: 8, color: col }}>{m.type}</div>
                      </div>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                        color: m.price < S.sbp ? "#f0455a" : "#1de98b" // For demand, below SBP means rejected (red)
                      }}>£{f1(m.price)}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gry)" }}>{f0(m.mw)} MW</span>
                      <Chip col={col}>{m.type}</Chip>
                      <Chip col={m.accepted ? "#1de98b" : "#f0455a"}>
                        {m.accepted ? `✓ Accept` : "✗ Skip"}
                      </Chip>
                    </div>
                  );
                })}
              </div>
              <div style={{
                marginTop: 5, padding: "4px 8px", borderRadius: 4,
                background: "#38c0fc10", border: "1px solid #38c0fc33",
                fontFamily: "var(--mono)", fontSize: 9, color: "#38c0fc"
              }}>
                ── Clearing price £{f2(S.sbp)}/MWh — everything above this line is accepted ──
              </div>
            </Panel>
          </div>

          {/* ── CENTRE-RIGHT (spans both rows): SYSTEM STATE + P&L ── */}
          <div style={{ gridColumn: 3, gridRow: "1/3", display: "flex", flexDirection: "column", gap: 5, overflow: "auto" }}>
            <Panel icon="⚖" title="Grid Balance (NIV)" accent="#f0455a"
              subtitle="Net Imbalance Volume — how short or long the grid is right now"
              style={{ flex: "0 0 auto" }}>
              <NIVMeter niv={S.niv} activeEvent={S.activeEvent} />
            </Panel>

            <Panel icon="💰" title="Your P&L" accent="#1de98b"
              subtitle="Treating energy as inventory across time">
              <div style={{ textAlign: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 9, color: "var(--gry)", marginBottom: 2 }}>PORTFOLIO VALUE (Cash Bank + Inventory Value)</div>
                <div style={{
                  fontFamily: "var(--body)", fontSize: 22, fontWeight: 900, color: pnlCol, lineHeight: 1,
                  textShadow: `0 0 20px ${pnlCol}66`
                }}>{S.totalPnl + ((S.soc / 100) * S.maxMWh * S.sbp) >= 0 ? "+" : "-"}£{f0(Math.abs(S.totalPnl + ((S.soc / 100) * S.maxMWh * S.sbp)))}</div>
                <div style={{ fontSize: 9, color: "var(--gry)", marginTop: 2 }}>
                  {totalAccepted} of {totalSPs} periods dispatched
                  {totalSPs > 0 ? ` (${Math.round(totalAccepted / totalSPs * 100)}% hit rate)` : ""}
                </div>
              </div>
              <Stat label="Realised Cash Balance" value={S.totalPnl >= 0 ? `+£${f0(S.totalPnl)}` : `-£${f0(Math.abs(S.totalPnl))}`} col={S.totalPnl >= 0 ? "#1de98b" : "#f0455a"} hint="Drops when buying, rises when selling" />
              <Stat label="Inventory Value" value={`£${f0((S.soc / 100) * S.maxMWh * S.sbp)}`} col="#b78bfa" hint="Stored Energy × Current Price" />
              <Stat label="Periods accepted" value={`${S.dispatchedSPs || 0} SPs`} col="#1de98b" />
              <Stat label="Periods missed" value={`${S.missedSPs || 0} SPs`} col="#f0455a" hint="Bids that did not clear" />
              <Stat label="Degradation Cost (MC)" value={`£${f0(S.marginalCost)}/MWh`} col="#f5b222" hint="Battery life cost per transaction" />
              {histRevs.length > 1 && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ fontSize: 9, color: "var(--gry)", marginBottom: 3 }}>Profit per settlement period (£)</div>
                  <Spark data={histRevs.slice().reverse()} w={185} h={38} color="#1de98b" />
                </div>
              )}
            </Panel>

            {/* Results by Period — moved here from left sidebar for more room */}
            <Panel icon="📊" title="Results by Period" accent="#b78bfa"
              subtitle="Your outcome each settlement period" style={{ flex: 1 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "28px 40px 1fr 52px", gap: 2,
                fontSize: 8, color: "var(--gry)", padding: "2px 0", borderBottom: "1px solid var(--ln)", marginBottom: 3
              }}>
                <span>SP</span><span>NIV</span><span>Result</span><span style={{ textAlign: "right" }}>Revenue</span>
              </div>
              {S.spHistory.slice(0, 12).map((rec, i) => (
                <div key={i} className={i === 0 ? "fadeUp" : ""} style={{
                  display: "grid", gridTemplateColumns: "28px 40px 1fr 52px", gap: 2,
                  padding: "3px 0", borderBottom: "1px solid var(--ln)", alignItems: "center", fontSize: 9
                }}>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--gry)", fontSize: 8 }}>{rec.sp}</span>
                  <span style={{
                    fontFamily: "var(--mono)", fontSize: 8,
                    color: rec.niv < 0 ? "#f0455a" : "#1de98b"
                  }}>{rec.niv > 0 ? "+" : ""}{f0(rec.niv)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    {rec.eventIcon && <span style={{ fontSize: 9 }}>{rec.eventIcon}</span>}
                    <span style={{ fontSize: 8, color: rec.yourAccepted ? "#1de98b" : "#f0455a77", fontWeight: rec.yourAccepted ? 600 : 400 }}>
                      {rec.yourAccepted ? `✓ ${f0(rec.yourMW)}MW @ £${f1(rec.clearingPrice)}` : "✗ Not dispatched"}
                    </span>
                  </div>
                  <div style={{
                    textAlign: "right", fontFamily: "var(--mono)", fontSize: 8,
                    color: rec.yourAccepted ? (rec.yourRevenue >= 0 ? "#1de98b" : "#f0455a") : "var(--fnt)"
                  }}>
                    {rec.yourAccepted ? (rec.yourRevenue >= 0 ? `+£${f0(rec.yourRevenue)}` : `-£${f0(Math.abs(rec.yourRevenue))}`) : "—"}
                  </div>
                </div>
              ))}
              {S.spHistory.length === 0 && (
                <div style={{ fontSize: 9, color: "var(--gry)", textAlign: "center", padding: "12px 0" }}>
                  Waiting for first clearing...
                </div>
              )}
            </Panel>
          </div>

          {/* ── FAR RIGHT (spans both rows) ── */}
          <div style={{ gridColumn: 4, gridRow: "1/3", display: "flex", flexDirection: "column", gap: 5, overflow: "hidden" }}>

            {/* Bid Lifecycle */}
            <Panel icon="🔄" title="Bid Lifecycle" accent="#b78bfa"
              subtitle="Follow your current bid from creation to payment">
              <div style={{
                padding: "5px 8px", marginBottom: 8, borderRadius: 4,
                background: "var(--bg2)", border: "1px solid var(--ln)"
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#f5b222" }}>
                  SELL £{f2(S.userBidPrice)} / {S.userBidVol}MW
                </div>
                <div style={{ fontSize: 9, color: "var(--gry)", marginTop: 1 }}>
                  SP {S.sp} · Rank #{yourRank} in the {S.userBidDir} stack · {yourWillClear ? "Expected to clear" : "Will NOT clear"}
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 10, top: 6, bottom: 6, width: 2, background: "var(--bg3)", borderRadius: 1 }} />
                <div style={{
                  position: "absolute", left: 10, top: 6, width: 2, borderRadius: 1,
                  background: "linear-gradient(180deg,#b78bfa,#1de98b)",
                  height: `${(S.lcStep / 5) * 100}%`, transition: "height .8s ease"
                }} />
                {STEPS.map((step, i) => {
                  const done = i < S.lcStep, active = i === S.lcStep;
                  const col = done ? "#1de98b" : active ? "#b78bfa" : "var(--dim)";
                  return (
                    <div key={i} style={{ display: "flex", gap: 7, marginBottom: 6, position: "relative" }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0, zIndex: 1,
                        border: `2px solid ${col}`, background: done ? "#1de98b18" : active ? "#b78bfa18" : "var(--bg0)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--mono)", fontSize: 7, fontWeight: 700, color: col,
                        boxShadow: active ? `0 0 12px ${col}` : "none",
                        animation: active ? "blink 1.4s ease-in-out infinite" : "none"
                      }}>
                        {done ? "✓" : i + 1}
                      </div>
                      <div style={{ paddingTop: 1 }}>
                        <div style={{
                          fontSize: 10, fontWeight: active || done ? 700 : 400,
                          color: active ? "var(--wht)" : done ? "var(--wht)" : "var(--dim)"
                        }}>{step}</div>
                        <div style={{ fontSize: 8, color: active ? "#b78bfa88" : "var(--fnt)", marginTop: 1 }}>{STEP_HINTS[i]}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Market Events */}
            <Panel icon="📡" title="Market Events" accent="#38c0fc"
              subtitle="Events causing price movements and dispatch changes" style={{ flex: 1 }}>
              {S.eventLog.length === 0 ? (
                <div style={{ fontSize: 9, color: "var(--gry)", textAlign: "center", padding: "20px 0" }}>
                  Waiting for market events...
                </div>
              ) : S.eventLog.map((ev, i) => (
                <div key={i} className={i === 0 ? "fadeUp" : ""} style={{
                  padding: "6px 8px", marginBottom: 5, borderRadius: 4,
                  background: "var(--bg2)", border: "1px solid var(--ln)",
                  borderLeft: `3px solid #f5b222`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--gry)" }}>SP{ev.sp} · {ev.time}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "#f5b222" }}>£{f2(ev.price)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--wht)" }}>{ev.text}</div>
                </div>
              ))}
            </Panel>


          </div>
        </div>

        {/* ══ BOTTOM STATUS ════════════════════════════════════════ */}
        <div style={{
          height: 22, background: "var(--bg1)", borderTop: "1px solid var(--ln)",
          display: "flex", alignItems: "center", padding: "0 12px", gap: 14,
          fontFamily: "var(--body)", fontSize: 9, color: "var(--gry)", flexShrink: 0
        }}>
          <span style={{ color: S.running ? "#1de98b" : "#f0455a", fontWeight: 600 }}>
            {S.running ? "● LIVE" : "● PAUSED"}
          </span>
          <span>Tick #{S.tick} · SP {S.sp}/48 · Speed {S.speed}×</span>
          <span>|</span>
          <span>Dispatched {S.dispatchedSPs || 0} SPs · Missed {S.missedSPs || 0} SPs</span>
          <span>|</span>
          <span>SOC {f1(S.soc)}% · Freq {S.freq.toFixed(3)} Hz</span>
          {S.activeEvent && (
            <span style={{ color: "#f5b222", fontWeight: 600 }}>⚠ {S.activeEvent.name} in progress</span>
          )}
          <span style={{ marginLeft: "auto", color: "var(--fnt)" }}>
            GRIDFORGE · GB Balancing Mechanism · Prices in £/MWh
          </span>
        </div>
      </div>
    </>
  );
}
