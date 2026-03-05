import { useState, useEffect } from "react";
import { f0, f1 } from "../../shared/utils";
import { Tip } from "./Tip";

/* ─── SUPPLY & DEMAND CURVE ─── */
export default function SupplyDemandCurve({ allBids, market, simRes }) {
  const { niv } = market; const nivAbs = Math.abs(niv);
  const [popKey, setPopKey] = useState(0);
  useEffect(() => { setPopKey(k => k + 1); }, [simRes.cp]);
  const offers = [...allBids.filter(b => b.side === "offer" && +b.mw > 0 && !isNaN(+b.price))].sort((a, b) => +a.price - +b.price);
  const bids = [...allBids.filter(b => b.side === "bid" && +b.mw > 0 && !isNaN(+b.price))].sort((a, b) => +b.price - +a.price);
  const buildSteps = items => { const steps = []; let cum = 0; for (const o of items) { steps.push([cum, +o.price]); cum += +o.mw; steps.push([cum, +o.price]); } if (steps.length) steps.push([cum + 20, steps[steps.length - 1][1]]); return steps; };
  const supplySteps = buildSteps(offers), demandSteps = buildSteps(bids);
  const allPrices = [...offers, ...bids].map(b => +b.price);
  if (allPrices.length === 0) return <div style={{ background: "#08141f", border: "1px solid #1a3045", borderRadius: 8, padding: 12, textAlign: "center", color: "#2a5570", fontSize: 8.5 }}>Waiting for bids to build the supply & demand curve…</div>;
  const W = 460, H = 148, PAD = { top: 12, bottom: 22, left: 36, right: 12 };
  const CW = W - PAD.left - PAD.right, CH = H - PAD.top - PAD.bottom;
  const allMW = [...supplySteps, ...demandSteps].map(([mw]) => mw);
  const minP = Math.max(0, Math.min(...allPrices) * 0.78), maxP = Math.max(...allPrices) * 1.18, pRange = maxP - minP || 1;
  const maxMW = Math.max(...allMW, nivAbs * 1.3, 60);
  const xS = mw => PAD.left + (mw / maxMW) * CW, yS = p => PAD.top + (1 - (p - minP) / pRange) * CH;
  const mkPath = steps => steps.length > 1 ? "M " + steps.map(([mw, p]) => `${xS(mw).toFixed(1)},${yS(p).toFixed(1)}`).join(" L ") : "";
  const supPath = mkPath(supplySteps), demPath = mkPath(demandSteps);
  const clMW = simRes.cleared || 0;
  const accPts = supplySteps.filter(([mw]) => mw <= clMW), lastAccPt = supplySteps.find(([mw]) => mw > clMW);
  let accPath = "";
  if (accPts.length > 0) { const pts = [...accPts]; if (lastAccPt) pts.push([clMW, lastAccPt[1]]); accPath = `M ${xS(0).toFixed(1)},${yS(minP).toFixed(1)} ` + pts.map(([mw, p]) => `L ${xS(mw).toFixed(1)},${yS(p).toFixed(1)}`).join(" ") + ` L ${xS(clMW).toFixed(1)},${yS(minP).toFixed(1)} Z`; }
  const clearX = xS(nivAbs), clearY = simRes.cp ? yS(simRes.cp) : null;
  const gridPs = [0, 0.25, 0.5, 0.75, 1].map(t => minP + t * pRange);
  const gridMWs = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(maxMW * t));
  return (
    <div style={{ background: "#08141f", border: "1px solid #1a3045", borderRadius: 8, padding: "5px 0 2px", flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 10px", marginBottom: 1 }}>
        <Tip text="Step-function merit order curve. Supply (red) = offers sorted cheapest first. Demand (green) = bids sorted highest first. NIV line (yellow) = exogenous grid requirement. Clearing circle = dispatched MW × price.">
          <span style={{ fontSize: 8.5, color: "#4d7a96", textTransform: "uppercase", letterSpacing: .8, borderBottom: "1px dashed #2a5570", cursor: "help" }}>⚡ Supply & Demand · Merit Order</span>
        </Tip>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 7.5, color: "#f0455a" }}>▬ Supply</span>
          <span style={{ fontSize: 7.5, color: "#1de98b" }}>▬ Demand</span>
          <span style={{ fontSize: 7.5, color: "#f5b222" }}>╎ NIV</span>
          {simRes.cp && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, fontWeight: 800, color: "#38c0fc" }}>CP £{f1(simRes.cp)}</span>}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
        {gridPs.map((p, i) => (<g key={i}><line x1={PAD.left} y1={yS(p)} x2={W - PAD.right} y2={yS(p)} stroke="#1a3045" strokeWidth="0.5" /><text x={PAD.left - 3} y={yS(p) + 3} fontSize="6.5" fill="#2a5570" textAnchor="end" fontFamily="JetBrains Mono">£{Math.round(p)}</text></g>))}
        {gridMWs.filter((_, i) => i % 2 === 0).map((mw, i) => (<g key={i}><line x1={xS(mw)} y1={PAD.top} x2={xS(mw)} y2={H - PAD.bottom} stroke="#1a3045" strokeWidth="0.5" /><text x={xS(mw)} y={H - PAD.bottom + 9} fontSize="6.5" fill="#2a5570" textAnchor="middle">{mw}MW</text></g>))}
        {accPath && <path d={accPath} fill="#38c0fc" opacity="0.12" />}
        {supPath && <path d={supPath + " L " + xS(supplySteps[supplySteps.length - 1]?.[0] || 0) + "," + yS(minP) + " L " + xS(0) + "," + yS(minP) + " Z"} fill="#f0455a" opacity="0.07" />}
        {demPath && <path d={demPath + " L " + xS(demandSteps[demandSteps.length - 1]?.[0] || 0) + "," + yS(minP) + " L " + xS(0) + "," + yS(minP) + " Z"} fill="#1de98b" opacity="0.07" />}
        {supPath && <path d={supPath} fill="none" stroke="#f0455a" strokeWidth="2.2" strokeLinejoin="round" />}
        {demPath && <path d={demPath} fill="none" stroke="#1de98b" strokeWidth="2.2" strokeLinejoin="round" />}
        <line x1={clearX} y1={PAD.top} x2={clearX} y2={H - PAD.bottom} stroke="#f5b222" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x={clearX + 3} y={PAD.top + 9} fontSize="7" fill="#f5b222" fontWeight="700">{Math.round(nivAbs)}MW</text>
        {clearY && <line x1={PAD.left} y1={clearY} x2={clearX} y2={clearY} stroke="#38c0fc" strokeWidth="1.2" strokeDasharray="4,3" />}
        {clearY && (<g key={popKey} className="clear-pop" style={{ transformOrigin: `${clearX}px ${clearY}px` }}><circle cx={clearX} cy={clearY} r="8" fill="#050e16" stroke="#38c0fc" strokeWidth="2.5" /><circle cx={clearX} cy={clearY} r="3.5" fill="#38c0fc" /><text x={clearX + 12} y={clearY - 3} fontSize="8" fill="#38c0fc" fontWeight="800" fontFamily="JetBrains Mono">£{f1(simRes.cp)}</text><text x={clearX + 12} y={clearY + 8} fontSize="6.5" fill="#2a5570">{f0(simRes.cleared)}MW</text></g>)}
        <text x={10} y={PAD.top + CH / 2} fontSize="7" fill="#4d7a96" transform={`rotate(-90,10,${PAD.top + CH / 2})`} textAnchor="middle">£/MWh</text>
      </svg>
    </div>
  );
}
