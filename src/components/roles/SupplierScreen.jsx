import React, { useState, useMemo } from 'react';
import SharedLayout from './SharedLayout';
import { SUPPLIERS } from '../../shared/constants';
import { Tip } from '../shared/Tip';

const f0 = p => Number(p).toLocaleString(undefined, { maximumFractionDigits: 0 });
const f1 = p => Number(p).toLocaleString(undefined, { maximumFractionDigits: 1 });

// --- REUSABLE MICRO-COMPONENTS ---
function MetricCard({ label, value, unit, color, tooltip }) {
    const card = (
        <div style={{ background: "#050e16", border: "1px solid #1a3045", padding: "6px 8px", borderRadius: 6 }}>
            <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2, cursor: tooltip ? "help" : "default", borderBottom: tooltip ? "1px dashed #4d7a96" : "none", display: "inline-block" }}>{label}</div>
            <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: color || "#ddeeff", fontWeight: 800 }}>
                {value}<span style={{ fontSize: 9, color: "#2a5570", marginLeft: 2 }}>{unit}</span>
            </div>
        </div>
    );
    return tooltip ? <Tip text={tooltip}>{card}</Tip> : card;
}

function PnlBlock({ label, valueFormat, color }) {
    return (
        <div>
            <div style={{ fontSize: 8, color: "#2a5570", marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: color, fontWeight: 800 }}>{valueFormat}</div>
        </div>
    );
}

export default function SupplierScreen(props) {
    const {
        market, sp, msLeft, tickSpeed, phase, cash, assetKey,
        daMyBid, setDaMyBid, daSubmitted, onDaSubmit,
        idMyOrder, setIdMyOrder, idSubmitted, onIdSubmit,
        spContracts, pid, contractPosition
    } = props;

    // Allow player to pick a supplier profile (defaults to BRITISH_GAS)
    const [supplierKey, setSupplierKey] = useState(assetKey && SUPPLIERS[assetKey] ? assetKey : "BRITISH_GAS");
    const sup = SUPPLIERS[supplierKey] || SUPPLIERS.BRITISH_GAS;

    const currentMkt = phase === "DA" ? market?.forecast : market?.actual;
    const sbp = currentMkt?.sbp || 50;
    const ssp = currentMkt?.ssp || 50;
    const hr = currentMkt?.hr ?? Math.floor((sp - 1) / 2);

    // --- DEMAND FORECAST with error ---
    // Base demand follows a daily curve scaled to supplier portfolio size
    const baseDemandMw = useMemo(() => {
        const peakFactor = 0.72 + 0.28 * (0.5 - 0.5 * Math.cos(((hr - 5) / 24) * 2 * Math.PI));
        return Math.round(sup.portfolioMw * peakFactor);
    }, [hr, sup.portfolioMw]);

    // Actual demand = base + random error (seeded on SP for determinism)
    const actualDemandMw = useMemo(() => {
        const seed = sp * 4321 + supplierKey.length * 17;
        const pseudoRand = (Math.sin(seed) * 10000) % 1;
        const errorMw = baseDemandMw * sup.forecastErrorPct * (pseudoRand * 2 - 1);
        return Math.round(baseDemandMw + errorMw);
    }, [sp, baseDemandMw, sup.forecastErrorPct, supplierKey]);

    // Hedging calculations
    const hedgeRatio = baseDemandMw > 0 ? Math.min(100, (contractPosition / baseDemandMw) * 100) : 0;
    const shortfall = Math.max(0, actualDemandMw - contractPosition);
    const surplus = Math.max(0, contractPosition - actualDemandMw);
    const imbalanceCost = shortfall > 0 ? shortfall * sbp * 0.5 : -(surplus * ssp * 0.5);
    const retailRevenue = actualDemandMw * sup.retailTariff * 0.5;
    const wholesaleCost = contractPosition * (daMyBid.price || sbp) * 0.5;
    const estimatedMargin = retailRevenue - wholesaleCost - Math.abs(imbalanceCost);

    // --- TOP RIGHT ---
    const topRight = (
        <div style={{ display: "flex", gap: 12 }}>
            <MetricCard
                label="FORECAST DEMAND"
                value={f0(baseDemandMw)}
                unit="MW"
                color="#f0455a"
                tooltip="The total power your retail customers are expected to consume based on the daily curve."
            />
            <MetricCard
                label="HEDGE %"
                value={f1(hedgeRatio)}
                unit="%"
                color={hedgeRatio >= 95 ? "#1de98b" : hedgeRatio >= 70 ? "#f5b222" : "#f0455a"}
                tooltip="How much of your Forecast Demand is currently covered by wholesale electricity contracts (DA + ID purchases)."
            />
        </div>
    );

    // --- SECTION 1: SUPPLIER PROFILE ---
    const sect1Profile = (
        <div style={{ background: "#0c1c2a", border: `1px solid ${sup.col}55`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: sup.col, boxShadow: `0 0 10px ${sup.col}` }} />
            <div style={{ fontSize: 10, color: "#4d7a96", fontWeight: 800, textTransform: "uppercase", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <span>1. Supplier Profile</span>
                <span style={{ fontSize: 14 }}>{sup.emoji} {sup.name}</span>
            </div>

            {/* Supplier selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {Object.values(SUPPLIERS).map(s => (
                    <button key={s.key} onClick={() => setSupplierKey(s.key)} style={{ padding: "4px 8px", background: supplierKey === s.key ? `${s.col}22` : "#050e16", border: `1px solid ${supplierKey === s.key ? s.col : "#1a3045"}`, borderRadius: 4, color: supplierKey === s.key ? s.col : "#4d7a96", fontSize: 8, fontWeight: 700, cursor: "pointer" }}>{s.short}</button>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <MetricCard label="PORTFOLIO SIZE" value={f0(sup.portfolioMw)} unit="MW" color={sup.col} />
                <MetricCard label="RETAIL TARIFF" value={`£${sup.retailTariff}`} unit="/MWh" color="#f5b222" />
                <MetricCard label="FORECAST ERROR" value={`±${f1(sup.forecastErrorPct * 100)}`} unit="%" color="#f0455a" />
            </div>
            <div style={{ fontSize: 8.5, color: "#4d7a96", marginTop: "auto", paddingTop: 8, lineHeight: 1.5 }}>{sup.desc}</div>
        </div>
    );

    // --- SECTION 2: DEMAND FORECASTING & LIVE STATUS ---
    const sect2Demand = (
        <div style={{ background: "#0c1c2a", border: "1px solid #1a3045", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, color: "#4d7a96", fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>2. Customer Demand & Hedging</div>

            <div style={{ marginBottom: 16, background: "#050e16", padding: "8px 12px", border: `1px solid #1a3045`, borderRadius: 6 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2 }}>FORECAST DEMAND</div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 14, color: "#ddeeff", fontWeight: 800 }}>{f0(baseDemandMw)} MW</div>
                        <div style={{ fontSize: 8, color: "#2a5570" }}>Based on day profile</div>
                    </div>
                    <div style={{ background: "#1a3045" }} />
                    <div>
                        <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2 }}>ACTUAL DEMAND (REVEALED)</div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 14, color: phase === "SETTLED" || phase === "BM" ? (actualDemandMw > baseDemandMw ? "#f0455a" : "#1de98b") : "#4d7a96", fontWeight: 800 }}>
                            {phase === "SETTLED" || phase === "BM" ? `${f0(actualDemandMw)} MW` : "? ? ?"}
                        </div>
                        <div style={{ fontSize: 8, color: "#2a5570" }}>{phase === "DA" || phase === "ID" ? "Revealed at BM phase" : `Error: ${actualDemandMw > baseDemandMw ? "+" : ""}${f0(actualDemandMw - baseDemandMw)}MW`}</div>
                    </div>
                </div>
            </div>

            {/* Hedge Ratio Bar */}
            <Tip text="Strive for 100% hedge to minimize imbalance risk. Being under-hedged forces you to buy missing power at real-time System Buy Prices (often very high).">
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4d7a96", marginBottom: 4, cursor: "help" }}>
                        <span style={{ borderBottom: "1px dashed #4d7a96" }}>HEDGE RATIO</span>
                        <span style={{ color: hedgeRatio >= 95 ? "#1de98b" : hedgeRatio >= 70 ? "#f5b222" : "#f0455a", fontWeight: 800 }}>{f1(hedgeRatio)}%</span>
                    </div>
                    <div style={{ height: 12, background: "#1f0709", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, hedgeRatio))}%`, background: hedgeRatio >= 95 ? "#1de98b" : hedgeRatio >= 70 ? "#f5b222" : "#f0455a", transition: "width 0.3s", borderRadius: 6 }} />
                    </div>
                </div>
            </Tip>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: "auto" }}>
                <MetricCard
                    label="UNDER-HEDGED EXPOSURE"
                    value={f0(shortfall)}
                    unit="MW"
                    color={shortfall > 0 ? "#f0455a" : "#4d7a96"}
                    tooltip="Missing energy volume you must buy from NESO during settlement. Highly penalized if SBP is elevated."
                />
                <MetricCard
                    label="OVER-HEDGED SURPLUS"
                    value={f0(surplus)}
                    unit="MW"
                    color={surplus > 0 ? "#38c0fc" : "#4d7a96"}
                />
            </div>
        </div>
    );

    // --- SECTION 3: PROCUREMENT ---
    const isDa = phase === "DA";
    const isId = phase === "ID";

    const sect3Procurement = (
        <div style={{ flex: 1, background: "#08141f", border: "1px solid #1a3045", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h4 style={{ fontSize: 12, color: isDa ? "#f5b222" : isId ? "#38c0fc" : "#b78bfa", letterSpacing: 1, textTransform: "uppercase" }}>
                    3. {isDa ? "Day-Ahead Baseload Purchase" : isId ? "Intraday Adjustment" : "Settlement Phase"}
                </h4>
            </div>

            {isDa && (
                <>
                    <p style={{ fontSize: 9, color: "#4d7a96", marginBottom: 16, lineHeight: 1.5 }}>Buy baseload to cover your forecast demand of <b>{f0(baseDemandMw)} MW</b>. Actual demand will deviate by ±{f1(sup.forecastErrorPct * 100)}%. Under-hedging is extremely risky if SBP spikes.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "auto" }}>
                        <div>
                            <label style={{ fontSize: 9, color: "#4d7a96", marginBottom: 6, display: "block" }}>BUY VOLUME (MW)</label>
                            <input type="number" placeholder={f0(baseDemandMw)} value={daMyBid.mw} disabled={daSubmitted || !isDa} onChange={e => setDaMyBid(b => ({ ...b, mw: e.target.value, side: "buy" }))} style={{ width: "100%", padding: "10px", background: "#102332", border: "1px solid #234159", borderRadius: 6, color: "#ddeeff", fontSize: 14, fontFamily: "'JetBrains Mono'" }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 9, color: "#4d7a96", marginBottom: 6, display: "block" }}>MAX PRICE £/MWh</label>
                            <input type="number" value={daMyBid.price} disabled={daSubmitted || !isDa} onChange={e => setDaMyBid(b => ({ ...b, price: e.target.value }))} style={{ width: "100%", padding: "10px", background: "#102332", border: "1px solid #234159", borderRadius: 6, color: "#f5b222", fontSize: 14, fontFamily: "'JetBrains Mono'" }} />
                        </div>
                    </div>
                    {daMyBid.mw && daMyBid.mw < baseDemandMw * 0.9 && (
                        <div style={{ fontSize: 8.5, color: "#f0455a", fontWeight: 700, padding: "6px 0", textAlign: "center" }}>⚠️ Under-hedging! You're only buying {f1((daMyBid.mw / baseDemandMw) * 100)}% of your forecast demand.</div>
                    )}
                    <button onClick={() => { setDaMyBid(b => ({ ...b, side: "buy" })); onDaSubmit(); }} disabled={daSubmitted || !isDa || !daMyBid.price} style={{ marginTop: 16, width: "100%", padding: "12px", background: daSubmitted || !isDa ? "#1a3045" : "#f5b222", border: "none", borderRadius: 6, color: daSubmitted || !isDa ? "#4d7a96" : "#050e16", fontWeight: 800, fontSize: 12, cursor: daSubmitted || !isDa ? "default" : "pointer" }}>
                        {!isDa ? "AWAITING DA PHASE..." : daSubmitted ? "✓ PURCHASE LOCKED" : "SUBMIT DA PURCHASE →"}
                    </button>
                </>
            )}

            {isId && (
                <>
                    <p style={{ fontSize: 9, color: "#4d7a96", marginBottom: 16, lineHeight: 1.5 }}>Adjust your position closer to delivery. Weather changed? Hedge gap discovered? Fix it now before BM.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <button onClick={() => setIdMyOrder(b => ({ ...b, side: "buy" }))} disabled={idSubmitted} style={{ padding: "8px", background: idMyOrder.side === "buy" ? "#38c0fc22" : "#102332", border: `1px solid ${idMyOrder.side === "buy" ? "#38c0fc" : "#1a3045"}`, borderRadius: 6, color: idMyOrder.side === "buy" ? "#38c0fc" : "#4d7a96", fontSize: 10, fontWeight: 800 }}>BUY MORE (Under-hedged)</button>
                        <button onClick={() => setIdMyOrder(b => ({ ...b, side: "sell" }))} disabled={idSubmitted} style={{ padding: "8px", background: idMyOrder.side === "sell" ? "#f0455a22" : "#102332", border: `1px solid ${idMyOrder.side === "sell" ? "#f0455a" : "#1a3045"}`, borderRadius: 6, color: idMyOrder.side === "sell" ? "#f0455a" : "#4d7a96", fontSize: 10, fontWeight: 800 }}>SELL EXCESS (Over-hedged)</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "auto" }}>
                        <div>
                            <label style={{ fontSize: 9, color: "#4d7a96", marginBottom: 6, display: "block" }}>VOLUME (MW)</label>
                            <input type="number" value={idMyOrder.mw} disabled={idSubmitted || !isId} onChange={e => setIdMyOrder(b => ({ ...b, mw: e.target.value }))} style={{ width: "100%", padding: "10px", background: "#102332", border: "1px solid #234159", borderRadius: 6, color: "#ddeeff", fontSize: 14, fontFamily: "'JetBrains Mono'" }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 9, color: "#4d7a96", marginBottom: 6, display: "block" }}>PRICE LIMIT £/MWh</label>
                            <input type="number" value={idMyOrder.price} disabled={idSubmitted || !isId} onChange={e => setIdMyOrder(b => ({ ...b, price: e.target.value }))} style={{ width: "100%", padding: "10px", background: "#102332", border: "1px solid #234159", borderRadius: 6, color: "#38c0fc", fontSize: 14, fontFamily: "'JetBrains Mono'" }} />
                        </div>
                    </div>
                    <button onClick={onIdSubmit} disabled={idSubmitted || !isId || !idMyOrder.price} style={{ marginTop: 16, width: "100%", padding: "12px", background: idSubmitted || !isId ? "#1a3045" : "#38c0fc", border: "none", borderRadius: 6, color: idSubmitted || !isId ? "#4d7a96" : "#050e16", fontWeight: 800, fontSize: 12, cursor: idSubmitted || !isId ? "default" : "pointer" }}>
                        {!isId ? "AWAITING ID PHASE..." : idSubmitted ? "✓ ORDER PUBLISHED" : "SUBMIT ID ORDER →"}
                    </button>
                </>
            )}

            {!isDa && !isId && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 24 }}>⏳</div>
                    <div style={{ fontSize: 10, color: "#4d7a96", fontWeight: 700 }}>GATE CLOSED — Awaiting Settlement</div>
                    <div style={{ fontSize: 9, color: "#2a5570" }}>Any unhedged demand will be settled at SBP/SSP.</div>
                </div>
            )}
        </div>
    );

    // --- SECTION 4: REAL-TIME SETTLEMENT ---
    const sect4Settlement = (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%", background: "#050e16" }}>
            <h3 style={{ fontSize: 12, color: "#fff", marginBottom: 8, letterSpacing: 1 }}>4. P&L & IMBALANCE</h3>
            <div style={{ fontSize: 9, color: "#4d7a96", marginBottom: 16 }}>
                KPI: <strong style={{ color: "#38c0fc" }}>Cost/MWh</strong>
            </div>

            <div style={{ background: "#0c1c2a", border: "1px solid #1a3045", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#4d7a96", fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>Retail Revenue vs Wholesale Cost</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <PnlBlock label="RETAIL REVENUE (TARIFF)" valueFormat={`+£${f0(retailRevenue)}`} color="#1de98b" />
                    <PnlBlock label="WHOLESALE COST" valueFormat={`-£${f0(wholesaleCost)}`} color="#f0455a" />
                </div>
            </div>

            <div style={{ background: shortfall > 0 ? "#2a0f12" : surplus > 0 ? "#0f1f2a" : "#0f2018", border: `1px solid ${shortfall > 0 ? "#f0455a" : surplus > 0 ? "#38c0fc" : "#1de98b"}`, borderRadius: 8, padding: 16, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 10, color: shortfall > 0 ? "#f0455a" : "#1de98b", fontWeight: 800, marginBottom: 12 }}>
                    {shortfall > 0 ? "⚠ IMBALANCE: SHORT POSITION" : surplus > 0 ? "📊 OVER-HEDGED (SELLING SURPLUS)" : "✓ PERFECTLY HEDGED"}
                </div>

                {shortfall > 0 && (
                    <div style={{ fontSize: 9, color: "#f0455a99", lineHeight: 1.5, marginBottom: 12 }}>
                        Your customers consumed <b>{f0(actualDemandMw)} MW</b> but you only purchased <b>{f0(contractPosition)} MW</b>.
                        The shortfall of <b>{f0(shortfall)} MW</b> is settled at System Buy Price (£{f0(sbp)}/MWh).
                    </div>
                )}
                {surplus > 0 && (
                    <div style={{ fontSize: 9, color: "#38c0fc99", lineHeight: 1.5, marginBottom: 12 }}>
                        You purchased <b>{f0(contractPosition)} MW</b> but customers only consumed <b>{f0(actualDemandMw)} MW</b>.
                        Your excess <b>{f0(surplus)} MW</b> is sold back at System Sell Price (£{f0(ssp)}/MWh).
                    </div>
                )}

                <div style={{ marginTop: "auto", borderTop: "1px solid #1a3045", paddingTop: 12 }}>
                    <div style={{ fontSize: 9, color: "#4d7a96", marginBottom: 4 }}>IMBALANCE COST</div>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 16, color: imbalanceCost > 0 ? "#1de98b" : "#f0455a", fontWeight: 900 }}>
                        {imbalanceCost >= 0 ? "+" : ""}£{f0(imbalanceCost)}
                    </div>
                </div>
            </div>

            <div style={{ background: "#08141f", border: "1px solid #1a3045", borderRadius: 8, padding: 12, marginTop: 16 }}>
                <div style={{ fontSize: 9, color: "#4d7a96", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>ESTIMATED GROSS MARGIN</div>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 18, color: estimatedMargin >= 0 ? "#1de98b" : "#f0455a", fontWeight: 900 }}>
                    {estimatedMargin >= 0 ? "+" : ""}£{f0(estimatedMargin)}
                </div>
                <div style={{ fontSize: 8, color: "#2a5570", marginTop: 4 }}>= Retail Revenue – Wholesale Cost – Imbalance</div>
            </div>
        </div>
    );

    const centerCol = (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {sect1Profile}
                {sect2Demand}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                {sect3Procurement}
            </div>
        </div>
    );

    return (
        <SharedLayout
            {...props}
            roleName={sup.name}
            topRight={topRight}
            center={<div style={{ height: "100%", paddingRight: 16 }}>{centerCol}</div>}
            right={sect4Settlement}
        />
    );
}
