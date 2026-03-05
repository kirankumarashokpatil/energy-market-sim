import React, { useMemo } from 'react';
import SharedLayout from './SharedLayout';
import { Tip } from '../shared/Tip';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ASSETS, SYSTEM_PARAMS } from '../../shared/constants';

// Formatting
const f0 = p => Number(p).toLocaleString(undefined, { maximumFractionDigits: 0 });
const f1 = p => Number(p).toLocaleString(undefined, { maximumFractionDigits: 1 });
const f2 = p => Number(p).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function InterconnectorScreen(props) {
    const {
        market, sp, msLeft, tickSpeed, phase, assetKey, cash, spHistory, forecasts,
        spContracts, contractPosition, pid,
        myBid, setMyBid, submitted, onSubmit
    } = props;

    // Lookup Asset details
    const def = ASSETS[assetKey] || ASSETS.IC_IFA;
    const currentMkt = phase === "DA" ? market?.forecast : market?.actual;
    const fpk = def.foreignPriceKey || "priceFR";
    const regionLabel = fpk === "priceFR" ? "France" : fpk === "priceNO" ? "Norway" : fpk === "priceNL" ? "Netherlands" : "Denmark";

    // Fallbacks if data is missing
    const gbPrice = currentMkt?.baseRef || 50;
    const frPrice = currentMkt?.[fpk] || 45;
    const isShort = market?.actual?.isShort || market?.forecast?.isShort;
    const sbp = market?.actual?.sbp || 50;
    const ssp = market?.actual?.ssp || 50;

    // Spread = GB - FR. If positive, GB is more expensive -> Import. If negative -> Export.
    const spread = gbPrice - frPrice;
    const isImport = spread > 0;

    const lossFactor = def.lossFactor || 0.03; // e.g. 3% loss
    const physicalFlowMw = def.maxMW || 1000;

    // Revenue calculations
    const totalRev = Number(cash || 0);

    // --- TOP RIGHT (NET POS) ---
    const topRight = (
        <div style={{ display: "flex", gap: 12 }}>
            <div style={{ background: "#0c1c2a", border: "1px solid #1a3045", padding: "4px 8px", borderRadius: 4, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 7.5, color: "#4d7a96" }}>NET POS (SP{sp})</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 800, color: spread > 0 ? "#1de98b" : spread < 0 ? "#38c0fc" : "#ddeeff" }}>
                    {isImport ? "+" : "-"}{f0(physicalFlowMw)} MW ({isImport ? "IMPORT" : "EXPORT"})
                </span>
            </div>
        </div>
    );

    // --- SECTION 1: ASSET CAPABILITIES ---
    const sect1AssetInfo = (
        <div style={{ background: "#0c1c2a", border: `1px solid ${def.col}55`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: def.col, boxShadow: `0 0 10px ${def.col}` }} />
            <div style={{ fontSize: 10, color: "#4d7a96", fontWeight: 800, textTransform: "uppercase", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <span>1. Cable Limits & Physics</span>
                <span style={{ fontSize: 14 }}>{def.emoji} {def.name}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={{ background: "#050e16", border: "1px solid #1a3045", padding: "6px 8px", borderRadius: 6 }}>
                    <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2 }}>THERMAL CAPACITY</div>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: def.col, fontWeight: 800 }}>{f0(def.maxMW)}<span style={{ fontSize: 9, color: "#2a5570" }}>MW</span></div>
                </div>
                <div style={{ background: "#050e16", border: "1px solid #1a3045", padding: "6px 8px", borderRadius: 6 }}>
                    <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2 }}>RAMP LIMIT</div>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#f5b222", fontWeight: 800 }}>{f0(def.rampRate || 500)}<span style={{ fontSize: 9, color: "#2a5570" }}>MW/SP</span></div>
                </div>
                <div style={{ background: "#050e16", border: "1px solid #1a3045", padding: "6px 8px", borderRadius: 6 }}>
                    <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2 }}>TRANSMISSION LOSS</div>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#f0455a", fontWeight: 800 }}>{f1(lossFactor * 100)}<span style={{ fontSize: 9, color: "#2a5570" }}>%</span></div>
                </div>
            </div>

            <div style={{ fontSize: 8.5, color: "#4d7a96", marginTop: "auto", paddingTop: 12, lineHeight: 1.5 }}>
                {def.desc}
            </div>
        </div>
    );

    const CONNECTORS = {
        priceFR: { gb: [51.08, 1.15], peer: [50.94, 1.86] }, // IFA
        priceNO: { gb: [55.14, -1.52], peer: [58.30, 6.78] }, // NSL
        priceNL: { gb: [51.44, 0.71], peer: [51.95, 4.01] }, // BritNed
        priceDK: { gb: [53.33, 0.22], peer: [56.45, 8.21] }, // Viking Link
    };

    // Calculate map bounds/center
    const coords = CONNECTORS[fpk] || CONNECTORS.priceFR;
    const center = [(coords.gb[0] + coords.peer[0]) / 2, (coords.gb[1] + coords.peer[1]) / 2];

    // --- SECTION 2: LIVE STATUS & ARBITRAGE SPREAD ---
    const sect2Arbitrage = (
        <div style={{ background: "#0c1c2a", border: "1px solid #1a3045", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, color: "#4d7a96", fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>2. Price Coupling (GB vs {regionLabel})</div>

            <div style={{ marginBottom: 16, background: "#050e16", padding: "8px 12px", border: `1px solid #1a3045`, borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <div style={{ fontSize: 8.5, color: "#4d7a96", fontWeight: 400 }}>PRICE ARBITRAGE SPREAD</div>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 900, color: spread > 0 ? "#1de98b" : "#38c0fc" }}>
                        {spread > 0 ? "+" : ""}£{f2(spread)} <span style={{ fontSize: 9, color: "#4d7a96", fontWeight: 400 }}>/MWh</span>
                    </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #1a3045" }}>
                    <div>
                        <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2 }}>GB PRICE</div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#f5b222" }}>£{f2(gbPrice)}</div>
                    </div>
                    <div style={{ background: "#1a3045" }} />
                    <div>
                        <div style={{ fontSize: 8, color: "#4d7a96", marginBottom: 2 }}>{regionLabel.toUpperCase()} PRICE</div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8b5cf6" }}>£{f2(frPrice)}</div>
                    </div>
                </div>
            </div>

            <div style={{ height: "180px", width: "100%", borderRadius: 6, overflow: "hidden", border: "1px solid #1a3045", zIndex: 0, marginBottom: 12, background: "#050e16" }}>
                <MapContainer center={center} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false}>
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                        attribution=""
                    />
                    <Polyline
                        positions={[coords.gb, coords.peer]}
                        pathOptions={{
                            color: isImport ? "#1de98b" : "#38c0fc",
                            weight: Math.min(8, Math.max(2, physicalFlowMw / 200)),
                            dashArray: "10 15",
                            opacity: 0.8
                        }}
                        className={isImport ? "flow-import" : "flow-export"}
                    />
                    <CircleMarker center={coords.gb} radius={5} pathOptions={{ color: "#fff", fillColor: "#1a3045", fillOpacity: 1, weight: 2 }} />
                    <CircleMarker center={coords.peer} radius={5} pathOptions={{ color: "#fff", fillColor: "#1a3045", fillOpacity: 1, weight: 2 }} />
                </MapContainer>
                {/* Optional inline CSS for dash animation */}
                <style>{`
                    @keyframes flow-anim-imp { 100% { stroke-dashoffset: -100; } }
                    @keyframes flow-anim-exp { 100% { stroke-dashoffset: 100; } }
                    .flow-import { animation: flow-anim-imp 3s linear infinite; }
                    .flow-export { animation: flow-anim-exp 3s linear infinite; }
                    .leaflet-container { background-color: #050e16; }
                `}</style>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: "auto" }}>
                <div style={{ flex: 1, borderLeft: `2px solid ${isImport ? "#1de98b" : "#1a3045"}`, paddingLeft: 8, opacity: isImport ? 1 : 0.3 }}>
                    <div style={{ fontSize: 8.5, color: isImport ? "#1de98b" : "#4d7a96", marginBottom: 2, fontWeight: 800 }}>← IMPORT TO GB</div>
                    <div style={{ fontSize: 10, color: "#2a5570" }}>Max {def.maxMW} MW</div>
                </div>
                <div style={{ flex: 1, borderRight: `2px solid ${!isImport ? "#38c0fc" : "#1a3045"}`, paddingRight: 8, textAlign: "right", opacity: !isImport ? 1 : 0.3 }}>
                    <div style={{ fontSize: 8.5, color: !isImport ? "#38c0fc" : "#4d7a96", marginBottom: 2, fontWeight: 800 }}>EXPORT TO {regionLabel.toUpperCase()} →</div>
                    <div style={{ fontSize: 10, color: "#2a5570" }}>Max {def.maxMW} MW</div>
                </div>
            </div>

            <div style={{ marginTop: 12, background: "#050e16", border: `1px solid #1a3045`, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: 8.5, color: "#4d7a96" }}>
                    Map shows real-world cable landing locations. Power flows dynamically driven by system prices.
                </div>
            </div>
        </div>
    );

    // --- SECTION 3: MARKET BIDS (Automated) ---
    const isDa = phase === "DA";
    const isId = phase === "ID";
    const isBm = phase === "BM";

    const sect3Bids = (
        <div style={{ flex: 1, background: "#08141f", border: "1px solid #1a3045", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h4 style={{ fontSize: 12, color: isDa ? "#f5b222" : isId ? "#38c0fc" : isBm ? "#1de98b" : "#b78bfa", letterSpacing: 1, textTransform: "uppercase" }}>
                    3. Market Participation
                </h4>
                <div style={{ fontSize: 9, color: "#4d7a96", padding: "2px 6px", border: "1px solid #1a3045", borderRadius: 4 }}>
                    {isBm ? "BM" : "IMPLICIT AUCTION"}
                </div>
            </div>

            {!isBm ? (
                <>
                    <p style={{ fontSize: 9, color: "#4d7a96", marginBottom: 16, lineHeight: 1.5 }}>
                        Unlike Generators, Interconnectors participate via <b>Implicit Coupling</b> in Forward markets. Power flows automatically from the lower price zone to the higher price zone, respecting cable capacity limits.
                    </p>

                    <div style={{ background: "#0c1c2a", border: "1px solid #1a3045", borderRadius: 6, padding: "16px", textAlign: "center", margin: "auto 0" }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
                        <div style={{ fontSize: 10, color: "#1de98b", fontWeight: 800, marginBottom: 4 }}>AUTOMATED INITIAL FLOW</div>
                        <div style={{ fontSize: 9, color: "#2a5570", padding: "0 20px" }}>You do not need to submit manual Day-Ahead or Intraday bids. Cable flows are driven deterministically by the GB/{regionLabel} price spread model in the background engine.</div>
                    </div>
                </>
            ) : (
                <>
                    <p style={{ fontSize: 9, color: "#4d7a96", marginBottom: 12, lineHeight: 1.5 }}>During the Balancing Mechanism, NESO can instruct interconnectors to override implicit flows to balance the grid.</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                        <div style={{ flex: 1, background: isShort ? "#1f0709" : "#071f13", border: `1px solid ${isShort ? "#f0455a" : "#1de98b"}44`, borderRadius: 6, padding: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: isShort ? "#f0455a" : "#1de98b", fontWeight: 800 }}>{isShort ? "GRID SHORT: NESO BUYING" : "GRID LONG: NESO SELLING"}</div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "auto" }}>
                        <div>
                            <label style={{ fontSize: 9, color: "#4d7a96", marginBottom: 6, display: "block" }}>FLEX VOLUME (MW)</label>
                            <input type="number" value={myBid.mw} disabled={submitted || phase !== "BM"} onChange={e => setMyBid(b => ({ ...b, mw: e.target.value }))} style={{ width: "100%", padding: "10px", background: "#102332", border: "1px solid #234159", borderRadius: 6, color: "#ddeeff", fontSize: 14, fontFamily: "'JetBrains Mono'" }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 9, color: "#4d7a96", marginBottom: 6, display: "block" }}>BID PRICE £/MWh</label>
                            <input type="number" value={myBid.price} placeholder={`~£${f0((isShort ? Math.max(sbp, 0) * SYSTEM_PARAMS.bidStrategyMultipliers.icBM.sbpMultiplier : ssp * SYSTEM_PARAMS.bidStrategyMultipliers.icBM.sspMultiplier))}`} disabled={submitted || phase !== "BM"} onChange={e => setMyBid(b => ({ ...b, price: e.target.value }))} style={{ width: "100%", padding: "10px", background: "#102332", border: "1px solid #234159", borderRadius: 6, color: "#1de98b", fontSize: 14, fontFamily: "'JetBrains Mono'" }} />
                        </div>
                    </div>

                    <button onClick={onSubmit} disabled={submitted || phase !== "BM" || !myBid.price} style={{ marginTop: 16, width: "100%", padding: "12px", background: submitted || phase !== "BM" ? "#1a3045" : (isShort ? "#f0455a" : "#1de98b"), border: "none", borderRadius: 6, color: submitted || phase !== "BM" ? "#4d7a96" : "#050e16", fontWeight: 800, fontSize: 12, cursor: submitted || phase !== "BM" ? "default" : "pointer" }}>
                        {submitted ? "✓ BM BID SUBMITTED" : `SUBMIT ${isShort ? "OFFER (Increase Import)" : "BID (Decrease Import)"} TO NESO →`}
                    </button>
                </>
            )}
        </div>
    );

    // --- SECTION 4: REAL-TIME SETTLEMENT & CONGESTION RENT ---
    // If GB > FR, Import, otherwise Export. The revenue is the absolute spread. 
    const congestionIncome = Math.abs(spread) * physicalFlowMw * 0.5; // per half hour

    const sect4RealTime = (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", height: "100%", background: "#050e16" }}>
            <h3 style={{ fontSize: 12, color: "#fff", marginBottom: 16, letterSpacing: 1 }}>4. SETTLEMENT & REAL-TIME</h3>

            <div style={{ background: "#0c1c2a", border: "1px solid #1a3045", borderRadius: 8, padding: 16, marginBottom: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 10, color: "#4d7a96", fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>Current Delivery Target</div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginTop: "auto", marginBottom: "auto" }}>
                    {!isImport && <div style={{ fontSize: 32 }}>⬆️</div>}
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 32, fontWeight: 900, color: isImport ? "#1de98b" : "#38c0fc" }}>
                        {f0(physicalFlowMw)} MW
                    </div>
                    {isImport && <div style={{ fontSize: 32 }}>⬇️</div>}
                </div>

                <div style={{ textAlign: "center", marginTop: "auto", paddingTop: 16, borderTop: "1px solid #1a3045" }}>
                    <div style={{ fontSize: 9, color: "#4d7a96", marginBottom: 4 }}>TRANSMISSION LOSS DEDUCTION</div>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#f0455a", fontWeight: 900 }}>
                        -{f0(physicalFlowMw * lossFactor)} MW LOST AS HEAT
                    </div>
                </div>
            </div>

            <div style={{ background: "#08141f", border: "1px solid #1a3045", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 9, color: "#4d7a96", fontWeight: 700, textTransform: "uppercase", marginBottom: 12 }}>CONGESTION REVENUE P&L</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                        <div style={{ fontSize: 8, color: "#2a5570", marginBottom: 2 }}>P&L THIS SP</div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#1de98b", fontWeight: 800 }}>+£{f0(congestionIncome)}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 8, color: "#2a5570", marginBottom: 2 }}>TOTAL PROFIT BOOKED</div>
                        <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: totalRev >= 0 ? "#1de98b" : "#f0455a", fontWeight: 800 }}>£{f0(totalRev)}</div>
                    </div>
                </div>
            </div>
        </div>
    );

    const centerCol = (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {sect1AssetInfo}
                {sect2Arbitrage}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                {sect3Bids}
            </div>
        </div>
    );

    return (
        <SharedLayout
            {...props}
            roleName={def.name}
            topRight={topRight}
            center={<div style={{ height: "100%", paddingRight: 16 }}>{centerCol}</div>}
            right={sect4RealTime}
        />
    );
}
