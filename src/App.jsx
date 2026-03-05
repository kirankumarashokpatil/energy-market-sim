import { useState, useEffect, useRef, useCallback, useMemo } from "react";

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
@keyframes alertPulse{0%,100%{border-color:#f0455a44}50%{border-color:#f0455a}}
@keyframes cashIn{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-20px);opacity:0}}
@keyframes pulseGlow{0%{box-shadow:inset 0 0 0 2px #b78bfa,inset 0 0 10px #b78bfa,inset 0 0 15px #b78bfa33}100%{box-shadow:inset 0 0 0 3px #b78bfa,inset 0 0 20px #b78bfa,inset 0 0 25px #b78bfa66}}
.blink{animation:blink 1.2s ease-in-out infinite}
.fadeUp{animation:fadeUp .4s ease both}
.slideLeft{animation:slideLeft .35s ease both}
.grn-glow{animation:grnGlow 2s ease-in-out infinite}
.red-glow{animation:redGlow 2s ease-in-out infinite}
.amb-glow{animation:ambGlow 2s ease-in-out infinite}
.shake{animation:shake .4s ease}
.price-explode{animation:priceExplode .6s ease}
.alert-pulse{animation:alertPulse 1s ease-in-out infinite}
.teaching-active .teaching-blur { filter: blur(4px); opacity: 0.5; pointer-events: none; transition: all 0.3s ease; }
.teaching-active .teaching-focus-active { z-index: 100; position: relative; }
`;

/* ════════════════════════════════════════════════════════
   MILP CONSTRAINTS & DFR MATHEMATICS (Casella et al. 2024)
════════════════════════════════════════════════════════ */

const DFR_SPECS = {
  DC: { deadband: 0.015, kneePoint: 0.2, fullDelivery: 0.5, deliveryDuration: 0.25 }, // Dynamic Containment: 15min delivery
  DM: { deadband: 0.015, kneePoint: null, fullDelivery: 0.4, deliveryDuration: 0.5 },  // Dynamic Moderation: 30min delivery
  DR: { deadband: 0.015, kneePoint: null, fullDelivery: 0.2, deliveryDuration: 1.0 }   // Dynamic Regulation: 60min delivery
};

const EFA_BLOCKS = [
  { block: 1, startSP: 47, endSP: 6 },  // 23:00-03:00
  { block: 2, startSP: 7, endSP: 14 },  // 03:00-07:00
  { block: 3, startSP: 15, endSP: 22 },  // 07:00-11:00
  { block: 4, startSP: 23, endSP: 30 },  // 11:00-15:00
  { block: 5, startSP: 31, endSP: 38 },  // 15:00-19:00
  { block: 6, startSP: 39, endSP: 46 },  // 19:00-23:00
];

function getEFABlock(sp) {
  // Wrap around for Block 1 (sp 47, 48, 1, 2, 3, 4, 5, 6)
  if (sp >= 47 || sp <= 6) return EFA_BLOCKS[0];
  return EFA_BLOCKS.find(b => sp >= b.startSP && sp <= b.endSP);
}

function dfr_response(frequency, service, contractedMW) {
  if (!contractedMW || contractedMW <= 0) return 0;
  const spec = DFR_SPECS[service];
  const deviation = Math.abs(frequency - 50.0);

  if (deviation <= spec.deadband) return 0; // dead band — no response
  if (deviation >= spec.fullDelivery) return contractedMW; // full delivery

  // Linear interpolation between knee point and full delivery (per equation 3.49)
  if (spec.kneePoint !== null && deviation >= spec.kneePoint) {
    const range = spec.fullDelivery - spec.kneePoint;
    const alpha = (deviation - spec.kneePoint) / range;
    return (alpha * 0.95 * contractedMW) + (0.05 * contractedMW); // reaches 100% at full delivery
  }

  // Between dead band and knee: 0% to 5%
  const upperLimit = spec.kneePoint !== null ? spec.kneePoint : spec.fullDelivery;
  const range = upperLimit - spec.deadband;
  // If no kneepoint (DR), it scales from 0 to 100% across the whole range instead of 0-5%
  const maxDeliveryHere = spec.kneePoint !== null ? 0.05 : 1.0;
  return maxDeliveryHere * contractedMW * (deviation - spec.deadband) / range;
}

function getUsableSoCBounds(maxMWh, minSoC, maxSoC, dfrContracts) {
  // W^up: energy reserved for low-freq (D*-up). BESS must be able to DISCHARGE this volume.
  // W^dw: energy reserved for high-freq (D*-down). BESS must be able to CHARGE this volume.
  let wUp_MWh = 0;
  let wDwn_MWh = 0;

  if (dfrContracts) {
    if (dfrContracts.DC_UP) wUp_MWh += dfrContracts.DC_UP * DFR_SPECS.DC.deliveryDuration;
    if (dfrContracts.DM_UP) wUp_MWh += dfrContracts.DM_UP * DFR_SPECS.DM.deliveryDuration;
    if (dfrContracts.DR_UP) wUp_MWh += dfrContracts.DR_UP * DFR_SPECS.DR.deliveryDuration;
    if (dfrContracts.DFS_UP) wUp_MWh += 0; // DFS does not block capacity

    if (dfrContracts.DC_DOWN) wDwn_MWh += dfrContracts.DC_DOWN * DFR_SPECS.DC.deliveryDuration;
    if (dfrContracts.DM_DOWN) wDwn_MWh += dfrContracts.DM_DOWN * DFR_SPECS.DM.deliveryDuration;
    if (dfrContracts.DR_DOWN) wDwn_MWh += dfrContracts.DR_DOWN * DFR_SPECS.DR.deliveryDuration;
    if (dfrContracts.DFS_DOWN) wDwn_MWh += 0; // DFS does not block capacity
  }

  const absMinMWh = maxMWh * (minSoC / 100);
  const absMaxMWh = maxMWh * (maxSoC / 100);

  // W^up pushes the FLOOR up. W^dw pushes the CEILING down.
  const effectiveMin_MWh = absMinMWh + wUp_MWh;
  const effectiveMax_MWh = absMaxMWh - wDwn_MWh;

  return {
    effectiveMin_MWh,
    effectiveMax_MWh,
    effectiveMin_pct: (effectiveMin_MWh / maxMWh) * 100,
    effectiveMax_pct: (effectiveMax_MWh / maxMWh) * 100,
    tradeable_MWh: effectiveMax_MWh - effectiveMin_MWh,
    wUp_MWh,
    wDwn_MWh
  };
}

function runDayAheadMILP(maxMWh, maxMW) {
  // Simulate Day-Ahead MILP optimization for 6 EFA blocks (Casella et al., 2024 eq 3.7-3.12)
  const commitments = {};
  for (let i = 1; i <= 6; i++) {
    const hasUp = Math.random() < 0.6;
    const hasDown = Math.random() < 0.6;

    const upService = Math.random() < 0.25 ? 'DC_UP' : Math.random() < 0.33 ? 'DM_UP' : Math.random() < 0.5 ? 'DR_UP' : 'DFS_UP';
    const downService = Math.random() < 0.25 ? 'DC_DOWN' : Math.random() < 0.33 ? 'DM_DOWN' : Math.random() < 0.5 ? 'DR_DOWN' : 'DFS_DOWN';

    const upMW = hasUp ? Math.round(maxMW * (0.1 + Math.random() * 0.3)) : 0;
    const downMW = hasDown ? Math.round(maxMW * (0.1 + Math.random() * 0.3)) : 0;

    commitments[i] = {
      DC_UP: upService === 'DC_UP' ? upMW : 0,
      DM_UP: upService === 'DM_UP' ? upMW : 0,
      DR_UP: upService === 'DR_UP' ? upMW : 0,
      DFS_UP: upService === 'DFS_UP' ? upMW : 0,
      DC_DOWN: downService === 'DC_DOWN' ? downMW : 0,
      DM_DOWN: downService === 'DM_DOWN' ? downMW : 0,
      DR_DOWN: downService === 'DR_DOWN' ? downMW : 0,
      DFS_DOWN: downService === 'DFS_DOWN' ? downMW : 0,
    };
  }
  return commitments;
}

function validateDFRStack(dfrContracts) {
  // Rules from paper equations 3.7-3.12: Mutual exclusivity of DFR services
  if (!dfrContracts) return { valid: true, violations: [] };
  const { DC_UP, DM_UP, DR_UP, DC_DOWN, DM_DOWN, DR_DOWN } = dfrContracts;
  const violations = [];

  // Rule 3.7: Only one up-frequency service
  if ((DC_UP > 0) + (DM_UP > 0) + (DR_UP > 0) > 1)
    violations.push("Cannot stack DC-up, DM-up, DR-up simultaneously");

  // Rule 3.8: Only one down-frequency service  
  if ((DC_DOWN > 0) + (DM_DOWN > 0) + (DR_DOWN > 0) > 1)
    violations.push("Cannot stack DC-down, DM-down, DR-down simultaneously");

  // Rules 3.9-3.12: No cross-service stacking of mixed direction (e.g. DC-up with DM-down)
  if (DC_UP > 0 && (DM_DOWN > 0 || DR_DOWN > 0)) violations.push("DC-up cannot stack with DM-down or DR-down");
  if (DM_UP > 0 && (DC_DOWN > 0 || DR_DOWN > 0)) violations.push("DM-up cannot stack with DC-down or DR-down");
  if (DR_UP > 0 && (DC_DOWN > 0 || DM_DOWN > 0)) violations.push("DR-up cannot stack with DC-down or DM-down");

  return { valid: violations.length === 0, violations };
}

/* ════════════════════════════════════════════════════════
   COMPONENTS
════════════════════════════════════════════════════════ */

function MeritOrderChart({ supply, demand, sbp, qClear }) {
  if (!supply?.length || !demand?.length) return null;
  const W = 600;
  const H = 140;

  // sort supply ascending price
  const sCurve = supply.slice().sort((a, b) => a.price - b.price).filter(s => !s.constrained);
  // sort demand descending price
  const dCurve = demand.slice().sort((a, b) => b.price - a.price);

  let maxMW = 50;
  let sTotal = 0; sCurve.forEach(s => maxMW = Math.max(maxMW, sTotal += s.mw));
  let dTotal = 0; dCurve.forEach(d => maxMW = Math.max(maxMW, dTotal += d.mw));
  maxMW = maxMW * 1.05; // 5% padding

  const allPrices = [...sCurve.map(s => s.price), ...dCurve.map(d => d.price), sbp];
  const maxP = Math.max(...allPrices, 200) * 1.05;
  const minP = Math.max(Math.min(...allPrices, 0) - 20, -50);
  const pRange = Math.max(maxP - minP, 1);

  const scaleX = x => (x / maxMW) * W;
  const scaleY = y => H - ((y - minP) / pRange) * H;

  // Build Supply Path (Stepped)
  let sPath = `M 0,${scaleY(sCurve[0]?.price || 0)}`;
  let curX = 0;
  sCurve.forEach(s => {
    sPath += ` L ${scaleX(curX)},${scaleY(s.price)}`;
    curX += s.mw;
    sPath += ` L ${scaleX(curX)},${scaleY(s.price)}`;
  });
  const sArea = `${sPath} L ${scaleX(curX)},${H} L 0,${H} Z`;

  // Build Demand Path (Stepped)
  let dPath = `M 0,${scaleY(dCurve[0]?.price || 0)}`;
  let curDX = 0;
  dCurve.forEach(d => {
    dPath += ` L ${scaleX(curDX)},${scaleY(d.price)}`;
    curDX += d.mw;
    dPath += ` L ${scaleX(curDX)},${scaleY(d.price)}`;
  });
  const dArea = `${dPath} L ${scaleX(curDX)},${H} L 0,${H} Z`; // Fill down to bottom bounds

  // Create Price Grid
  const gridLines = [];
  for (let p = Math.ceil(minP / 50) * 50; p <= maxP; p += 50) {
    gridLines.push(p);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "var(--bg0)", borderRadius: 4, outline: "1px solid var(--ln)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
        <defs>
          <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38c0fc" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#38c0fc" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="sGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#f5b222" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#f5b222" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* Horizontal Grid Lines */}
        {gridLines.map(p => (
          <line key={p} x1={0} y1={scaleY(p)} x2={W} y2={scaleY(p)} stroke="var(--ln)" strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke" />
        ))}

        {/* Zero Line */}
        {minP < 0 && <line x1={0} y1={scaleY(0)} x2={W} y2={scaleY(0)} stroke="var(--ln)" strokeWidth={2} opacity={0.8} vectorEffect="non-scaling-stroke" />}

        {/* Demand */}
        <path d={dArea} fill="url(#dGrad)" />
        <path d={dPath} fill="none" stroke="#38c0fc" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {/* Supply */}
        <path d={sArea} fill="url(#sGrad)" />
        <path d={sPath} fill="none" stroke="#f5b222" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {/* Spot Intercept Crosshairs */}
        {qClear !== undefined && qClear > 0 && (
          <>
            <line x1={0} y1={scaleY(sbp)} x2={W} y2={scaleY(sbp)} stroke="var(--wht)" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} vectorEffect="non-scaling-stroke" />
            <line x1={scaleX(qClear)} y1={scaleY(sbp)} x2={scaleX(qClear)} y2={H} stroke="var(--wht)" strokeWidth={1} strokeDasharray="4 4" opacity={0.3} vectorEffect="non-scaling-stroke" />
            <circle cx={scaleX(qClear)} cy={scaleY(sbp)} r={3} fill="var(--wht)" stroke="var(--bg0)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {/* Price Grid Labels */}
      {gridLines.map(p => (
        <div key={p} style={{ position: "absolute", top: scaleY(p) - 10, left: 4, fontSize: 8, color: "var(--gry)", fontFamily: "var(--mono)" }}>£{p}</div>
      ))}

      {/* Labels */}
      <div style={{ position: "absolute", top: 4, left: 32, fontSize: 10, color: "#38c0fc", fontFamily: "var(--body)", fontWeight: 800, textShadow: "0 0 5px var(--bg0)" }}>DEMAND</div>
      <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 10, color: "#f5b222", fontFamily: "var(--body)", fontWeight: 800, textShadow: "0 0 5px var(--bg0)" }}>SUPPLY</div>

      {qClear !== undefined && qClear > 0 && (
        <div style={{ position: "absolute", top: Math.max(4, scaleY(sbp) - 20), left: Math.min(W - 80, scaleX(qClear) + 8), fontSize: 11, color: "var(--wht)", fontFamily: "var(--mono)", fontWeight: 700, background: "var(--bg0)", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--ln)" }}>
          £{sbp.toFixed(1)} <span style={{ color: "var(--gry)", fontSize: 9 }}>@</span> {qClear.toFixed(0)}MW
        </div>
      )}
    </div>
  );
}

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
  { id: "THAN_WF", name: "Thanet Wind Farm", type: "WIND", baseMW: 220, baseCost: 38, costRange: 12, color: "#38c0fc", rampRate: 500 },
  { id: "HINK_B", name: "Hinkley B Nuclear", type: "NUCLEAR", baseMW: 450, baseCost: 56, costRange: 4, color: "#b78bfa", rampRate: 30 },
  { id: "WLNY_WF", name: "Walney Extension WF", type: "WIND", baseMW: 160, baseCost: 42, costRange: 14, color: "#38c0fc", rampRate: 500 },
  { id: "SOLAR_PK", name: "Shotwick Solar Farm", type: "SOLAR", baseMW: 350, baseCost: 5, costRange: 5, color: "#f5b222", rampRate: 350 },
  { id: "PILL_B", name: "Pillswood BESS", type: "BESS", baseMW: 196, baseCost: 88, costRange: 12, color: "#f5b222", rampRate: 500 },
  { id: "DRAX_1", name: "Drax Biomass Unit 1", type: "BIOMASS", baseMW: 500, baseCost: 108, costRange: 8, color: "#1de98b", rampRate: 60 },
  { id: "GRAN_G1", name: "Grain CCGT", type: "CCGT", baseMW: 400, baseCost: 118, costRange: 10, color: "#fb923c", rampRate: 80 },
  { id: "PEMB_GT", name: "Pembroke Gas Turbine", type: "OCGT", baseMW: 228, baseCost: 145, costRange: 20, color: "#f0455a", rampRate: 150 },
  { id: "IFA2", name: "IFA2 Interconnector", type: "INTERCONN", baseMW: 500, baseCost: 152, costRange: 30, color: "#c084fc", rampRate: 500 },
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
  { id: "CONSTRAINT", name: "Grid Constraint", icon: "🚧", desc: "B6 Scottish boundary congested — cheap wind skipped out of merit", nivDelta: 0, priceDelta: +40, prob: .05 },
];

// Core clearing 1: Planned Spot Market (Ahead of time, ignores real-time frequency/NIV)
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
    if (sNode.constrained) {
      sIndex++;
      continue;
    }
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
    // Constrained units cannot be accepted
    accepted: !u.constrained && (pClear >= u.price),
    dispatchedMW: (!u.constrained && pClear >= u.price) ? u.mw : 0
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

// GB Official Scarcity Pricing calculation
function calculateImbalancePrice(balancingPrice, lolp, voll = 6000, sspSpread = 0.05) {
  // System Buy Price (what shorts pay)
  const sbp = balancingPrice + (lolp * (voll - balancingPrice));
  // System Sell Price (what longs receive) — always lower, creating spread
  const ssp = balancingPrice * (1 - sspSpread);
  return { sbp, ssp };
}

// Core clearing 2: Real-time Balancing Mechanism (Driven by physical NIV)
function clearBalancingMechanism(spotSupply, spotDemand, niv) {
  let balancingPrice = 50; // default baseline
  let lolp = 0; // Loss of Load Probability (0-1)

  // Clone to avoid mutating spot clearing state until we mean to
  // Crucially: we must preserve the 'accepted' and 'dispatchedMW' flags from the spot market
  const bmSupply = spotSupply.map(s => ({ ...s }));
  const bmDemand = spotDemand.map(d => ({ ...d }));

  let absoluteImbalance = Math.abs(niv);

  if (niv < 0) {
    // SYSTEM SHORT: Need to buy more generation.
    // ESO walks up the undispatched supply curve (cheapest available first)
    // Constrained units physically cannot be dispatched
    const availableGen = bmSupply.filter(s => !s.accepted && !s.constrained).sort((a, b) => a.price - b.price);

    for (const unit of availableGen) {
      if (absoluteImbalance <= 0) break;

      const mwAvailable = unit.mw;
      const mwTaken = Math.min(mwAvailable, absoluteImbalance);

      unit.accepted = true;
      unit.dispatchedMW = mwTaken;
      unit.isBalancingAction = true; // Mark as BOA
      balancingPrice = unit.price; // Marginal accepted unit sets price

      absoluteImbalance -= mwTaken;
    }

    // Layer 3 & 4: GB Official Scarcity Pricing anchored to VoLL
    // If ESO exhausts the stack and is STILL short, price spikes hard
    // lolp = expected_energy_unserved / peak_demand
    let unservedMW = absoluteImbalance;
    if (unservedMW > 0) {
      lolp = Math.min(1.0, Math.pow(unservedMW / 1500, 2)); // 1500MW shortfall approaches 100% LOLP
    } else if (niv < -300) {
      // Even if we met demand, a deep negative NIV causes some LOLP baseline scarcity
      lolp = Math.min(1.0, Math.pow(Math.abs(niv + 300) / 1000, 2));
    }

  } else if (niv > 0) {
    // SYSTEM LONG: Need to absorb generation (increase demand or curtail generation)
    // For simplicity, ESO pays consumers to turn up (walking down their bids)
    const availableDemand = bmDemand.filter(d => !d.accepted).sort((a, b) => b.price - a.price);

    for (const unit of availableDemand) {
      if (absoluteImbalance <= 0) break;

      const mwAvailable = unit.mw;
      const mwTaken = Math.min(mwAvailable, absoluteImbalance);

      unit.accepted = true;
      unit.dispatchedMW = mwTaken;
      unit.isBalancingAction = true;
      balancingPrice = unit.price;

      absoluteImbalance -= mwTaken;
    }

    // If still long after exhausting willing consumers, price drops to 0 or negative
    if (absoluteImbalance > 0) {
      balancingPrice = -50;
    }
  }

  return { supply: bmSupply, demand: bmDemand, balancingPrice, lolp };
}

// Build full supply and demand curves for the market
function buildMarketCurves(userBidPrice, userBidVol, userBidDir, eventFactor = 1, event = null, genMult = 1.0, conMult = 1.0, prevClearing = null, freq = 50.0, b6Congested = false, sp = 28) {
  const tod = sp / 48; // Time of day factor (0 to 1)

  // Real-life variance factors based on Time of Day
  // Solar: Peaks around SP 24 (midday), zero at night (SP < 12 or SP > 36)
  const solarFactor = sp >= 12 && sp <= 36 ? Math.sin(((sp - 12) / 24) * Math.PI) : 0;
  // Wind: Slow sine wave to simulate passing weather fronts, plus diurnal evening bump
  const windFactor = 0.5 + 0.5 * Math.sin(tod * 2 * Math.PI) + (sp >= 30 && sp <= 42 ? 0.2 : 0);
  // Evening Peak: Massive ramp-up between SP 32 to 42 (16:00 - 21:00)
  const eveningPeakFactor = sp >= 32 && sp <= 42 ? 2.0 : 1.0;
  // Morning Peak: SP 14 to 20 (07:00 - 10:00)
  const morningPeakFactor = sp >= 14 && sp <= 20 ? 1.5 : 1.0;

  // 1. Supply Curve (Generators — frequency-responsive multi-agent dynamics)
  let supply = FLEET.map(f => {
    let rawMW = clamp(f.baseMW + R(0, 30), 10, f.baseMW * 1.5);
    let price = clamp(R(f.baseCost, f.costRange) * eventFactor, 20, 300);

    // Apply Real-Life Time Factors
    if (f.type === "WIND") rawMW *= windFactor;
    if (f.type === "SOLAR") {
      rawMW *= solarFactor;
      price = clamp(price - 20, -10, 20); // Very cheap when running
    }
    // Gas/CCGT mark up prices during evening peak due to scarcity
    if ((f.type === "CCGT" || f.type === "OCGT") && eveningPeakFactor > 1.0) {
      price *= (1 + (eveningPeakFactor - 1) * 0.5);
    }

    // Ramp Rate Logic: limit up-ramp based on previous dispatch
    if (prevClearing && prevClearing.supply) {
      const prev = prevClearing.supply.find(p => p.id === f.id);
      if (prev) {
        rawMW = Math.min(rawMW, prev.dispatchedMW + f.rampRate);
      }
    }
    let mw = rawMW;

    let constrained = false;

    if (event) {
      const eid = event.id;
      if (f.type === "WIND" && (eid === "WIND_DROP" || eid === "DUNKEL")) mw = clamp(f.baseMW * (eid === "DUNKEL" ? 0.05 : 0.2) + R(0, 10), 5, f.baseMW * 0.3);
      if (f.type === "WIND" && eid === "WIND_SURGE") { mw = clamp(f.baseMW * 1.4 + R(0, 20), f.baseMW, f.baseMW * 1.5); price = clamp(price * 0.6, 10, 60); }
      if (f.type === "INTERCONN" && (eid === "CABLE_FIRE" || eid === "DUNKEL")) mw = clamp(f.baseMW * 0.1, 5, 50);
      if (f.type === "NUCLEAR" && eid === "CASCADE") mw = clamp(f.baseMW * 0.3, 20, 200);
      if ((f.type === "CCGT" || f.type === "OCGT") && (eid === "DUNKEL" || eid === "CASCADE" || eid === "COLD_SNAP")) price = clamp(price * 1.4, 80, 300);
      if (eid === "CONSTRAINT" && f.type === "WIND") constrained = true;
    }
    // Apply the macro-agent pricing strategy (markup/withholding)
    price = clamp(price * genMult, 1, 999);

    // Multi-agent frequency-responsive behaviour
    // Wind farms: curtail output when grid is oversupplied (freq > 50.1)
    if (f.type === "WIND" && freq > 50.1) {
      const curtailFactor = clamp(1 - ((freq - 50.1) / 0.3), 0.1, 1.0);
      mw = Math.round(mw * curtailFactor);
    }
    // Nuclear: very slow ramp, essentially baseload — but reduces output during severe oversupply
    if (f.type === "NUCLEAR" && freq > 50.2) {
      mw = Math.round(mw * 0.85);
    }
    // DSO Constraint: B6 Scottish boundary — Scottish wind is constrained off
    if (b6Congested && f.type === "WIND" && (f.id === "THAN_WF" || f.id === "WLNY_WF")) {
      constrained = true;
    }

    return { ...f, price, mw, constrained };
  });

  // 2. Demand Curve (Consumers)
  let demand = CONSUMERS.map(c => {
    let mw = clamp(c.baseMW + R(0, 40), 50, c.baseMW * 1.5);
    let price = clamp(R(c.basePrice, c.priceRange), 20, 500);

    // Apply Real-Life Time Factors to Consumers
    if (c.type === "HEAT") {
      mw *= Math.max(morningPeakFactor, eveningPeakFactor);
      if (eveningPeakFactor > 1.0) price *= 1.2; // Willing to pay more when cold
    }
    if (c.type === "EV") {
      // EV massive charging overnight (SP 1-12 or 44-48)
      if (sp < 12 || sp > 44) mw *= 2.0;
      else mw *= 0.3; // Very little charging daytime
      // Smart charging: lower willingness to pay if daytime
      if (sp >= 12 && sp <= 44) price *= 0.5;
    }

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

  if (short) {
    msg += `Demand has exceeded generation by ${f0(Math.abs(niv))}MW. Frequency dropping... The system is SHORT. `;
  } else if (niv > 0) {
    msg += `Generation has exceeded demand by ${f0(niv)}MW. Frequency rising... The system is LONG. `;
  } else {
    msg += `System is perfectly balanced. `;
  }

  msg += `ESO balancing cleared at £${f2(clearing.clearingPrice)}/MWh. `;

  if (yourResult.accepted) {
    if (yourResult.dir === "SELL") {
      msg += `✓ Battery is DISCHARGING to stabilise frequency. Selling ${f0(yourResult.dispatchedMW)}MW @ £${f2(yourResult.settledPrice)}/MWh.`;
    } else {
      msg += `✓ Battery is CHARGING to absorb excess power. Buying ${f0(yourResult.dispatchedMW)}MW @ £${f2(yourResult.settledPrice)}/MWh.`;
    }
  } else {
    const isSell = yourResult.dir === "SELL";
    const reason = yourResult.priceRejected
      ? (isSell
        ? `Your offer (£${f2(yourResult.yourPrice)}) was above the marginal clearing price (£${f2(clearing.clearingPrice)}). Cheaper resources were dispatched first.`
        : `Your bid (£${f2(yourResult.yourPrice)}) was below clearing (£${f2(clearing.clearingPrice)}).`)
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
/* ════════════════════════════════════════════════════════
   CONFIGURABLE GRID CONSTANTS (GB-calibrated defaults)
════════════════════════════════════════════════════════ */
const GRID_CONFIG = {
  // Physics
  inertiaConstant: 4.5,        // GW·s typical GB system inertia
  systemSizeGW: 35.0,          // GW total system demand baseline
  lomThreshold: 0.125,         // Hz/s — Loss of Mains protection trigger

  // Response tiers
  dcTriggerHz: 49.8,           // Hz — DC droop activation frequency
  dcDroopRange: 0.4,           // Hz — full dispatch at (50 - dcDroopRange)
  ffrTriggerHz: 49.7,          // Hz — FFR activation frequency
  ffrRampRate: 0.15,           // fraction per tick (0-1)

  // Ancillary service rates (£/MW/hr)
  dcRate: 15,                  // DC availability payment
  dmRate: 10,                  // DM availability payment
  drRate: 8,                   // DR availability payment
  dfsRate: 5,                  // DFS static service payment
  ffrRate: 8,                  // Legacy

  // Settlement
  voll: 6000,                  // £/MWh Value of Lost Load (Ofgem regulated)
  sspSpread: 0.05,             // SBP-SSP spread (5% simplified)
  bsuosRate: 12,               // £/MWh BSUoS levy on dispatched volume
  cmRatePerSP: 3.60,           // £/MW per half-hour (≈ £63/kW/yr)
  cmSocThreshold: 25,          // % SoC below which CM payment is de-rated

  // BESS economics
  degradationCost: 8,          // £/MWh (realistic LFP: £5-12; NMC: £10-20)
  roundTripEfficiency: 0.87,   // 87% round-trip efficiency

  // Interconnectors
  interconnectorMaxMW: 7000,   // GB total interconnector capacity (~7 GW)
  interconnectorSensitivity: 0.3, // fraction of NIV that interconnectors respond to

  // Wind/nuclear frequency response
  windCurtailFreq: 50.1,       // Hz — wind starts curtailing above this
  windCurtailRange: 0.3,       // Hz range for full curtailment
  nuclearReduceFreq: 50.2,     // Hz — nuclear reduces output
  nuclearReduceFactor: 0.85,   // fraction of output when reducing

  // Scarcity
  lolpShortfallMW: 1500,       // MW shortfall that approaches 100% LOLP
  deepNIVThreshold: -300,      // MW — baseline scarcity trigger even when stack covers
};

function initState() {
  const userBidPrice = 82;
  const userBidVol = 50;
  const userBidDir = "SELL";
  const startSP = 28;
  const startNIV = -95;
  const curves = buildMarketCurves(userBidPrice, userBidVol, userBidDir, 1, null, 1.0, 1.0, null, 50.0, false, startSP);
  const clearing = clearMarketUniform(curves.supply, curves.demand);

  const initialDfr = runDayAheadMILP(200, 50);
  const startBlock = getEFABlock(startSP).block;
  const initialActive = initialDfr[startBlock];
  const initialBounds = getUsableSoCBounds(200, 5, 95, initialActive);

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
    lolp: 0,
    rocof: 0,
    dcDispatched: 0,

    // prices
    spotPrice: 110.80,
    sbp: 112.50,
    ssp: 108.20,
    priceHist: Array.from({ length: 40 }, (_, i) => ({ t: i, volume: 1000 + Math.random() * 500, open: 108 + Math.random() * 8, close: 108 + Math.random() * 8, high: 0, low: 0 })).map(c => ({ ...c, high: Math.max(c.open, c.close) + Math.random() * 3, low: Math.min(c.open, c.close) - Math.random() * 3 })),

    // user bid
    userBidPrice,
    userBidVol,
    userBidDir: "SELL", // SELL = offer power, BUY = take power (charge)

    // battery
    soc: 62,
    maxMW: 50,
    maxMWh: 200,
    cycleCount: 0,
    batteryHealth: 100,
    dfrCommitments: initialDfr,
    activeDfr: initialActive,
    wUpCalc: initialBounds.wUp_MWh,
    wDwnCalc: 0,
    interconnectorFlow: 0, // +ve = importing, -ve = exporting
    intradayPosition: 0, // Net MWh accumulated through the day (+ = net seller, - = net buyer)
    b6Congested: false, // DSO B6 boundary constraint active

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

    // Gate Closure & FPN
    gateClosed: false,
    fpn: null, // Final Physical Notification (locked bid at gate closure)
    gateClosureSP: 0, // SP at which gate closed

    // Intraday Trading
    intradayPrice: 50,
    intradaySpread: 2,
    intradayVolumeAcquired: 0,
    intradayCashflow: 0,

    // P&L
    totalPnl: 0,
    sessionRevenue: 0,
    sessionCost: 0,
    dcRevenueTotal: 0,
    dmRevenueTotal: 0,
    drRevenueTotal: 0,
    dfsRevenueTotal: 0,
    ffrRevenueTotal: 0, // Legacy
    bsuosTotal: 0,
    cmRevenueTotal: 0,
    imbalanceCostTotal: 0,
    dispatchedSPs: 0,
    missedSPs: 0,

    // Marginal Costs
    marginalCost: GRID_CONFIG.degradationCost, // £/MWh (battery cycle degradation)

    // Configurable Grid Parameters (live-adjustable)
    config: { ...GRID_CONFIG },

    // animated dispatch
    dispatchFlash: false,

    // enhanced features
    extremeEvent: false,
    teachingMode: false,
    teachingStep: 0,
    // RL Agent Mode (BESS)
    rlEnabled: true,
    showPriceChart: true,
    showMeritChart: true,

    // RL hyperparams AI mode
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

// Discretize rich physical state for Q-table
const getRLState = (params) => {
  const {
    freq, rocof, soc, spotPrice, lolp,
    intradayPrice, timeToGate,
    forecastVector, shadowPrice,
    effectiveMin_pct, effectiveMax_pct, dfrActive
  } = params;

  // Existing bands
  const rocofBand = rocof < -0.08 ? "RC_CRIT" : rocof < -0.03 ? "RC_WARN" : rocof > 0.03 ? "RC_HIGH" : "RC_OK";
  const valueBand = spotPrice > 200 ? "VH" : spotPrice > 100 ? "H" : spotPrice > 60 ? "M" : "L";

  // NEW: SOC position relative to strictly enforced MILP bands
  const socMarginFloor = soc - (effectiveMin_pct || 5);
  const socMarginCeil = (effectiveMax_pct || 95) - soc;
  const sState = socMarginFloor < 5 ? "CRIT_FL" : socMarginCeil < 5 ? "CRIT_CL" : soc > 75 ? "HI" : soc > 40 ? "MID" : soc > 15 ? "LO" : "CRIT";

  const riskBand = lolp > 0.05 ? "LOLP_HI" : lolp > 0.01 ? "LOLP_MED" : "LOLP_LO";
  const fState = freq < 49.7 ? "F_CRIT" : freq < 49.85 ? "F_LOW" : freq > 50.2 ? "F_HIGH" : "F_OK";

  // Intraday context
  const premium = intradayPrice > 0 ? Math.round((spotPrice - intradayPrice) / intradayPrice * 10) : 0;
  const intradayPrem = `ID${Math.max(-3, Math.min(3, premium))}`;
  const urgency = timeToGate < 120 ? "URG_HI" : timeToGate < 300 ? "URG_MED" : "URG_LO";

  // NEW: Multi-horizon forecast signals
  const shape = forecastVector.opportunityShape;
  const peakMag = forecastVector.peakPrice > spotPrice * 1.5 ? "PM_XL"
    : forecastVector.peakPrice > spotPrice * 1.2 ? "PM_LG"
      : forecastVector.peakPrice > spotPrice * 1.05 ? "PM_SM"
        : "PM_FLAT";
  const peakTiming = forecastVector.peakDelta <= 2 ? "PT_NOW"
    : forecastVector.peakDelta <= 4 ? "PT_NEAR"
      : forecastVector.peakDelta <= 8 ? "PT_MID"
        : "PT_FAR";
  const shadowBand = shadowPrice.recommendation;

  const dfrState = dfrActive ? "DFR_ON" : "DFR_OFF";

  // Full state string — 11 dimensions
  return `[${rocofBand}_${valueBand}_${sState}_${riskBand}_${fState}_${dfrState}_${intradayPrem}_${urgency}_${shape}_${peakTiming}_${shadowBand}]`;
};
// ── Multi-Horizon Deterministic Forecast ──
function getBaseDemand(sp) {
  // Simple deterministic diurnal shape (morning peak, evening peak, night trough)
  const baseAvg = 1400; // approx sum of CONSUMERS
  const tod = sp / 48;
  const diurnal = 0.25 * Math.sin((tod - 0.25) * 2 * Math.PI) - 0.2 * Math.sin((tod - 0.75) * 4 * Math.PI);
  return baseAvg * (1 + diurnal);
}

function getBaseWind(sp) {
  // Slower, lazier cycle for deterministic wind forecasting
  const baseAvg = 380; // approx sum of WIND fleet
  const cycle = 0.2 * Math.sin((sp / 48) * 2 * Math.PI);
  return baseAvg * (1 + cycle);
}

function deriveBasePrice(baseNIV, currentPrice) {
  // Inverse relationship: short (-ve NIV) = high price
  const targetPrice = 60 + (baseNIV < 0 ? Math.pow(Math.abs(baseNIV) / 8, 1.3) : baseNIV * -0.05);
  return clamp(targetPrice, 20, 800);
}

function classifyShape(horizons) {
  const prices = horizons.map(h => h.forecastedPrice);
  const current = prices[0];
  const maxAhead = Math.max(...prices);
  const minAhead = Math.min(...prices);

  const upside = (maxAhead - current) / current;
  const downside = (current - minAhead) / current;

  if (upside > 0.4 && horizons.find(h => h.forecastedPrice === maxAhead).delta <= 4)
    return "SPIKE_CLOSE";       // big spike, nearby — hold
  if (upside > 0.4 && horizons.find(h => h.forecastedPrice === maxAhead).delta > 4)
    return "SPIKE_FAR";         // big spike, distant — might discharge now, recharge later
  if (downside > 0.3)
    return "CRATER_AHEAD";      // price dropping — sell now
  if (upside > 0.15 && downside < 0.1)
    return "RISING";            // gradual rise — hold
  if (upside < 0.05 && downside < 0.05)
    return "FLAT";              // no signal
  return "VOLATILE";            // mixed signals — stay liquid
}

function computeForecastVector(currentSP, state) {
  const HORIZONS = [1, 4, 8, 16]; // SPs ahead to look
  const UNCERTAINTY_DECAY = [0.95, 0.80, 0.62, 0.40]; // confidence at each horizon

  const horizons = HORIZONS.map((delta, i) => {
    const futureSP = (currentSP + delta - 1) % 48 + 1;

    // Base deterministic forecast — ONLY use base curves, not events
    const baseDemand = getBaseDemand(futureSP);
    const baseWind = getBaseWind(futureSP);
    const baseGeneration = 2078; // static sum of non-wind FLEET capacity
    const baseNIV = baseGeneration + baseWind - baseDemand; // +ve if long, -ve if short
    const basePrice = deriveBasePrice(baseNIV, state.spotPrice);

    // Confidence-weighted deviation from current
    const confidence = UNCERTAINTY_DECAY[i];
    const priceDelta = (basePrice - state.spotPrice) * confidence;
    const forecastedPrice = state.spotPrice + priceDelta;

    return {
      delta,          // how many SPs ahead
      forecastedNIV: baseNIV * confidence + state.niv * (1 - confidence),
      forecastedPrice,
      confidence,     // agent should weight this signal by confidence
      timeOfDay: futureSP,
    };
  });

  // Identify the peak and trough within lookahead window
  const peakHorizon = horizons.reduce((a, b) => b.forecastedPrice > a.forecastedPrice ? b : a);
  const troughHorizon = horizons.reduce((a, b) => b.forecastedPrice < a.forecastedPrice ? b : a);

  return {
    horizons,                // full vector for shadow price calculation
    peakDelta: peakHorizon.delta,       // SPs until the best sell window
    peakPrice: peakHorizon.forecastedPrice,
    peakConfidence: peakHorizon.confidence,
    troughDelta: troughHorizon.delta,     // SPs until the best charge window
    troughPrice: troughHorizon.forecastedPrice,
    troughConfidence: troughHorizon.confidence,
    opportunityShape: classifyShape(horizons), // for state string
  };
}

function getShadowPriceVerdict(efv, scarcity) {
  if (scarcity >= 2.5) return "PROTECT_SoC";   // do not sell under any normal price
  if (efv > 150) return "HOLD_FOR_PEAK";
  if (efv < 50) return "SELL_FREELY";
  return "NORMAL";
}

function computeShadowPrice(soc, socMin, socMax, forecastVector, degradationCost) {
  // Base shadow price from SoC ratio — higher SoC = lower marginal value of each MWh
  const socRatio = clamp((soc - socMin) / (socMax - socMin), 0.01, 1.0);

  // Expected future value: probability-weighted peak price within horizon
  // Confidence-decay means far peaks are worth less in expectation
  let expectedFutureValue = 0;
  let totalWeight = 0;

  forecastVector.horizons.forEach(h => {
    // Discount factor: time value of waiting (0.98 per SP = ~4% daily discount)
    const timeDiscount = Math.pow(0.98, h.delta);
    // Probability of actually capturing this: depends on SoC available to hold
    const captureProb = Math.max(0.1, socRatio) * h.confidence;

    const weight = timeDiscount * captureProb;
    expectedFutureValue += h.forecastedPrice * weight;
    totalWeight += weight;
  });

  expectedFutureValue = totalWeight > 0 ? expectedFutureValue / totalWeight : 0;

  // Shadow price = expected future value, adjusted for SoC level
  // At low SoC: shadow price explodes (desperate to keep charge)
  // At high SoC: shadow price falls (plenty of charge, sell more freely)
  const scarcityMultiplier = soc < socMin + 10 ? 5.0    // critical — refuse to sell
    : soc < socMin + 20 ? 2.5    // low — very reluctant
      : soc > socMax - 10 ? 0.7    // near full — sell freely
        : 1.0;                        // normal

  return {
    expectedFutureValue,
    shadowPrice: expectedFutureValue * scarcityMultiplier,
    sellThreshold: (expectedFutureValue * scarcityMultiplier) + degradationCost,
    chargeThreshold: (expectedFutureValue * scarcityMultiplier) * 0.6, // charge at 60% of shadow
    recommendation: getShadowPriceVerdict(expectedFutureValue, scarcityMultiplier)
  };
}

/* ════════════════════════════════════════════════════════
   RL ENGINE — Q-Learning
════════════════════════════════════════════════════════ */

// Map RL action index to bid parameters: 
// [Direction, PriceOffset] for BM
// or [IntradayTradeDirection] for Stage 0
const RL_ACTIONS = [
  { type: "BM", dir: "SELL", offset: -35, name: "BM: Aggressive Sell" },
  { type: "BM", dir: "SELL", offset: -5, name: "BM: Competitive Sell" },
  { type: "BM", dir: "SELL", offset: +20, name: "BM: Speculative Sell" },
  { type: "BM", dir: "BUY", offset: +35, name: "BM: Aggressive Buy" },
  { type: "BM", dir: "BUY", offset: +5, name: "BM: Competitive Buy" },
  { type: "BM", dir: "BUY", offset: -20, name: "BM: Speculative Buy" },
  { type: "INTRADAY", dir: "SELL", name: "Intraday: Lock Sell FPN" },
  { type: "INTRADAY", dir: "BUY", name: "Intraday: Lock Buy FPN" },
  { type: "HOLD", dir: "HOLD", name: "Hold / Do Nothing" }
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

// ── Teaching Mode — Step Definitions ──────────────────
const TEACHING_STEPS = [
  {
    id: 1,
    emoji: "📜",
    title: "Step 1: The Trigger",
    panel: "Market Events",
    color: "#38c0fc",
    summary: "Everything starts with a Market Event. A sudden cloud cover, a wind drop, or a sudden surge in industrial demand creates a disconnect from the plan.",
    detail: "National Grid ESO continuously monitors these events. A 'Demand Spike' means the grid is suddenly short. These events are the ultimate cause of price volatility in the Balancing Mechanism.",
    watch: "Watch the 'Market Events' ticker in the top-left. These real-world shocks are what drive the entire economic engine below.",
  },
  {
    id: 2,
    emoji: "🌍",
    title: "Step 2: Grid Balance (NIV)",
    panel: "Grid Balance (NIV)",
    color: "#f0455a",
    summary: "CAUSE: A Market Event just happened.\nEFFECT: The grid is now in a physical imbalance.",
    detail: "This imbalance is measured as the Net Imbalance Volume (NIV). If the system is SHORT (negative NIV), there is more demand than supply. National Grid's entire mission is to bring this number back to zero in real-time.",
    watch: "Watch the NIV meter. Because the world is unpredictable, the grid is almost NEVER perfectly at zero.",
  },
  {
    id: 3,
    emoji: "⚡",
    title: "Step 3: The Physics",
    panel: "Grid Frequency",
    color: "#f5b222",
    summary: "CAUSE: The grid is short (Negative NIV).\nEFFECT: The physical spinning inertia of the entire country slows down.",
    detail: "The GB grid is one giant machine locked at 50.000 Hz. When NIV is negative, that machine physically slows down. If it drops too far (e.g. 49.5 Hz), the grid crashes. We must arrest this fall instantly.",
    watch: "Watch the Frequency gauge pull away from 50.000 Hz as the NIV swings. This is the heartbeat of the nation's energy system.",
  },
  {
    id: 4,
    emoji: "🤖",
    title: "Step 4: The Hardware Reflex",
    panel: "Battery (BESS)",
    color: "#1de98b",
    summary: "CAUSE: Frequency is crashing (Step 3).\nEFFECT: Batteries physically inject power in milliseconds.",
    detail: "Humans and markets are too slow for this. Instead, local sensors on batteries detect the frequency drop and automatically fire based on their DFR contracts. This 'reflex' stabilizes the grid before the crash becomes catastrophic.",
    watch: "Watch for the blinking '⚡ ACTIVE' alerts in the Battery panel. This is software and hardware acting as the grid's first line of defense.",
  },
  {
    id: 5,
    emoji: "⚖️",
    title: "Step 5: The Market Solution",
    panel: "Bid Lifecycle",
    color: "#b78bfa",
    summary: "CAUSE: Hardware stabilized the grid, but we are still fundamentally out of balance.\nEFFECT: The ESO uses the Balancing Mechanism to buy sustained energy.",
    detail: "Now, the economic market kicks in. Generators and batteries submit 'Bids' and 'Offers'. The ESO accepts specific bids to bring the NIV back to zero. This is a deliberate commercial transaction orchestrated by the Control Room.",
    watch: "Follow the 'Bid Lifecycle' steps. Your bid moves from Created to Submitted, and if it's cheap enough, to 'Accepted' by the ESO.",
  },
  {
    id: 6,
    emoji: "📈",
    title: "Step 6: The Economic Engine",
    panel: "Supply & Demand Intercept",
    color: "#c084fc",
    summary: "How does the ESO decide whose bid to take? They use the Merit Order.",
    detail: "The ESO stacks all available bids from cheapest to most expensive. They walk up this stack until they have exactly enough energy to fix the NIV. The last bid accepted sets the 'Clearing Price' for the system.",
    watch: "Watch the Intercept chart. As the system becomes more 'Short', the ESO is pushed further right into the expensive 'Peak' generation units.",
  },
  {
    id: 7,
    emoji: "💸",
    title: "Step 7: The Money",
    panel: "Your P&L / Results",
    color: "#1de98b",
    summary: "Every action has a financial consequence.",
    detail: "If your bid was accepted in the Merit Order, you get paid for your help. However, if the grid was stressed, you might also have earned 'Availability Payments' just for being ready with your hardware reflex in Step 4.",
    watch: "Look at your P&L. It combines your real-time trading profit with your underlying service revenues from helping the grid stay at 50Hz.",
  },
  {
    id: 8,
    emoji: "🧠",
    title: "Step 8: AI Evolution",
    panel: "AI Bid Engine",
    color: "#b78bfa",
    summary: "How do you win in this complex system? You learn.",
    detail: "Market dynamics change every second. An AI agent (RL) observes the state of the grid, the current price, and past results to evolve the perfect bidding strategy—maximizing profit while ensuring the grid stays safe.",
    watch: "Watch the AI panel. The agent is constantly balancing its 'Exploration' of new prices with the 'Exploitation' of known profitable strategies.",
  },
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

// ── OHLC & Volume Price Chart ──────────────────────────────────
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
    // Bottom 25% is for volume
    const VOL_H = (H - PAD_T - PAD_B) * 0.25;
    const PRICE_H = (H - PAD_T - PAD_B) - VOL_H - 10;

    const allV = bars.flatMap(b => [b.high, b.low]).concat([sbp, ssp, currentPrice]);
    const lo = Math.min(...allV) - 3, hi = Math.max(...allV) + 3, rng = hi - lo || 1;
    const toX = i => PAD_L + (i / (bars.length - 1)) * (W - PAD_L - PAD_R);
    const toY = v => PAD_T + (1 - (v - lo) / rng) * PRICE_H;
    const barW = Math.max(3, (W - PAD_L - PAD_R) / bars.length * .55);

    const maxVol = Math.max(...bars.map(b => b.volume || 1000));
    const toVolY = v => H - PAD_B - (v / maxVol) * VOL_H;

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

    // OHLC & Volume bars
    bars.forEach((b, i) => {
      const x = toX(i), bull = b.close >= b.open;
      const col = bull ? "#1de98b" : "#f0455a";

      // Volume
      if (b.volume) {
        const vy = toVolY(b.volume);
        const vh = H - PAD_B - vy;
        ctx.fillStyle = bull ? "#1de98b22" : "#f0455a22";
        ctx.fillRect(x - barW / 2, vy, barW, vh);
      }

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
function FreqGauge({ freq, rocof = 0 }) {
  const dev = freq - 50;
  const col = Math.abs(dev) > .2 ? "#f0455a" : Math.abs(dev) > .1 ? "#f5b222" : "#1de98b";
  const pct = clamp(50 + (dev / .5) * 50, 2, 98);
  const rocofCol = Math.abs(rocof) > 0.125 ? "#f0455a" : Math.abs(rocof) > 0.05 ? "#f5b222" : "#1de98b";
  const msg = Math.abs(dev) > .2 ? "⚠ Critical — emergency balancing needed"
    : Math.abs(dev) > .1 ? "△ Deviation detected — monitoring"
      : "✓ Stable — within normal operating band";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: col }}>{freq.toFixed(3)}</span>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontFamily: "var(--body)", fontSize: 10, color: "var(--gry)" }}>Hz  (target 50.000)</span>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, color: rocofCol }}>
            RoCoF: {rocof >= 0 ? "+" : ""}{(rocof * 1000).toFixed(1)} mHz/s
            {Math.abs(rocof) > 0.125 && " ⚠ LoM RISK"}
          </div>
        </div>
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
function Panel({ title, icon, subtitle, accent = "#38c0fc", children, style = {}, bodyStyle = {}, noScroll = false }) {
  return (
    <div style={{
      background: "var(--bg1)", border: "1px solid var(--ln)", borderRadius: 5,
      display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, ...style
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
      <div style={{ flex: 1, overflow: noScroll ? "hidden" : "auto", minHeight: 0, padding: "5px 8px", ...bodyStyle }}>
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

// ── Teaching Focus Wrapper ────────────────────────────
function TeachingFocus({ active, stepName, children, wrapperStyle = {} }) {
  if (!active) {
    return <div className="teaching-blur" style={{ display: "flex", flexDirection: "column", ...wrapperStyle }}>{children}</div>;
  }
  return (
    <div className="teaching-focus-active" style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      ...wrapperStyle
    }}>
      <div style={{
        position: "absolute",
        inset: 0,
        borderRadius: 5,
        animation: "pulseGlow 1.5s infinite alternate",
        zIndex: 50,
        pointerEvents: "none"
      }} />
      <div style={{
        position: "absolute", top: -12, left: 10,
        background: "#b78bfa", color: "#050e16", padding: "2px 8px",
        borderRadius: 4, fontSize: 10, fontWeight: 900,
        fontFamily: "var(--body)", zIndex: 51,
        boxShadow: "0 2px 4px rgba(0,0,0,0.5)"
      }}>
        {stepName}
      </div>
      {children}
    </div>
  );
}

// ── ESO Analyst Panel (Professional Teaching Widget) ─────────────
function ESOAnalystPanel({ step, S, onNext, onPrev, onExit }) {
  const [typedText, setTypedText] = useState("");
  const dragRef = useRef(null);
  const posRef = useRef({ x: window.innerWidth - 380, y: 60 });
  const [pos, setPos] = useState({ x: window.innerWidth - 380, y: 60 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  const onMouseDown = (e) => {
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: posRef.current.x, oy: posRef.current.y };
    e.preventDefault();
  };

  useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const nx = dragStart.current.ox + (e.clientX - dragStart.current.mx);
      const ny = dragStart.current.oy + (e.clientY - dragStart.current.my);
      posRef.current = { x: nx, y: ny };
      setPos({ x: nx, y: ny });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  // Reset position when step changes
  useEffect(() => {
    const nx = window.innerWidth - 390;
    posRef.current = { x: nx, y: 60 };
    setPos({ x: nx, y: 60 });
  }, [step]);

  // Typewriter effect for professional feed
  useEffect(() => {
    if (!step) return;
    const ts = TEACHING_STEPS[step - 1];
    if (!ts) return;

    // Construct the full "analyst report" text
    let fullText = ts.summary + "\n\n" + ts.detail;

    setTypedText("");
    let i = 0;
    const timer = setInterval(() => {
      setTypedText(fullText.substring(0, i));
      i++;
      if (i > fullText.length) clearInterval(timer);
    }, 15); // Fast typing speed

    return () => clearInterval(timer);
  }, [step, S.useLiveMarket]); // Only re-type on step change

  if (!step) return null;
  const ts = TEACHING_STEPS[step - 1];
  if (!ts) return null;
  const isFirst = step === 1;
  const isLast = step === TEACHING_STEPS.length;

  // Determine System State for Analyst Header
  let sysState = "NOMINAL";
  let sysCol = "#1de98b";
  if (Math.abs(S.freq - 50) > 0.2) { sysState = "CRITICAL DEVIATION"; sysCol = "#f0455a"; }
  else if (Math.abs(S.freq - 50) > 0.1) { sysState = "WARNING"; sysCol = "#f5b222"; }

  return (
    <div ref={dragRef} style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 2000,
      width: 360,
      background: "#0a0a0c", // Deep black terminal look
      border: `1px solid #333`,
      borderRadius: 4,
      boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px ${sysCol}44`,
      fontFamily: "var(--mono)", // Force monospace for control room feel
      userSelect: dragging.current ? "none" : "auto",
      animation: "fadeUp 0.25s ease",
      overflow: "hidden",
    }}>
      {/* ── Top Terminal Bar ── */}
      <div onMouseDown={onMouseDown} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 8px", background: "#111", borderBottom: "1px solid #333", cursor: "grab"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: sysCol, boxShadow: `0 0 5px ${sysCol}` }} />
          <span style={{ fontSize: 9, color: "var(--gry)", fontWeight: 700, letterSpacing: 1 }}>ESO ANALYST FEED</span>
        </div>
        <button onClick={onExit} style={{ background: "none", border: "none", color: "var(--gry)", cursor: "pointer", fontSize: 12 }}>✕</button>
      </div>

      {/* ── Header Info ── */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #222", display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 8, color: "var(--dim)" }}>SYSTEM STATE</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: sysCol }}>{sysState}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 8, color: "var(--dim)" }}>LIVE FREQ</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: sysCol }}>{S.freq.toFixed(3)} Hz</div>
        </div>
      </div>

      {/* ── Event Title ── */}
      <div style={{ padding: "8px 12px", background: ts.color + "11", borderBottom: `1px solid ${ts.color}33` }}>
        <div style={{ fontSize: 9, color: ts.color, fontWeight: 700 }}>EVENT {step}/{TEACHING_STEPS.length}: {ts.title.toUpperCase()}</div>
      </div>

      {/* ── Telemetry Body ── */}
      <div style={{ padding: "12px", maxHeight: 300, minHeight: 150, overflowY: "auto", position: "relative" }}>

        {/* Cause / Effect Structured rendering if present */}
        {ts.summary.includes("CAUSE:") && ts.summary.includes("EFFECT:") ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <div style={{ borderLeft: "2px solid #f0455a", paddingLeft: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: "#f0455a" }}>[CAUSE DETECTED]</span>
              <div style={{ fontSize: 11, color: "var(--gry)", marginTop: 2, lineHeight: 1.4 }}>
                {ts.summary.split("EFFECT:")[0].replace("CAUSE:", "").trim()}
              </div>
            </div>
            <div style={{ borderLeft: `2px solid ${ts.color}`, paddingLeft: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: ts.color }}>[SYSTEM RESPONSE]</span>
              <div style={{ fontSize: 11, color: "var(--wht)", marginTop: 2, lineHeight: 1.4 }}>
                {ts.summary.split("EFFECT:")[1].trim()}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--gry)", lineHeight: 1.5, marginBottom: 12, whiteSpace: "pre-wrap" }}>
            {/* Blinking cursor effect at the end of typed text */}
            {typedText}
            <span style={{ animation: "blink 1s step-end infinite", color: ts.color }}>_</span>
          </div>
        )}

      </div>

      {/* ── Recommended Action / Focus ── */}
      <div style={{ padding: "8px 12px", background: "#111", borderTop: "1px solid #333", borderBottom: "1px solid #333" }}>
        <div style={{ fontSize: 8, color: "var(--dim)", marginBottom: 2 }}>RECOMMENDED FOCUS</div>
        <div style={{ fontSize: 10, color: ts.color }}>&gt; {ts.watch}</div>
      </div>

      {/* ── Footer nav ── */}
      <div style={{ display: "flex", gap: 1, background: "#222" }}>
        <button onClick={onPrev} style={{
          flex: 1, padding: "8px 0", cursor: isFirst ? "default" : "pointer",
          background: "#111", border: "none", color: isFirst ? "#444" : "var(--gry)",
          fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700
        }}>&lt; PREV</button>

        <button onClick={isLast ? onExit : onNext} style={{
          flex: 1, padding: "8px 0", cursor: "pointer",
          background: ts.color + "22", border: "none", color: ts.color,
          fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700
        }}>
          {isLast ? "ACKNOWLEDGE (EXIT)" : "PROCEED &gt;"}
        </button>
      </div>
    </div>
  );
}

// ── Cause & Effect Connection Lines (Animated SVG) ─────────────
function SVGCauseEffectLines({ step }) {
  if (!step) return null;

  // Define hardcoded connection paths based on the step. 
  // Coordinates are roughly relative to the main grid layout.
  let lines = [];

  if (step === 1) {
    // Market Event -> NIV (Triggering the imbalance)
    lines.push({ x1: '15%', y1: '15%', x2: '15%', y2: '35%', color: '#38c0fc' });
  } else if (step === 2) {
    // NIV -> Frequency (The physical result)
    lines.push({ x1: '15%', y1: '45%', x2: '15%', y2: '65%', color: '#f0455a' });
  } else if (step === 3) {
    // Frequency -> Battery (The hardware reflex)
    lines.push({ x1: '15%', y1: '75%', x2: '15%', y2: '90%', color: '#f5b222' });
  } else if (step === 4) {
    // Battery Status -> Bid Engine (Integrating hardware with commercial strategy)
    lines.push({ x1: '15%', y1: '90%', x2: '35%', y2: '50%', color: '#1de98b' });
  } else if (step === 5) {
    // Bid Lifecycle -> Merit Curves (How the bid becomes a trade)
    lines.push({ x1: '35%', y1: '85%', x2: '60%', y2: '80%', color: '#b78bfa' });
  } else if (step === 6) {
    // Merit Curves -> Results (The clearing math)
    lines.push({ x1: '60%', y1: '40%', x2: '85%', y2: '80%', color: '#c084fc' });
  } else if (step === 7) {
    // Results -> P&L (Financial outcome)
    lines.push({ x1: '85%', y1: '75%', x2: '85%', y2: '45%', color: '#1de98b' });
  } else if (step === 8) {
    // P&L -> AI Learns (Closing the loop)
    lines.push({ x1: '85%', y1: '40%', x2: '35%', y2: '50%', color: '#b78bfa' });
  }

  if (lines.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        zIndex: 2500
      }}
    >
      <defs>
        <marker id="arrowhead-cause" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="var(--wht)" opacity="0.8" />
        </marker>
        <filter id="glow-line" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {lines.map((line, i) => (
        <g key={i}>
          {/* Base dash line */}
          <path
            d={`M ${line.x1} ${line.y1} Q ${(parseFloat(line.x1) + parseFloat(line.x2)) / 2}% ${(parseFloat(line.y1) + parseFloat(line.y2)) / 2 - 10}% ${line.x2} ${line.y2}`}
            stroke={line.color}
            strokeWidth="2"
            fill="none"
            strokeDasharray="4 6"
            opacity="0.4"
          />
          {/* Animated overlaid pulse line */}
          <path
            d={`M ${line.x1} ${line.y1} Q ${(parseFloat(line.x1) + parseFloat(line.x2)) / 2}% ${(parseFloat(line.y1) + parseFloat(line.y2)) / 2 - 10}% ${line.x2} ${line.y2}`}
            stroke={line.color}
            strokeWidth="3"
            fill="none"
            filter="url(#glow-line)"
            markerEnd="url(#arrowhead-cause)"
            style={{
              strokeDasharray: "20 200",
              animation: "dash-pulse 2s linear infinite"
            }}
          />
        </g>
      ))}
      <style>
        {`
          @keyframes dash-pulse {
            0% { stroke-dashoffset: 220; opacity: 1; }
            80% { stroke-dashoffset: 0; opacity: 1; }
            100% { stroke-dashoffset: 0; opacity: 0; }
          }
        `}
      </style>
    </svg>
  );
}


/* ════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════ */
export default function App() {
  const [S, setS] = useState(initState);
  const iRef = useRef(null);

  const usableBounds = useMemo(() => {
    return getUsableSoCBounds(S.maxMWh, 5, 95, S.activeDfr);
  }, [S.maxMWh, S.activeDfr]);

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
        const url = URL.ObjectURL(blob);
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

  const advanceTeachingStep = (dir = 1) => {
    setS(p => {
      const next = p.teachingStep + dir;
      if (next < 1) return { ...p, teachingMode: false, teachingStep: 0 };
      if (next > TEACHING_STEPS.length) return { ...p, teachingMode: false, teachingStep: 0 };
      return { ...p, teachingStep: next };
    });
  };

  const startTeachingMode = () => {
    setS(p => ({ ...p, teachingMode: true, teachingStep: 1, running: true }));
  };

  // ── TICK ──────────────────────────────────────────────
  const tick = useCallback(() => {
    setS(prev => {
      const p = { ...prev };
      if (!p.config) p.config = { ...GRID_CONFIG }; // defensive fallback for hot-reload
      try {
        p.tick++;
        p.simSeconds++;

        // ── Layer 1: Physical Inertia (RoCoF)
        const { inertiaConstant, systemSizeGW } = p.config;

        // Calculate RoCoF (Rate of Change of Frequency) in Hz/s
        const rocof = (prev.niv / (systemSizeGW * 1000)) * (50.0 / (2 * inertiaConstant));
        p.rocof = rocof;

        // Assume 1 tick = 1 second of physical time for the RoCoF calculus
        p.freq = clamp(prev.freq + rocof + (Math.random() - 0.5) * 0.005, 48.0, 52.0);

        // ── Determine Active DFR Contracts for current EFA block
        const currentEFA = getEFABlock(p.sp);
        const activeContracts = prev.dfrCommitments[currentEFA.block];
        p.activeDfr = activeContracts;

        // ── Layer 2: DFR Ancillary Response (Proportional Frequency Dispatch)
        let totalDfrDispatchedMW = 0;

        if (activeContracts) {
          // Responses directionally dependent on frequency
          if (p.freq < 50.0) {
            // Low Frequency: we must provide primary 'UP' services (discharge)
            const dcUp = dfr_response(p.freq, 'DC', activeContracts.DC_UP);
            const dmUp = dfr_response(p.freq, 'DM', activeContracts.DM_UP);
            const drUp = dfr_response(p.freq, 'DR', activeContracts.DR_UP);
            totalDfrDispatchedMW = dcUp + dmUp + drUp;
          } else if (p.freq > 50.0) {
            // High Frequency: we must provide secondary 'DOWN' services (charge)
            const dcDwn = dfr_response(p.freq, 'DC', activeContracts.DC_DOWN);
            const dmDwn = dfr_response(p.freq, 'DM', activeContracts.DM_DOWN);
            const drDwn = dfr_response(p.freq, 'DR', activeContracts.DR_DOWN);
            totalDfrDispatchedMW = -(dcDwn + dmDwn + drDwn);
          }
        }
        p.dfrDispatched = totalDfrDispatchedMW;

        p.wUpCalc = prev.wUpCalc !== undefined ? prev.wUpCalc : 0;
        p.wDwnCalc = prev.wDwnCalc !== undefined ? prev.wDwnCalc : 0;

        // Physically deduct DFR energy from battery SoC (1s of dispatch)
        if (totalDfrDispatchedMW !== 0 && prev.maxMWh > 0) {
          // positive dispatch MW means generating -> reduces SoC
          // negative dispatch MW means charging -> increases SoC
          p.soc = clamp(prev.soc - (totalDfrDispatchedMW * (1 / 3600) / prev.maxMWh) * 100, 0, 100);

          if (totalDfrDispatchedMW > 0) {
            const energyDeltaMWh = (totalDfrDispatchedMW / 3600) / p.config.roundTripEfficiency;
            p.wUpCalc = Math.max(0, p.wUpCalc - energyDeltaMWh);
          } else {
            const energyDeltaMWh = (Math.abs(totalDfrDispatchedMW) / 3600) * p.config.roundTripEfficiency;
            p.wDwnCalc += energyDeltaMWh;
          }
        }

        // ── DFR SoE Manager & Presets (Casella et al., 2024 eq 3.51-3.53)
        if (!p.presetSchedule) p.presetSchedule = [];
        p.presetSchedule = p.presetSchedule.filter(ps => ps.sp >= p.sp || (p.sp >= 46 && ps.sp <= 2)); // keep future wrapping SPs

        const activePreset = p.presetSchedule.find(ps => ps.sp === p.sp);
        if (activePreset) {
          // Preset forces charging/discharging outside normal markets
          p.soc = clamp(p.soc - (activePreset.mw * (1 / 3600) / prev.maxMWh) * 100, 0, 100);
          p.presetActiveThisTick = activePreset.mw !== 0;
        } else {
          p.presetActiveThisTick = false;
        }

        // Schedule new presets if bounds breached and no recovery scheduled
        if (p.presetSchedule.length === 0 && prev.maxMWh > 0 && p.activeDfr) {
          const bounds = getUsableSoCBounds(prev.maxMWh, 5, 95, p.activeDfr);

          if (bounds.wUp_MWh > 0 && p.wUpCalc <= 0.1) {
            p.presetSchedule.push({ sp: (p.sp + 2) % 48 || 48, mw: -prev.maxMW * 0.25 });
            p.presetSchedule.push({ sp: (p.sp + 3) % 48 || 48, mw: -prev.maxMW * 0.25 });
            const logEntry = { sp: p.sp, time: spToTime(p.sp), text: "⚠️ DFR BREACH: W_up depleted! Emergency charge preset scheduled in 1 hr.", price: p.sbp || prev.sbp };
            p.eventLog = [logEntry, ...(p.eventLog || prev.eventLog || [])].slice(0, 8);
            p.wUpCalc = bounds.wUp_MWh; // optimist reset
          } else if (bounds.wDwn_MWh > 0 && p.wDwnCalc >= bounds.wDwn_MWh - 0.1) {
            p.presetSchedule.push({ sp: (p.sp + 2) % 48 || 48, mw: prev.maxMW * 0.25 });
            p.presetSchedule.push({ sp: (p.sp + 3) % 48 || 48, mw: prev.maxMW * 0.25 });
            const logEntry = { sp: p.sp, time: spToTime(p.sp), text: "⚠️ DFR BREACH: W_dw filled! Emergency discharge preset scheduled in 1 hr.", price: p.sbp || prev.sbp };
            p.eventLog = [logEntry, ...(p.eventLog || prev.eventLog || [])].slice(0, 8);
            p.wDwnCalc = 0; // optimist reset
          }
        }

        // ── Interconnector Auto-Flow
        p.interconnectorFlow = clamp(-prev.niv * p.config.interconnectorSensitivity, -p.config.interconnectorMaxMW, p.config.interconnectorMaxMW);

        // ── interval timer → trigger market clearing
        const ISEC = Math.max(3, Math.round(INTERVAL_SECS / prev.speed));
        p.intervalTimer = prev.intervalTimer + 1;

        if (p.intervalTimer >= ISEC) {
          p.intervalTimer = 0;

          // ── advance SP
          p.sp = (prev.sp % 48) + 1;

          // DA MILP at SP 47
          if (p.sp === 47) {
            p.dfrCommitments = runDayAheadMILP(prev.maxMWh, prev.maxMW);
            const logEntry = {
              sp: p.sp, time: spToTime(p.sp),
              text: "📊 MILP DAY-AHEAD: New DFR commitments generated for tomorrow.",
              price: p.sbp || prev.sbp,
            };
            p.eventLog = [logEntry, ...(p.eventLog || prev.eventLog || [])].slice(0, 8);
          }

          // Update active DFR for the current block and reset tracking energy if block changes
          const currentBlock = getEFABlock(p.sp).block;
          if (p.dfrCommitments && p.dfrCommitments[currentBlock]) {
            const newActive = p.dfrCommitments[currentBlock];
            if (!prev.activeDfr || JSON.stringify(prev.activeDfr) !== JSON.stringify(newActive)) {
              const b = getUsableSoCBounds(prev.maxMWh, 5, 95, newActive);
              p.wUpCalc = b.wUp_MWh; // Ref starts full 
              p.wDwnCalc = 0;        // Ref starts empty
            } else {
              p.wUpCalc = prev.wUpCalc;
              p.wDwnCalc = prev.wDwnCalc;
            }
            p.activeDfr = newActive;
          } else {
            p.activeDfr = null;
            p.wUpCalc = 0;
            p.wDwnCalc = 0;
          }

          // ── Gate Closure: Lock bids and capture FPN
          // Gate opens at the start of each new SP clearing (Stage 1 finishes, Stage 2 begins)
          p.gateClosed = true;
          p.fpn = {
            // The FPN is exactly what we acquired in the intraday market
            vol: Math.abs(prev.intradayVolumeAcquired),
            dir: prev.intradayVolumeAcquired >= 0 ? "SELL" : "BUY",
            lockedCashflow: prev.intradayCashflow // This cash is guaranteed, we traded it bilaterally
          };
          p.gateClosureSP = p.sp;

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

          // ══ STEP 1: DEMAND ASSERTS ITSELF (exogenous physical reality) ══
          // Demand is the primal cause. Events modify the physical world (demand/generation),
          // not the price. NIV emerges from the mismatch — it is not injected synthetically.

          // Build supply & demand curves — these represent the physical reality of
          // what generation PLANNED to produce (FPNs) vs what demand ACTUALLY needs.
          // Events modify generation/demand MW directly (e.g., wind drops, cold snap).
          // Frequency-responsive behaviour is baked in (wind curtails at >50.1 Hz).

          // (Curves are built later after RL action selection, but NIV is derived from them)

          // ══ STEP 8: FEEDBACK LOOPS (Agent Learning) ══
          // Price and profit become signals for future behavior. The agent updates
          // its internal shadow price (Q-values) based on the financial outcome of its 
          // physical actions (Step 7). This will change how it bids next time matching 
          // a similar physical state.
          // ── RL Engine: Learn from PREVIOUS turn's result
          // Generate the multi-horizon forecast vector
          const forecastVector = computeForecastVector(p.sp, p);
          const shadowPriceObj = computeShadowPrice(prev.soc, 15, 95, forecastVector, p.config.degradationCost);
          p.forecastHorizon = forecastVector; // save for UI
          p.shadowPriceMeta = shadowPriceObj; // save for UI

          // Use the newly calculated physical environment states to orient the agent
          const bounds = p.activeDfr ? getUsableSoCBounds(prev.maxMWh, 5, 95, p.activeDfr) : { effectiveMin_pct: 5, effectiveMax_pct: 95 };
          p.effectiveMin_pct = bounds.effectiveMin_pct;
          p.effectiveMax_pct = bounds.effectiveMax_pct;

          const stateKey = getRLState({
            freq: p.freq, rocof: p.rocof, soc: prev.soc,
            spotPrice: Math.max(prev.sbp, prev.spotPrice) || 50,
            lolp: (prev.lolp || 0) / 100,
            intradayPrice: p.intradayPrice,
            timeToGate: ISEC - p.intervalTimer,
            forecastVector, shadowPrice: shadowPriceObj,
            effectiveMin_pct: bounds.effectiveMin_pct,
            effectiveMax_pct: bounds.effectiveMax_pct,
            dfrActive: p.activeDfr !== null
          });
          p.rlState = stateKey;

          // ── 1. BESS Agent Learning
          if (p.rlEnabled && prev.rlState && p.rlAction !== null) {
            let reward = 0;
            const action = RL_ACTIONS[p.rlAction];
            const prevShadowMeta = prev.shadowPriceMeta || { expectedFutureValue: 90 };
            const prevForecast = prev.forecastHorizon || { opportunityShape: "FLAT", peakPrice: 100 };

            // 1. Immediate P&L
            let realisedCashflow = 0;
            if (prev.yourResult && prev.yourResult.accepted && prev.userBidDir !== "HOLD") {
              const mwh = prev.yourResult.dispatchedMW * 0.5;
              realisedCashflow = prev.yourResult.revenue - (p.marginalCost * mwh);
            }
            reward += realisedCashflow;

            // 2. Shadow price delta (change in option value of stored energy)
            const socDelta = p.soc - prev.soc;
            // 1% SoC = maxMWh / 100.
            const mwhDelta = socDelta * (prev.maxMWh / 100);
            const shadowDelta = mwhDelta * prevShadowMeta.expectedFutureValue;
            reward += shadowDelta * 0.5; // 50% weight

            // 3. Opportunity cost penalty (Crucial for temporal arbitrage)
            if (action.type !== 'HOLD' && action.dir === 'SELL' && prevForecast.opportunityShape === 'SPIKE_CLOSE') {
              const missedUpside = prevForecast.peakPrice - (prev.sbp || p.spotPrice);
              if (missedUpside > 20) {
                reward -= missedUpside * (prev.userBidVol * 0.5) * 0.3; // 30% weight penalty
              }
            }

            // 4. Smart charging bonus
            if (action.type !== 'HOLD' && action.dir === 'BUY' && prevForecast.opportunityShape === 'CRATER_AHEAD') {
              const chargeQuality = Math.max(0, prevShadowMeta.expectedFutureValue - (prev.ssp || p.spotPrice));
              reward += chargeQuality * (prev.userBidVol * 0.5) * 0.2; // 20% weight bonus
            }

            // 5. LOLP bonus (priority for resolving grid stress)
            if (action.type !== 'HOLD' && action.dir === 'SELL' && prev.lolp > 0.02 && prev.yourResult?.accepted) {
              reward += (prev.sbp || p.spotPrice) * (prev.yourResult.dispatchedMW * 0.5) * 0.3; // 30% weight bonus
            }

            // 6. SoC strict boundary protection (DeepSeek constraint)
            const effMin = prev.effectiveMin_pct || 5;
            const effMax = prev.effectiveMax_pct || 95;
            if (p.soc <= effMin + 0.5 || p.soc >= effMax - 0.5) {
              reward -= 1000; // severe penalty for violating energy reservation bands
            } else {
              if (p.soc < effMin + 10) {
                reward -= 200 * ((effMin + 10) - p.soc);
              }
              if (p.soc > effMax - 10) {
                reward -= 100 * (p.soc - (effMax - 10));
              }
            }

            // 7. Preset Recovery avoidance penalty
            if (p.presetActiveThisTick || (p.presetSchedule && p.presetSchedule.length > 0)) {
              reward -= 100; // teach the agent to avoid DFR operational depletion
            }

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
              // Reward = (Bid Price - Base Cost) * Dispatched MW     [Pay as Bid]
              prev.clearing.supply.forEach(g => {
                if (g.accepted && !g.isYou) {
                  genReward += (g.price - g.baseCost) * g.dispatchedMW;
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
              // Reward = (Willingness to Pay - Bid Price) * Dispatched MW  [Pay as Bid]
              prev.clearing.demand.forEach(c => {
                if (c.accepted && !c.isYou) {
                  conReward += (c.basePrice - c.price) * c.dispatchedMW;
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
          // The agent takes actions differently depending on whether it's Stage 0 (Intraday) or Stage 2 (Gate Closure)
          if (p.rlEnabled) {
            let actionIdx = 0;
            // Filter actions based on state. If we are in the interval timer (Stage 0), we can trade Intraday.
            // When gate closes, we lock in a BM bid.
            const validActions = RL_ACTIONS.map((a, i) => i);

            if (Math.random() < p.rlEpsilon) {
              const randValid = validActions[Math.floor(Math.random() * validActions.length)];
              actionIdx = randValid;
            } else {
              actionIdx = getBestAction(p.qTable, stateKey) ?? validActions[Math.floor(Math.random() * validActions.length)];
            }
            p.rlAction = actionIdx;
            const chosen = RL_ACTIONS[actionIdx];

            if (chosen.type === "INTRADAY") {
              const timeToGate = ISEC - p.intervalTimer;
              if (timeToGate > 0) {
                const execPrice = chosen.dir === "BUY" ? p.intradayPrice + (p.intradaySpread / 2) : p.intradayPrice - (p.intradaySpread / 2);

                // Power constraints (MW)
                const dfrUp_MW = p.activeDfr ? p.activeDfr.DC_UP + p.activeDfr.DM_UP + p.activeDfr.DR_UP : 0;
                const dfrDwn_MW = p.activeDfr ? p.activeDfr.DC_DOWN + p.activeDfr.DM_DOWN + p.activeDfr.DR_DOWN : 0;

                const mwLimit = chosen.dir === "SELL"
                  ? p.maxMW - dfrUp_MW - Math.abs(p.intradayVolumeAcquired)
                  : p.maxMW - dfrDwn_MW - Math.abs(p.intradayVolumeAcquired);

                // Energy bounds (MWh) - shrink tradeable window
                const bounds = getUsableSoCBounds(prev.maxMWh, 5, 95, p.activeDfr);
                const currentMWh = (prev.soc / 100) * prev.maxMWh;

                const maxVolToSell_MWh = Math.max(0, currentMWh - bounds.effectiveMin_MWh);
                const maxVolToBuy_MWh = Math.max(0, bounds.effectiveMax_MWh - currentMWh);

                const stateEnergyLimitMW = chosen.dir === "SELL" ? maxVolToSell_MWh * 2 : maxVolToBuy_MWh * 2;

                const finalMwLimit = Math.max(0, Math.min(mwLimit, stateEnergyLimitMW));
                const mw = Math.min(5, finalMwLimit); // RL trades in 5MW chunks

                if (mw > 0) {
                  const volDelta = chosen.dir === "SELL" ? mw : -mw;
                  const cashDelta = chosen.dir === "SELL" ? mw * 0.5 * execPrice : -mw * 0.5 * execPrice;
                  p.intradayVolumeAcquired += volDelta;
                  p.intradayCashflow += cashDelta;
                }
              }
            } else if (chosen.type === "BM") {
              // IMB (BM) Exclusivity Rule (Casella et al., Eq 3.69):
              // If DFR is active in this EFA block, BM participation is strictly 0.
              const dfrActiveCount = p.activeDfr ? Object.values(p.activeDfr).reduce((a, b) => a + b, 0) : 0;
              p.userBidDir = chosen.dir;
              p.userBidPrice = clamp(p.sbp + chosen.offset, -50, 6000);

              if (dfrActiveCount > 0) {
                p.userBidVol = 0; // Excluded from BM
              } else {
                // Not providing DFR, fully available for BM Arbitration
                const availableMW = prev.maxMW - Math.abs(prev.intradayVolumeAcquired);
                const bounds = getUsableSoCBounds(prev.maxMWh, 5, 95, p.activeDfr);
                if (chosen.dir === "SELL") {
                  p.userBidVol = clamp(availableMW, 0, (prev.soc / 100 * prev.maxMWh - bounds.effectiveMin_MWh) * 2);
                } else {
                  p.userBidVol = clamp(availableMW, 0, (bounds.effectiveMax_MWh - prev.soc / 100 * prev.maxMWh) * 2);
                }
              }
            } else {
              // HOLD
              p.userBidVol = 0;
            }
          }

          // ── Macro-Agent Action Selection
          if (!p.useLiveMarket) {
            if (p.sp % 4 === 1 || p.activeEvent) { // Hold macro strategy for 4 periods, unless event occurs
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
          }

          // ── rebuild market curves with user's bid (pass event for logical MW adjustments)
          const eventFactor = event
            ? (event.priceDelta > 40 ? 1.5 : event.nivDelta < 0 ? 1.2 : 0.85)
            : 1.0;

          const genMult = GEN_ACTIONS[p.genAction]?.mult || 1.0;
          const conMult = CON_ACTIONS[p.conAction]?.mult || 1.0;

          // DSO Constraint: B6 Scottish boundary congestion
          // When system is very short AND wind output is high, B6 becomes congested
          // (cheap Scottish wind can't flow south to where demand is)
          p.b6Congested = (p.niv < -200 && Math.random() < 0.3) || (event && event.id === "CONSTRAINT");

          const curves = buildMarketCurves(p.userBidPrice, p.userBidVol, p.userBidDir, eventFactor, event, genMult, conMult, prev.clearing, p.freq, p.b6Congested, p.sp);
          p.marketCurves = curves;

          let yourResult = { accepted: false, dispatchedMW: 0, revenue: 0, profit: 0, rank: 0, yourPrice: p.userBidPrice, priceRejected: false, dir: p.userBidDir };

          let spotClearing = null;
          let finalClearingPrice = 50;

          if (!p.useLiveMarket) {
            // ══ STEP 1 (cont): NIV EMERGES FROM PHYSICS ══
            // NIV = what generators planned to produce − what demand actually needs
            // This is the primal physical signal. Events have already modified
            // generation MW (wind drops, trips) and demand MW (cold snap, EV surge)
            // through the curve builder. The NIV discovers itself.
            const totalGenPlanned = curves.supply.reduce((s, u) => s + u.mw, 0);
            const totalDemandActual = curves.demand.reduce((s, u) => s + u.mw, 0);
            // Add forecast error noise — demand is never perfectly forecast
            const forecastError = (Math.random() - 0.5) * 80;
            p.niv = clamp((totalGenPlanned - totalDemandActual) + forecastError, -1500, 1500);
            p.baseNIV = p.niv;

            // ══ STEP 4: RESIDUAL NIV (auto response has already fired) ══
            // DFR (DC/DM/DR) services fired automatically on frequency (Tier 1 physics).
            // They have already partially closed the imbalance. The BM only needs to fix
            // what automatic response couldn't handle.
            const autoResponseMW = p.dfrDispatched || 0;
            const interconContribution = p.interconnectorFlow; // +ve = importing = helps when short
            const residualNIV = p.niv + autoResponseMW + (interconContribution > 0 ? interconContribution * 0.1 : 0);

            // ══ STEP 5: ESO WALKS MERIT ORDER (market responds to physics) ══
            // Stage 1: Spot Market (planned ahead of time — the DA/intraday position)
            spotClearing = clearMarketUniform(curves.supply, curves.demand);

            // Stage 2: Balancing Mechanism (real-time physical resolution)
            // ESO takes the spot state and applies BOA corrections to fix RESIDUAL NIV.
            // More ancillary = less BM dispatch needed = lower prices.
            const bmResult = clearBalancingMechanism(spotClearing.supply, spotClearing.demand, residualNIV);

            p.clearing = {
              supply: bmResult.supply,
              demand: bmResult.demand,
              clearingPrice: bmResult.balancingPrice,
              clearedVolume: spotClearing.clearedVolume
            };

            // ══ STEP 6: SCARCITY PRICE (LOLP → SBP/SSP) ══
            p.lolp = Math.min(100, bmResult.lolp * 100);

            const { sbp, ssp } = calculateImbalancePrice(bmResult.balancingPrice, bmResult.lolp, p.config.voll, p.config.sspSpread);

            finalClearingPrice = sbp;
            p.spotPrice = spotClearing.clearingPrice;
            p.sbp = sbp;
            p.ssp = ssp;
          }

          if (p.userBidVol > 0) {
            const isSell = p.userBidDir === "SELL";
            const stack = isSell ? p.clearing.supply : p.clearing.demand;
            const you = stack.find(u => u.isYou);

            if (you) {
              const energyMWh = you.dispatchedMW * 0.5;

              // Layer 6: Settlement Engine
              // System Buy Price (SBP) is paid TO generators for resolving shortfalls.
              // System Sell Price (SSP) is paid BY consumers/charging batteries.
              const settlementPrice = isSell ? p.sbp : p.ssp;
              const cashflow = isSell
                ? energyMWh * settlementPrice
                : -(energyMWh * settlementPrice);

              // True net economic value: Cashflow minus the fundamental opportunity cost/degradation of the battery cycle
              const profit = you.accepted ? (cashflow - (p.marginalCost * energyMWh)) : 0;

              yourResult = {
                accepted: you.accepted,
                dispatchedMW: you.dispatchedMW,
                revenue: you.accepted ? cashflow : 0,
                profit: you.accepted ? profit : 0,
                rank: you.rank,
                yourPrice: p.userBidPrice,
                settledPrice: settlementPrice,
                priceRejected: !you.accepted && (isSell ? p.userBidPrice > finalClearingPrice : p.userBidPrice < finalClearingPrice),
                dir: p.userBidDir
              };
            }
          }

          p.yourResult = yourResult;

          // (SoC is now handled inside STEP 7 to account for both Intraday FPN and BM dispatch)

          // ══ STEP 7: FINANCIAL SETTLEMENT ══
          // The financial record is written for the physical events that just occurred.
          // SBP/SSP penalties are applied to calculate net economic values.

          // ── SETTLEMENT ENGINE (Flows 39-43) ─────────────────────

          // 1. Intraday Locked Cashflow (Certainty: 100%)
          // This cash was earned/spent by trading in the continuous bilateral market before Gate Closure.
          const intradayPnL = p.fpn ? p.fpn.lockedCashflow : 0;

          // 2. BM Dispatch P&L (Certainty: 0% until Gate Closure finishes)
          // This cash is earned by submitting a bid to the ESO and getting swept in the merit order.
          const bmDispatchPnL = yourResult.revenue || 0;

          // 3. Ancillary Services (DC, DM, DR, DFS) Availability Payments (Certainty: 100%)
          let dcMW = 0, dmMW = 0, drMW = 0, dfsMW = 0;
          if (p.activeDfr) {
            dcMW = (p.activeDfr.DC_UP || 0) + (p.activeDfr.DC_DOWN || 0);
            dmMW = (p.activeDfr.DM_UP || 0) + (p.activeDfr.DM_DOWN || 0);
            drMW = (p.activeDfr.DR_UP || 0) + (p.activeDfr.DR_DOWN || 0);
            dfsMW = (p.activeDfr.DFS_UP || 0) + (p.activeDfr.DFS_DOWN || 0);
          }
          const dcRev = dcMW * (p.config.dcRate / 2);
          const dmRev = dmMW * (p.config.dmRate / 2);
          const drRev = drMW * (p.config.drRate / 2);
          const dfsRev = dfsMW * (p.config.dfsRate / 2);

          p.dcRevenueTotal = (prev.dcRevenueTotal || 0) + dcRev;
          p.dmRevenueTotal = (prev.dmRevenueTotal || 0) + dmRev;
          p.drRevenueTotal = (prev.drRevenueTotal || 0) + drRev;
          p.dfsRevenueTotal = (prev.dfsRevenueTotal || 0) + dfsRev;

          // 4. Capacity Market Payment (Certainty: 100% if SoC > threshold)
          const cmPayment = p.soc > p.config.cmSocThreshold ? (p.maxMW * p.config.cmRatePerSP) : 0;
          p.cmRevenueTotal = (prev.cmRevenueTotal || 0) + cmPayment;

          // Calculate Total Delivered Physical Volume (FPN + BM Dispatch)
          // Direction: +ve is Generation/Discharge. -ve is Demand/Charge.
          const fpnVolDirectional = p.fpn ? (p.fpn.dir === "SELL" ? p.fpn.vol : -p.fpn.vol) : 0;
          const bmVolDirectional = yourResult.accepted ? (yourResult.dir === "SELL" ? yourResult.dispatchedMW : -yourResult.dispatchedMW) : 0;
          const totalDeliveredEnergyMW = fpnVolDirectional + bmVolDirectional;
          const totalDeliveredEnergyMWh = totalDeliveredEnergyMW * 0.5;

          // Imbalance Cost (FPN vs Actual) is now implicitly covered because we assume 
          // the BESS delivered perfectly on both its FPN and BM instructions. 
          // (In a more advanced sim, we'd add delivery failure noise here).
          const imbalanceCost = 0;
          p.imbalanceCostTotal = (prev.imbalanceCostTotal || 0) + imbalanceCost;

          // 5. BSUoS Charge (levied on all net physical delivered volume, generation or demand)
          const bsuosCharge = Math.abs(totalDeliveredEnergyMWh) * p.config.bsuosRate;
          p.bsuosTotal = (prev.bsuosTotal || 0) + bsuosCharge;

          // 6. Degradation Cost (levied on all physical cycling)
          const degradationCost = Math.abs(totalDeliveredEnergyMWh) * p.marginalCost;
          const degradePnL = degradationCost; // Renamed for clarity in totalPnl calculation

          // 7. Net P&L = Intraday + BM + Ancillary + CM - BSUoS - Imbalance - Degradation
          const netSettlement = intradayPnL + bmDispatchPnL + dcRev + dmRev + drRev + dfsRev + cmPayment - bsuosCharge - imbalanceCost - degradePnL;
          p.totalPnl = (prev.totalPnl || 0) + netSettlement;

          // 8. Battery Physicals (Cycling & Health)
          const dischargeMWh = Math.max(0, -totalDeliveredEnergyMWh);
          const incrementalCycles = dischargeMWh / p.maxMWh;
          p.cycleCount = (prev.cycleCount || 0) + incrementalCycles;
          p.batteryHealth = Math.max(0, (prev.batteryHealth || 100) - (incrementalCycles * 0.005));

          // Append gross revenue and costs for tracking
          const grossRevenue = (intradayPnL > 0 ? intradayPnL : 0) + (bmDispatchPnL > 0 ? bmDispatchPnL : 0) + dcRev + dmRev + drRev + dfsRev + cmPayment;
          const grossCost = (intradayPnL < 0 ? Math.abs(intradayPnL) : 0) + (bmDispatchPnL < 0 ? Math.abs(bmDispatchPnL) : 0) + bsuosCharge + imbalanceCost + degradePnL;

          // 8. Update physical SoC based on total delivered energy
          // SELL (discharge) = +ve totalDeliveredEnergyMWh, decreases SoC.
          // BUY (charge) = -ve totalDeliveredEnergyMWh, increases SoC.
          if (totalDeliveredEnergyMWh !== 0) {
            p.soc = clamp(prev.soc - ((totalDeliveredEnergyMWh / prev.maxMWh) * 100), 5, 100);
          } else {
            // small passive drift if doing nothing
            p.soc = clamp(prev.soc + 0.4, 5, 100);
          }

          p.peakPrice = Math.max(prev.peakPrice || 0, p.sbp);
          p.extremeEvent = event && (event.id === "DUNKEL" || event.id === "CASCADE" || event.id === "CABLE_FIRE" || event.id === "PRICE_SPIKE");

          if (yourResult.accepted || (p.fpn && p.fpn.vol > 0)) {
            p.sessionRevenue = (prev.sessionRevenue || 0) + grossRevenue;
            p.sessionCost = (prev.sessionCost || 0) + grossCost;
            p.dispatchedSPs = (prev.dispatchedSPs || 0) + 1;
            p.dispatchFlash = true;
            p.streakCount = (prev.streakCount || 0) + 1;
            p.bestStreak = Math.max(prev.bestStreak || 0, p.streakCount);
            p.lcStep = 4; // dispatched
            setTimeout(() => setS(s => ({ ...s, dispatchFlash: false, lcStep: 5 })), 1800);
          } else {
            p.sessionRevenue = (prev.sessionRevenue || 0) + dcRev + dmRev + drRev + dfsRev + cmPayment; // Still earn availability fees
            p.missedSPs = (prev.missedSPs || 0) + 1;
            p.streakCount = 0;
            p.lcStep = Math.random() > .5 ? 3 : 2;
          }

          // ── OHLC bar for this SP
          const pClose = prev.priceHist.length ? prev.priceHist[prev.priceHist.length - 1].close : prev.spotPrice;
          const bar = {
            sp: p.sp,
            open: pClose,
            close: p.spotPrice,
            high: Math.max(pClose, p.spotPrice) + Math.random() * 3,
            low: Math.min(pClose, p.spotPrice) - Math.random() * 3,
            volume: p.clearing?.clearedVolume || 0
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
            yourPrice: yourResult.yourPrice,
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

          // Reset intraday trading variables for the newly opened SP window
          p.intradayVolumeAcquired = 0;
          p.intradayCashflow = 0;

        } else {
          // ══ STAGE 0: INTRADAY CONTINUOUS MARKET ══
          // Bilateral continuous matching between commercial parties before Gate Closure.
          const timeToGate = ISEC - p.intervalTimer;
          const urgencyMultiplier = 1 + (1 / (timeToGate + 1)) * 0.5; // Price moves more erratically near gate

          // Estimate a "fundamental" value based on the emerging physical trajectory (NIV)
          const fundamentalValue = (prev.spotPrice || 50) + (-(prev.niv || 0) * 0.05);

          const noise = (Math.random() - 0.5) * 4 * urgencyMultiplier;

          p.intradayPrice = clamp(fundamentalValue + noise, -100, 3000);
          // Spread widens near gate closure as liquidity dries up
          p.intradaySpread = clamp(1 + (1 - timeToGate / ISEC) * 8 + (Math.random() * 1.5), 0.5, 20);

          // between clearing intervals — frequency continues evolving via RoCoF (Layer 1 physics)
          // No new market clearing, but frequency still responds to the persistent NIV
        }

        // ── capture average
        p.capturePx = p.dispatchedSPs > 0
          ? (prev.sessionRevenue || 0) / ((prev.dispatchedSPs || 1) * (prev.userBidVol / 2))
          : 0;


        return p;
      } catch (err) {
        console.error("TICK ERROR:", err.message, err.stack);
        return prev; // fail safe — keep previous state
      }
    });
  }, []); // tick has no external deps — all state is accessed via setS(prev => ...)

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
        conMult,
        p.clearing,
        p.freq,
        p.b6Congested,
        p.sp
      );
      return np;
    });
  };

  const executeIntradayTrade = (dir, mw) => {
    if (INTERVAL_SECS - S.intervalTimer <= 0) return; // Gate closed
    setS(p => {
      const execPrice = dir === "BUY" ? p.intradayPrice + (p.intradaySpread / 2) : p.intradayPrice - (p.intradaySpread / 2);
      // Volume > 0 means discharging/generating (SELL). Volume < 0 means charging (BUY).
      const volDelta = dir === "SELL" ? mw : -mw;
      // SP is 0.5 hours long, so MWh = MW * 0.5
      const cashDelta = dir === "SELL" ? mw * 0.5 * execPrice : -mw * 0.5 * execPrice;
      return {
        ...p,
        intradayVolumeAcquired: p.intradayVolumeAcquired + volDelta,
        intradayCashflow: p.intradayCashflow + cashDelta
      };
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

      {/* ── Cause & Effect SVG Overlay ── */}
      {S.teachingMode && S.teachingStep > 0 && (
        <SVGCauseEffectLines step={S.teachingStep} />
      )}

      <div className={S.teachingMode ? "teaching-active" : ""} style={{
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
            { label: "Interconnectors", val: `${S.interconnectorFlow > 0 ? "+" : ""}${f0(S.interconnectorFlow)} MW`, col: "#c084fc" },
            { label: "Settlement", val: `SP ${S.sp} / 48`, col: "var(--gry)" },
          ].map((item, i) => (
            <div key={i} style={{
              display: "flex", flexDirection: "column", padding: "0 11px",
              borderRight: "1px solid var(--ln)", minWidth: 82
            }}>
              <div style={{ fontSize: 11, color: "var(--gry)", marginBottom: 1 }}>{item.label}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: item.col, lineHeight: 1 }}>{item.val}</div>
            </div>
          ))}

          {/* Gate countdown */}
          <div style={{
            display: "flex", flexDirection: "column", padding: "0 11px",
            borderRight: "1px solid var(--ln)", minWidth: 105,
            background: gateUrgent ? "#f0455a11" : "transparent"
          }}>
            <div style={{ fontSize: 11, color: gateUrgent ? "#f0455a" : "var(--gry)", marginBottom: 1 }}>
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
            borderRight: "1px solid var(--ln)", minWidth: 130
          }}>
            <div style={{ fontSize: 11, color: "var(--gry)", marginBottom: 1 }}>Net Settlement P&L</div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: pnlCol,
              textShadow: `0 0 8px ${pnlCol}66`
            }}>{fPd(S.totalPnl)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 1, fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600 }}>
              <span style={{ color: "#c084fc" }}>DC:{fP(S.dcRevenueTotal || 0, false)}</span>
              <span style={{ color: "#c084fc" }}>SERVICES:£{f0((S.dcRevenueTotal || 0) + (S.dmRevenueTotal || 0) + (S.drRevenueTotal || 0) + (S.dfsRevenueTotal || 0))}</span>
              <span style={{ color: "#1de98b" }}>CM:{fP(S.cmRevenueTotal || 0, false)}</span>
              <span style={{ color: "#f0455a" }}>BSUoS:-{fP(S.bsuosTotal || 0, false)}</span>
            </div>
          </div>

          {/* Your bid summary + Gate Closure */}
          <div style={{
            display: "flex", flexDirection: "column", padding: "0 11px",
            borderRight: "1px solid var(--ln)", minWidth: 140
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--gry)", marginBottom: 1 }}>{S.fpn ? "FPN (Locked)" : "Your Active Bid"}</div>
              {S.fpn && (
                <div style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "#f0455a22", border: "1px solid #f0455a55", color: "#f0455a", fontWeight: 700 }}>
                  🔒 GATE CLOSED
                </div>
              )}
            </div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
              color: yourWillClear ? "#1de98b" : "#f0455a"
            }}>
              {S.userBidDir} £{f2(S.userBidPrice)}/{S.userBidVol}MW · Rank #{yourRank}
              {yourWillClear ? " ✓" : " ✗"}
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {/* Settings toggle */}
            <button onClick={() => setS(p => ({ ...p, showSettings: !p.showSettings }))} style={{
              fontFamily: "var(--mono)", fontSize: 14, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
              background: S.showSettings ? "#f5b22222" : "var(--bg2)",
              border: `1px solid ${S.showSettings ? "#f5b22288" : "var(--ln)"}`,
              color: S.showSettings ? "#f5b222" : "var(--gry)"
            }}>⚙</button>
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

            {/* Educational Mode Toggle */}
            <button onClick={() => S.teachingMode
              ? setS(p => ({ ...p, teachingMode: false, teachingStep: 0 }))
              : startTeachingMode()
            } style={{
              fontFamily: "var(--body)", fontSize: 11, fontWeight: 700, padding: "5px 10px",
              borderRadius: 4, cursor: "pointer",
              background: S.teachingMode ? "#1de98b22" : "var(--bg2)",
              color: S.teachingMode ? "#1de98b" : "var(--gry)",
              border: `1px solid ${S.teachingMode ? "#1de98b" : "var(--ln)"}`,
              display: "flex", alignItems: "center", gap: 5,
              marginLeft: 10
            }}>
              {S.teachingMode ? "🎓 Teaching ON" : "🎓 Teach Me"}
            </button>

            {/* Live Data Toggle */}
            <button onClick={() => setS(p => ({ ...p, useLiveMarket: !p.useLiveMarket }))} style={{
              fontFamily: "var(--body)", fontSize: 11, fontWeight: 700, padding: "5px 10px",
              borderRadius: 4, cursor: "pointer",
              background: S.useLiveMarket ? "#38c0fc22" : "var(--bg2)",
              color: S.useLiveMarket ? "#38c0fc" : "var(--gry)",
              border: `1px solid ${S.useLiveMarket ? "#38c0fc" : "var(--ln)"}`,
              display: "flex", alignItems: "center", gap: 5
            }}>
              {S.useLiveMarket ? "🌐 Live Data ON" : "📴 Offline Sim"}
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

            {/* Chart Toggles */}
            <div style={{ display: "flex", gap: 4, marginLeft: 8, paddingLeft: 8, borderLeft: "1px solid var(--ln)" }}>
              <button title="Toggle Price Chart" onClick={() => setS(p => ({ ...p, showPriceChart: !p.showPriceChart }))} style={{
                cursor: "pointer", background: S.showPriceChart ? "#38c0fc22" : "var(--bg2)", border: `1px solid ${S.showPriceChart ? "#38c0fc66" : "var(--ln)"}`,
                color: S.showPriceChart ? "#38c0fc" : "var(--gry)", borderRadius: 4, padding: "4px 8px", fontSize: 14, display: "flex", alignItems: "center"
              }}>📈</button>
              <button title="Toggle Supply/Demand Chart" onClick={() => setS(p => ({ ...p, showMeritChart: !p.showMeritChart }))} style={{
                cursor: "pointer", background: S.showMeritChart ? "#b78bfa22" : "var(--bg2)", border: `1px solid ${S.showMeritChart ? "#b78bfa66" : "var(--ln)"}`,
                color: S.showMeritChart ? "#b78bfa" : "var(--gry)", borderRadius: 4, padding: "4px 8px", fontSize: 14, display: "center"
              }}>📊</button>
            </div>
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

        {/* ══ MAIN GRID (4-COLUMN CHRONOLOGICAL LAYOUT v2) ══════════════════════════════ */}
        <div style={{
          flex: 1, minHeight: 0, height: 0, display: "grid",
          gridTemplateColumns: "210px 220px 1.5fr 280px",
          gridTemplateRows: "1fr",
          gap: 6, padding: "6px 8px", overflow: "hidden"
        }}>

          {/* ── COL 1: SYSTEM TRIGGERS ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden", minHeight: 0 }}>
            <TeachingFocus active={S.teachingMode && S.teachingStep === 6} stepName="6. ESO CLEARS MARKET" wrapperStyle={{ flex: "0.45", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Panel icon="📡" title="Market Events" accent="#38c0fc"
                subtitle="Events causing price movements and dispatch changes" style={{ flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                  {S.eventLog.length === 0 ? (
                    <div style={{ fontSize: 9, color: "var(--gry)", textAlign: "center", padding: "20px 0" }}>
                      Waiting for market events...
                    </div>
                  ) : S.eventLog.map((ev, i) => (
                    <div key={i} className={i === 0 ? "fadeUp" : ""} style={{
                      padding: "4px 6px", marginBottom: 3, borderRadius: 3,
                      background: "var(--bg2)", border: "1px solid var(--ln)",
                      borderLeft: `3px solid #f5b222`
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--gry)" }}>SP{ev.sp} · {ev.time}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#f5b222" }}>£{f2(ev.price)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--wht)" }}>{ev.text}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </TeachingFocus>

            <TeachingFocus active={S.teachingMode && S.teachingStep === 2} stepName="2. REAL-TIME NIV" wrapperStyle={{ flex: "0 0 auto" }}>
              <Panel icon="⚖" title="Grid Balance (NIV)" accent="#f0455a"
                subtitle="Net Imbalance Volume — how short or long the grid is right now">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <div style={{ fontSize: 10, color: "var(--gry)" }}>Loss of Load Probability (LOLP)</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 800, color: S.lolp > 5 ? "#f0455a" : "var(--dim)", textShadow: S.lolp > 5 ? "0 0 10px #f0455a88" : "none" }}>{f1(S.lolp || 0)}%</div>
                </div>
                <NIVMeter niv={S.niv} activeEvent={S.activeEvent} />
              </Panel>
            </TeachingFocus>

            <TeachingFocus active={S.teachingMode && S.teachingStep === 3} stepName="3. FREQUENCY DROPS" wrapperStyle={{ flex: "0 0 auto" }}>
              <Panel icon="⚡" title="Grid Frequency" accent="#f5b222">
                <FreqGauge freq={S.freq} rocof={S.rocof} />
              </Panel>
            </TeachingFocus>


            <TeachingFocus active={S.teachingMode && S.teachingStep === 4} stepName="4. HARDWARE REFLEX" wrapperStyle={{ flex: "0 0 auto" }}>
              <Panel icon="🔋" title="Battery (BESS)" accent="#1de98b"
                style={{ flex: "0 0 auto", minHeight: 0, overflow: "hidden" }}
                subtitle={
                  <div style={{ display: "flex", gap: 3, alignItems: "center", marginTop: 2 }}>
                    <input type="number" value={S.maxMW} onChange={e => updateBid("maxMW", +e.target.value)}
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

                {/* Battery Metrics Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 3, marginTop: 6 }}>
                  <div style={{ background: "var(--bg3)", padding: 4, borderRadius: 3, border: "1px solid var(--ln)" }}>
                    <div style={{ fontSize: 10, color: "var(--gry)", textTransform: "uppercase", letterSpacing: 0.5 }}>Daily Health</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: S.batteryHealth > 90 ? "#1de98b" : "#f5b222" }}>{f1(S.batteryHealth)}%</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>{f2(S.cycleCount)} Cycles</div>
                  </div>
                  <div style={{ background: "var(--bg3)", padding: 4, borderRadius: 3, border: "1px solid var(--ln)" }}>
                    <div style={{ fontSize: 10, color: "var(--gry)", textTransform: "uppercase", letterSpacing: 0.5 }}>Service Revenue</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#c084fc" }}>£{f0((S.dcRevenueTotal || 0) + (S.dmRevenueTotal || 0) + (S.drRevenueTotal || 0) + (S.dfsRevenueTotal || 0))}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>DC/DM/DR/DFS</div>
                  </div>
                </div>

                {/* Service Breakdown (Mini) */}
                <div style={{ marginTop: 4, display: "flex", gap: 4, opacity: 0.8 }}>
                  <div style={{ fontSize: 10, color: "var(--gry)" }}>DC: <span style={{ color: "#c084fc" }}>£{f0(S.dcRevenueTotal)}</span></div>
                  <div style={{ fontSize: 10, color: "var(--gry)" }}>DM: <span style={{ color: "#38c0fc" }}>£{f0(S.dmRevenueTotal)}</span></div>
                  <div style={{ fontSize: 10, color: "var(--gry)" }}>DR: <span style={{ color: "#1de98b" }}>£{f0(S.drRevenueTotal)}</span></div>
                </div>

                {/* Active DFR Contracts (Day-Ahead MILP) */}
                <div style={{ marginTop: 6, padding: "5px 6px", background: "var(--bg3)", borderRadius: 4, border: "1px solid var(--ln)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>DA MILP ALLOCATIONS</div>
                    <div style={{ fontSize: 11, color: "var(--wht)", fontWeight: 700, opacity: 0.7 }}>Block {getEFABlock(S.sp).block}</div>
                  </div>

                  <div style={{ minHeight: 45 }}>
                    {S.activeDfr ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 6px" }}>
                        {Object.entries(S.activeDfr).filter(([k, v]) => v > 0).map(([key, val]) => (
                          <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--mono)", color: key.includes("DC") ? "#c084fc" : key.includes("DM") ? "#38c0fc" : "#1de98b" }}>
                            <span>{key.replace("_", " ")}</span>
                            <span style={{ fontWeight: 700 }}>{val}MW</span>
                          </div>
                        ))}
                        {Object.values(S.activeDfr).reduce((a, b) => a + b, 0) === 0 && (
                          <div style={{ gridColumn: "span 2", fontSize: 9, color: "var(--dim)", fontStyle: "italic", textAlign: "center", paddingTop: 10 }}>No active contracts</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: "var(--dim)", fontStyle: "italic", textAlign: "center", paddingTop: 10 }}>No active contracts</div>
                    )}
                  </div>

                  {S.dfrDispatched !== 0 && (
                    <div style={{ marginTop: 4, padding: "2px 6px", borderRadius: 2, background: "#f5b22218", border: "1px solid #f5b22255", fontSize: 11, fontWeight: 700, color: "#f5b222", animation: "blink 0.8s ease-in-out infinite", textAlign: "center" }}>
                      ⚡ {f1(Math.abs(S.dfrDispatched))}MW {S.dfrDispatched > 0 ? "UPSIDE" : "DOWNSIDE"} ACTION
                    </div>
                  )}
                </div>
              </Panel>
            </TeachingFocus>

          </div>

          {/* ── COL 2: ASSET REACTION ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden", minHeight: 0 }}>
            <TeachingFocus active={S.teachingMode && S.teachingStep === 8} stepName="8. AI LEARNS" wrapperStyle={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <Panel icon="🎛" title={S.rlEnabled && S.running ? "AI Bid Engine (RL)" : "Your Bid Settings"} accent="#f5b222"
                style={{ flex: 1, minHeight: 0 }}
                subtitle={S.rlEnabled && S.running ? "Q-Learning Agent actively trading" : "Set price & volume — affects your rank in the merit order"}>

                {S.rlEnabled && S.running ? (
                  // RL VISUALIZER
                  <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--gry)" }}>CURRENT STATE</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#b78bfa" }}>[{S.rlState}]</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--gry)" }}>AI STRATEGY</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: S.rlEpsilon > Math.random() ? "#38c0fc" : "#1de98b" }}>
                          {S.rlEpsilon > Math.random() ? "EXPLORING" : "EXPLOITING"}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "var(--gry)", marginBottom: 4 }}>ACTION Q-VALUES</div>
                    <div style={{ display: "grid", gap: 3 }}>
                      {RL_ACTIONS.map((act, i) => {
                        const isChosen = S.rlAction === i;
                        const qv = rlQVals[i] || 0;
                        return (
                          <div key={i} style={{
                            display: "flex", justifyContent: "space-between", padding: "4px 8px", borderRadius: 3,
                            background: isChosen ? "#f5b22222" : "var(--bg3)", border: `1px solid ${isChosen ? "#f5b222" : "var(--ln)"}`
                          }}>
                            <div style={{ fontSize: 11, color: isChosen ? "#f5b222" : "var(--wht)", fontWeight: isChosen ? 700 : 400 }}>{act.name}</div>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: isChosen ? "#f5b222" : "var(--gry)" }}>Q: {qv.toFixed(0)}</div>
                          </div>
                        )
                      })}
                    </div>

                    {/* FORECAST HORIZON PANEL */}
                    {S.forecastHorizon && S.shadowPriceMeta && (
                      <div style={{ marginTop: 6, padding: "6px", background: "var(--bg3)", borderRadius: 4, border: "1px solid #b78bfa66" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <div style={{ fontSize: 8, color: "#b78bfa", fontWeight: 700 }}>🔮 FORECAST HORIZON & SHADOW PRICE</div>
                          <div style={{ fontSize: 8, color: "var(--gry)" }}>{S.forecastHorizon.opportunityShape.replace('_', ' ')}</div>
                        </div>

                        {/* Horizon bars */}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 3, marginBottom: 6 }}>
                          {S.forecastHorizon.horizons.map((h, i) => {
                            const maxP = Math.max(...S.forecastHorizon.horizons.map(hx => hx.forecastedPrice));
                            const heightPct = Math.max(10, (h.forecastedPrice / maxP) * 100);
                            return (
                              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                                <div style={{ fontSize: 7, color: "var(--gry)" }}>+{h.delta} SP</div>
                                <div style={{ fontSize: 8, fontFamily: "var(--mono)", color: "var(--wht)", fontWeight: 600 }}>£{f0(h.forecastedPrice)}</div>
                                <div style={{ height: 20, width: "100%", background: "var(--bg2)", borderRadius: 2, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
                                  <div style={{ width: "100%", height: `${heightPct}%`, background: "#b78bfa", opacity: h.confidence }} />
                                </div>
                                <div style={{ fontSize: 7, color: "var(--gry)" }}>{Math.round(h.confidence * 100)}%</div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Shadow Price Verdict */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 6 }}>
                          <div>
                            <div style={{ fontSize: 7, color: "var(--gry)" }}>Internal Shadow P.</div>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "#f5b222" }}>£{f0(S.shadowPriceMeta.shadowPrice)} / MWh</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 7, color: "var(--gry)" }}>Agent Strategy</div>
                            <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, color: "var(--wht)" }}>{S.shadowPriceMeta.recommendation.replace(/_/g, ' ')}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 6, padding: "6px", background: "var(--bg2)", borderRadius: 4, border: "1px solid var(--ln)" }}>
                      <div style={{ fontSize: 9, color: "var(--gry)", marginBottom: 2 }}>SUBMITTED BID</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 800, color: S.userBidDir === "SELL" ? "#f5b222" : "#38c0fc" }}>
                        {S.userBidVol === 0 ? "HOLDING" : `${S.userBidDir} ${f0(S.userBidVol)}MW @ £${f2(S.userBidPrice)}`}
                      </div>
                    </div>

                    <button onClick={() => setS(p => ({ ...p, rlEnabled: false }))} style={{ marginTop: "auto", padding: 6, background: "var(--bg3)", border: "1px solid var(--ln)", borderRadius: 4, color: "var(--wht)", cursor: "pointer", fontSize: 10 }}>
                      Disable AI Agent
                    </button>
                  </div>
                ) : (
                  // MANUAL UI
                  <>
                    {/* ── BM BID PANEL ── */}
                    <div style={{ marginBottom: 10, padding: "6px", background: "var(--bg1)", borderRadius: 4, border: "1px solid #c084fc66" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ fontSize: 9, color: "#c084fc", fontWeight: 700 }}>STAGE 0: INTRADAY MARKET</div>
                        <div style={{ fontSize: 9, color: "var(--wht)", fontFamily: "var(--mono)", fontWeight: 700 }}>
                          Live: £{f2(S.intradayPrice)}
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 8 }}>
                        <span style={{ color: "var(--gry)" }}>Spread: £{f2(S.intradaySpread)}</span>
                        <span style={{ color: "var(--gry)" }}>Bid £{f2(S.intradayPrice - S.intradaySpread / 2)} / Ask £{f2(S.intradayPrice + S.intradaySpread / 2)}</span>
                      </div>

                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button
                          onClick={() => executeIntradayTrade("SELL", 10)}
                          disabled={gateUrgent && gateCountdown <= 0}
                          style={{
                            flex: 1, padding: "4px 0", borderRadius: 4, border: "1px solid #f5b222",
                            background: "#f5b22222", color: "#f5b222",
                            fontFamily: "var(--body)", fontSize: 10, fontWeight: 700, cursor: gateCountdown > 0 ? "pointer" : "not-allowed",
                            opacity: gateCountdown > 0 ? 1 : 0.5
                          }}>SELL 10MW<br />@ £{f0(S.intradayPrice - S.intradaySpread / 2)}</button>

                        <button
                          onClick={() => executeIntradayTrade("BUY", 10)}
                          disabled={gateUrgent && gateCountdown <= 0}
                          style={{
                            flex: 1, padding: "4px 0", borderRadius: 4, border: "1px solid #38c0fc",
                            background: "#38c0fc22", color: "#38c0fc",
                            fontFamily: "var(--body)", fontSize: 10, fontWeight: 700, cursor: gateCountdown > 0 ? "pointer" : "not-allowed",
                            opacity: gateCountdown > 0 ? 1 : 0.5
                          }}>BUY 10MW<br />@ £{f0(S.intradayPrice + S.intradaySpread / 2)}</button>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px", background: "var(--bg3)", borderRadius: 3, border: "1px solid var(--ln)" }}>
                        <div style={{ fontSize: 8, color: "var(--gry)" }}>Locked FPN:<br /><span style={{ fontSize: 10, color: "var(--wht)", fontFamily: "var(--mono)", fontWeight: 700 }}>{f1(S.intradayVolumeAcquired)} MW</span></div>
                        <div style={{ fontSize: 8, color: "var(--gry)", textAlign: "right" }}>Locked Cash:<br /><span style={{ fontSize: 10, color: S.intradayCashflow >= 0 ? "#1de98b" : "#f0455a", fontFamily: "var(--mono)", fontWeight: 700 }}>{fPd(S.intradayCashflow)}</span></div>
                      </div>
                    </div>

                    {/* ── BM BID PANEL ── */}
                    <div style={{ padding: "6px", background: "var(--bg2)", borderRadius: 4, border: "1px solid var(--ln)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ fontSize: 9, color: "var(--gry)", fontWeight: 700 }}>STAGE 2: BM OFFER</div>
                        <div style={{ fontSize: 9, color: "var(--gry)" }}>Queued for Gate Closure</div>
                      </div>

                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <button onClick={() => updateBid("userBidDir", "SELL")} style={{
                          flex: 1, padding: "2px 0", borderRadius: 3, border: `1px solid ${S.userBidDir === "SELL" ? "#f5b222" : "var(--ln)"}`,
                          background: S.userBidDir === "SELL" ? "#f5b22222" : "transparent",
                          color: S.userBidDir === "SELL" ? "#f5b222" : "var(--gry)",
                          fontFamily: "var(--body)", fontSize: 9, fontWeight: 700, cursor: "pointer"
                        }}>OFFER GEN (Sell)</button>
                        <button onClick={() => updateBid("userBidDir", "BUY")} style={{
                          flex: 1, padding: "2px 0", borderRadius: 3, border: `1px solid ${S.userBidDir === "BUY" ? "#38c0fc" : "var(--ln)"}`,
                          background: S.userBidDir === "BUY" ? "#38c0fc22" : "transparent",
                          color: S.userBidDir === "BUY" ? "#38c0fc" : "var(--gry)",
                          fontFamily: "var(--body)", fontSize: 9, fontWeight: 700, cursor: "pointer"
                        }}>BID DEMAND (Buy)</button>
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <div style={{ fontSize: 9, color: "var(--gry)" }}>Offer Price</div>
                          <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: S.userBidDir === "SELL" ? "#f5b222" : "#38c0fc" }}>
                            {fP(S.userBidPrice, true)}/MWh
                          </div>
                        </div>
                        <input type="range" min={-50} max={1500} step={1}
                          value={S.userBidPrice}
                          onChange={e => updateBid("userBidPrice", +e.target.value)}
                          style={{ width: "100%", accentColor: S.userBidDir === "SELL" ? "#f5b222" : "#38c0fc", height: 12 }} />
                      </div>

                      <div style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <div style={{ fontSize: 9, color: "var(--gry)" }}>BM Volume</div>
                          <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--wht)" }}>{S.userBidVol} MW</div>
                        </div>
                        {(() => {
                          const bounds = usableBounds;
                          const maxSellMW = Math.round(Math.min(S.maxMW, (S.soc / 100 * S.maxMWh - bounds.effectiveMin_MWh) * 2));
                          const maxBuyMW = Math.round(Math.min(S.maxMW, (bounds.effectiveMax_MWh - S.soc / 100 * S.maxMWh) * 2));
                          const maxAvailable = Math.max(0, (S.userBidDir === "SELL" ? maxSellMW : maxBuyMW) - Math.abs(S.intradayVolumeAcquired));
                          return (
                            <input type="range" min={0} max={maxAvailable} step={1}
                              value={Math.min(S.userBidVol, maxAvailable)}
                              onChange={e => updateBid("userBidVol", +e.target.value)}
                              style={{ width: "100%", accentColor: "var(--wht)", height: 12 }} />
                          );
                        })()}
                      </div>
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
            </TeachingFocus>

            <TeachingFocus active={S.teachingMode && S.teachingStep === 5} stepName="5. THE MARKET SOLUTION" wrapperStyle={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Panel icon="🔄" title="Bid Lifecycle" accent="#b78bfa"
                subtitle="Follow your current bid from creation to payment" style={{ flex: 1 }}>
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
            </TeachingFocus>

          </div>

          {/* ── COL 3: GRAPHS (TOP) + CURVES (BOTTOM) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden", minHeight: 0 }}>
            {/* TOP ROW: Two graphs side-by-side */}
            <div style={{ flex: "1", display: "flex", flexDirection: "row", gap: 3, overflow: "hidden", minHeight: 0 }}>
              <TeachingFocus active={S.teachingMode && S.teachingStep === 6} stepName="6. THE ECONOMIC ENGINE" wrapperStyle={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <Panel icon="📊" title="Supply & Demand Intercept" accent="#b78bfa" style={{ flex: 1, minHeight: 0, padding: 0 }} noScroll>
                  <div style={{ width: "100%", height: "100%", padding: 6, boxSizing: "border-box" }}>
                    <MeritOrderChart supply={S.marketCurves?.supply} demand={S.marketCurves?.demand} sbp={S.spotPrice} qClear={S.clearing?.clearedVolume || 0} />
                  </div>
                </Panel>
              </TeachingFocus>
              {S.showPriceChart && (
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <Panel icon="📈" title="Electricity Price — OHLC Chart" accent="#38c0fc"
                    subtitle={`Each candle = one 30-min period. Green = price rose, Red = fell.`}
                    style={{ flex: 1, minHeight: 0 }} noScroll>
                    <OHLCChart bars={S.priceHist} sbp={S.sbp} ssp={S.ssp} currentPrice={S.spotPrice} />
                  </Panel>
                </div>
              )}
            </div>

            {/* BOTTOM ROW: Two curves side-by-side */}
            <div style={{ flex: "1.2", display: "flex", flexDirection: "row", gap: 3, overflow: "hidden", minHeight: 0 }}>
              <Panel icon="🏆" title="Supply Curve" accent="#f5b222"
                style={{ flex: 1, minWidth: 0 }}
                subtitle={
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Cheapest energy clears first</span>
                    {!S.useLiveMarket && (
                      <span style={{ background: "#f5b22222", padding: "1px 4px", borderRadius: 4, border: "1px solid #f5b22255", color: "#f5b222", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, marginLeft: 6 }}>
                        AI Gen: {GEN_ACTIONS[S.genAction]?.name?.split(" ")[0]}
                      </span>
                    )}
                  </div>
                }>
                <div style={{
                  display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 46px 52px", gap: 3,
                  fontSize: 8, color: "var(--gry)", padding: "2px 4px", borderBottom: "1px solid var(--ln)", marginBottom: 3
                }}>
                  <span>#</span><span>Participant</span><span>£/MWh</span><span>MW</span><span>Type</span><span>Status</span>
                </div>
                <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                  {(S.marketCurves?.supply || []).map((m, i) => {
                    const col = m.color || "#888";
                    const isClearing = Math.abs(m.price - S.sbp) < 3;
                    return (
                      <div key={m.id} className={i === 0 ? "fadeUp" : ""} style={{
                        display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 46px 52px", gap: 3,
                        padding: "3px 4px", marginBottom: 0, borderRadius: 2, alignItems: "center",
                        background: m.isYou ? "#f5b22210" : m.accepted ? "#1de98b06" : "#f0455a06",
                        border: `1px solid ${m.isYou ? "#f5b22244" : m.accepted ? "#1de98b22" : "#f0455a22"}`,
                        borderLeft: `2px solid ${m.isYou ? "#f5b222" : m.accepted ? "#1de98b" : "#f0455a33"}`,
                        transition: "all .5s ease"
                      }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", fontWeight: 700 }}>{m.rank}</span>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <div style={{ fontSize: 11, fontWeight: m.isYou ? 800 : 500, color: m.isYou ? "#f5b222" : "var(--wht)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                          <div style={{ fontSize: 8, color: col }}>{m.type}</div>
                        </div>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                          color: m.price > S.sbp ? "#f0455a" : "#1de98b"
                        }}>£{f1(m.price)}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gry)" }}>{f0(m.mw)} MW</span>
                        <Chip col={col} style={{ fontSize: 8, padding: "2px 4px" }}>{m.type}</Chip>
                        <Chip col={m.constrained ? "#f5b222" : m.isBalancingAction ? "#c084fc" : m.accepted ? "#1de98b" : "#f0455a"} style={{ fontSize: 8, padding: "2px 4px" }}>
                          {m.constrained ? "⚠ Skip" : m.isBalancingAction ? `⚡ BOA` : m.accepted ? `✓ Accept` : "✗ Skip"}
                        </Chip>
                      </div>
                    );
                  })}
                </div>
                <div style={{
                  marginTop: 3, padding: "2px 6px", borderRadius: 3,
                  background: "#f5b22210", border: "1px solid #f5b22233",
                  fontFamily: "var(--mono)", fontSize: 10, color: "#f5b222",
                  textAlign: "center"
                }}>
                  ── Final Balancing Price £{f2(S.sbp)}/MWh ──
                </div>
              </Panel>

              <Panel icon="🛒" title="Demand Curve" accent="#38c0fc"
                style={{ flex: 1, minWidth: 0 }}
                subtitle={
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Highest willingness clears first</span>
                    {!S.useLiveMarket && (
                      <span style={{ background: "#38c0fc22", padding: "1px 4px", borderRadius: 4, border: "1px solid #38c0fc55", color: "#38c0fc", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, marginLeft: 6 }}>
                        AI Con: {CON_ACTIONS[S.conAction]?.name?.split(" ")[0]}
                      </span>
                    )}
                  </div>
                }>
                <div style={{
                  display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 46px 52px", gap: 3,
                  fontSize: 8, color: "var(--gry)", padding: "2px 4px", borderBottom: "1px solid var(--ln)", marginBottom: 3
                }}>
                  <span>#</span><span>Participant</span><span>£/MWh</span><span>MW</span><span>Type</span><span>Status</span>
                </div>
                <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                  {(S.marketCurves?.demand || []).map((m, i) => {
                    const col = m.color || "#888";
                    return (
                      <div key={m.id} className={i === 0 ? "slideLeft" : ""} style={{
                        display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 46px 52px", gap: 3,
                        padding: "3px 4px", marginBottom: 0, borderRadius: 2, alignItems: "center",
                        background: m.isYou ? "#38c0fc10" : (m.price >= S.sbp || m.isBalancingAction || m.accepted) ? "#1de98b06" : "#f0455a06",
                        border: `1px solid ${m.isYou ? "#38c0fc44" : (m.price >= S.sbp || m.isBalancingAction || m.accepted) ? "#1de98b22" : "#f0455a22"}`,
                        borderLeft: `2px solid ${m.isYou ? "#38c0fc" : (m.price >= S.sbp || m.isBalancingAction || m.accepted) ? "#1de98b" : "#f0455a33"}`,
                        transition: "all .5s ease"
                      }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", fontWeight: 700 }}>{m.rank}</span>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <div style={{ fontSize: 11, fontWeight: m.isYou ? 800 : 500, color: m.isYou ? "#38c0fc" : "var(--wht)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                          <div style={{ fontSize: 8, color: col }}>{m.type}</div>
                        </div>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                          color: m.price < S.sbp ? "#f0455a" : "#1de98b"
                        }}>£{f1(m.price)}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gry)" }}>{f0(m.mw)} MW</span>
                        <Chip col={col} style={{ fontSize: 8, padding: "2px 4px" }}>{m.type}</Chip>
                        <Chip col={m.isBalancingAction ? "#c084fc" : m.accepted ? "#1de98b" : "#f0455a"} style={{ fontSize: 8, padding: "2px 4px" }}>
                          {m.isBalancingAction ? `⚡ BOA` : m.accepted ? `✓ Accept` : "✗ Skip"}
                        </Chip>
                      </div>
                    );
                  })}
                </div>
                <div style={{
                  marginTop: 3, padding: "2px 6px", borderRadius: 3,
                  background: "#38c0fc10", border: "1px solid #38c0fc33",
                  fontFamily: "var(--mono)", fontSize: 10, color: "#38c0fc",
                  textAlign: "center"
                }}>
                  ── Final Balancing Price £{f2(S.sbp)}/MWh ──
                </div>
              </Panel>
            </div>
          </div>

          {/* ── COL 4: P&L + RESULTS (NARROW VERTICAL) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden", minHeight: 0 }}>
            <TeachingFocus active={S.teachingMode && S.teachingStep === 7} stepName="7. FINANCIAL SETTLEMENT" wrapperStyle={{ flex: "0 0 auto" }}>
              <Panel icon="💰" title="Your P&L" accent="#1de98b"
                subtitle="Treating energy as inventory across time">
                <div style={{ textAlign: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--gry)", marginBottom: 2 }}>PORTFOLIO VALUE (Cash Bank + Inventory Value)</div>
                  <div style={{
                    fontFamily: "var(--body)", fontSize: 22, fontWeight: 900, color: pnlCol, lineHeight: 1,
                    textShadow: `0 0 20px ${pnlCol}66`
                  }}>{S.totalPnl + ((S.soc / 100) * S.maxMWh * S.sbp) >= 0 ? "+" : "-"}£{f0(Math.abs(S.totalPnl + ((S.soc / 100) * S.maxMWh * S.sbp)))}</div>
                  <div style={{ fontSize: 11, color: "var(--gry)", marginTop: 2 }}>
                    {totalAccepted} of {totalSPs} periods dispatched
                    {totalSPs > 0 ? ` (${Math.round(totalAccepted / totalSPs * 100)}% hit rate)` : ""}
                  </div>
                </div>
                <Stat label="Realised Cash" value={S.totalPnl >= 0 ? `+£${f0(S.totalPnl)}` : `-£${f0(Math.abs(S.totalPnl))}`} col={S.totalPnl >= 0 ? "#1de98b" : "#f0455a"} hint="Drops when buying, rises when selling" />
                <Stat label="Inventory" value={`£${f0((S.soc / 100) * S.maxMWh * S.sbp)}`} col="#b78bfa" hint="Stored Energy × Current Price" />
                <Stat label="Accepted" value={`${S.dispatchedSPs || 0} SPs`} col="#1de98b" />
                <Stat label="Missed" value={`${S.missedSPs || 0} SPs`} col="#f0455a" />
                <Stat label="Deg. Cost" value={`£${f0(S.marginalCost)}/MWh`} col="#f5b222" />
                {histRevs.length > 1 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 10, color: "var(--gry)", marginBottom: 2 }}>Profit per SP (£)</div>
                    <Spark data={histRevs.slice().reverse()} w={180} h={30} color="#1de98b" />
                  </div>
                )}
              </Panel>
            </TeachingFocus>

            <Panel icon="📊" title="Results by Period" accent="#b78bfa"
              subtitle="Your outcome each settlement period" style={{ flex: 1, minHeight: 0 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "24px 34px 1fr 48px", gap: 2,
                fontSize: 10, color: "var(--gry)", padding: "1px 0", borderBottom: "1px solid var(--ln)", marginBottom: 2
              }}>
                <span>SP</span><span>NIV</span><span>Result</span><span style={{ textAlign: "right" }}>Revenue</span>
              </div>
              <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                {S.spHistory.slice(0, 16).map((rec, i) => (
                  <div key={i} className={i === 0 ? "fadeUp" : ""} style={{
                    display: "grid", gridTemplateColumns: "24px 34px 1fr 48px", gap: 2,
                    padding: "2px 0", borderBottom: "1px solid var(--ln)", alignItems: "center", fontSize: 11
                  }}>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--gry)", fontSize: 10 }}>{rec.sp}</span>
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: 10,
                      color: rec.niv < 0 ? "#f0455a" : "#1de98b"
                    }}>{rec.niv > 0 ? "+" : ""}{f0(rec.niv)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      {rec.eventIcon && <span style={{ fontSize: 10 }}>{rec.eventIcon}</span>}
                      <span style={{ fontSize: 10, color: rec.yourAccepted ? "#1de98b" : "#f0455a77", fontWeight: rec.yourAccepted ? 600 : 400 }}>
                        {rec.yourAccepted ? `✓ ${f0(rec.yourMW)}MW @ £${f1(rec.yourPrice || rec.clearingPrice)}` : "✗ Not dispatched"}
                      </span>
                    </div>
                    <div style={{
                      textAlign: "right", fontFamily: "var(--mono)", fontSize: 10,
                      color: rec.yourAccepted ? (rec.yourRevenue >= 0 ? "#1de98b" : "#f0455a") : "var(--fnt)"
                    }}>
                      {rec.yourAccepted ? (rec.yourRevenue >= 0 ? `+£${f0(rec.yourRevenue)}` : `-£${f0(Math.abs(rec.yourRevenue))}`) : "—"}
                    </div>
                  </div>
                ))}
                {S.spHistory.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--gry)", textAlign: "center", padding: "12px 0" }}>
                    Waiting for first clearing...
                  </div>
                )}
              </div>
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

      {/* ⚙ Floating Settings Overlay */}
      {
        S.showSettings && (
          <>
            <div onClick={() => setS(s => ({ ...s, showSettings: false }))} style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999
            }} />
            <div style={{
              position: "fixed", top: 48, right: 12, width: 260, maxHeight: "calc(100vh - 72px)",
              background: "rgba(20,22,30,0.95)", backdropFilter: "blur(16px)",
              border: "1px solid var(--ln)", borderRadius: 8, zIndex: 1000,
              padding: "14px 16px", overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--wht)", fontFamily: "var(--body)" }}>⚙ Grid Settings</div>
                <button onClick={() => setS(s => ({ ...s, showSettings: false }))} style={{
                  background: "none", border: "none", color: "var(--gry)", fontSize: 16, cursor: "pointer", padding: "0 4px"
                }}>×</button>
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 10 }}>Live-adjustable market and physics parameters</div>
              {[
                { key: "degradationCost", label: "BESS Degradation", unit: "£/MWh", min: 1, max: 50, step: 1, col: "#f5b222" },
                { key: "voll", label: "VoLL (Ofgem)", unit: "£/MWh", min: 1000, max: 10000, step: 500, col: "#f0455a" },
                { key: "dcRate", label: "DC Rate", unit: "£/MW/hr", min: 1, max: 40, step: 1, col: "#c084fc" },
                { key: "dmRate", label: "DM Rate", unit: "£/MW/hr", min: 1, max: 25, step: 1, col: "#38c0fc" },
                { key: "drRate", label: "DR Rate", unit: "£/MW/hr", min: 1, max: 25, step: 1, col: "#1de98b" },
                { key: "dfsRate", label: "DFS Rate", unit: "£/MW/hr", min: 1, max: 25, step: 1, col: "#f5b222" },
                { key: "cmRatePerSP", label: "CM Payment", unit: "£/MW/SP", min: 0, max: 10, step: 0.5, col: "#1de98b" },
                { key: "bsuosRate", label: "BSUoS Levy", unit: "£/MWh", min: 0, max: 30, step: 1, col: "#f0455a" },
                { key: "inertiaConstant", label: "System Inertia", unit: "GW·s", min: 2, max: 8, step: 0.5, col: "#f5b222" },
                { key: "systemSizeGW", label: "System Size", unit: "GW", min: 20, max: 50, step: 1, col: "#38c0fc" },
              ].map(({ key, label, unit, min, max, step, col }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: "var(--gry)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: col }}>{S.config[key]}{unit.startsWith("£") ? "" : " "}{unit}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={S.config[key]}
                    onChange={e => {
                      const v = +e.target.value;
                      setS(s => ({
                        ...s,
                        config: { ...s.config, [key]: v },
                        marginalCost: key === "degradationCost" ? v : s.marginalCost
                      }));
                    }}
                    style={{ width: "100%", accentColor: col, height: 14 }} />
                </div>
              ))}
              <button onClick={() => setS(s => ({ ...s, config: { ...GRID_CONFIG }, marginalCost: GRID_CONFIG.degradationCost }))}
                style={{ marginTop: 6, width: "100%", padding: 5, background: "var(--bg3)", border: "1px solid var(--ln)", borderRadius: 3, color: "var(--gry)", fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
                ↻ Reset to GB Defaults
              </button>
            </div>
          </>
        )
      }

      {/* ── Teaching Overlay ── */}
      {
        S.teachingMode && S.teachingStep > 0 && (
          <ESOAnalystPanel
            step={S.teachingStep}
            S={S}
            onNext={() => advanceTeachingStep(1)}
            onPrev={() => advanceTeachingStep(-1)}
            onExit={() => setS(p => ({ ...p, teachingMode: false, teachingStep: 0 }))}
          />
        )
      }
    </>
  );
}
