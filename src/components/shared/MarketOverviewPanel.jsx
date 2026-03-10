import React from 'react';
import DayAheadCurve from './DayAheadCurve';
import IntradayDepthChart from './IntradayDepthChart';
import SupplyDemandCurve from './SupplyDemandCurve';

export default function MarketOverviewPanel({ phase, daOrderBook, daResult, idOrderBook, spContracts, currentSp, msLeft, tickSpeed, bmOrderBook, market, simRes }) {

    // We need to pass the appropriate data to each chart based on the phase

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {phase === "DA" && (
                <DayAheadCurve
                    bids={Object.values(daOrderBook || {})}
                    marketForecast={market?.forecast}
                    daResult={daResult}
                />
            )}

            {phase === "ID" && (
                <IntradayDepthChart
                    idOrderBook={idOrderBook}
                    spContracts={spContracts}
                    currentSp={currentSp}
                    msLeft={msLeft}
                    tickSpeed={tickSpeed}
                />
            )}

            {(phase === "BM" || phase === "SETTLED") && (
                <SupplyDemandCurve
                    allBids={Object.values(bmOrderBook || {})}
                    market={phase === "BM" ? market?.actual : (market?.actual || market?.forecast)}
                    simRes={simRes}
                />
            )}

            {/* If somehow no phase matches, show a placeholder */}
            {!["DA", "ID", "BM", "SETTLED"].includes(phase) && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyItems: "center", background: "#08141f", border: "1px solid #1a3045", borderRadius: 8, color: "#4d7a96", fontSize: 10 }}>
                    <div style={{ margin: "auto" }}>Awaiting Market Phase...</div>
                </div>
            )}
        </div>
    );
}
