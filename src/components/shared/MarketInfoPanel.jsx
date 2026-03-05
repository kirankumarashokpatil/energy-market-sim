import React, { useState } from 'react';

export function MarketInfoPanel() {
    const [show, setShow] = useState(false);

    return (
        <div style={{ position: "relative" }}>
            <button
                onClick={() => setShow(s => !s)}
                style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", background: show ? "#38c0fc" : "#0c1c2a",
                    border: `1px solid ${show ? "#38c0fc" : "#1a3045"}`,
                    borderRadius: 8, color: show ? "#050e16" : "#4d7a96",
                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                    transition: "all 0.2s"
                }}
            >
                <span>{show ? "✕" : "ℹ️"}</span>
                {show ? "Close Dictionary" : "Market Dictionary"}
            </button>

            {show && (
                <div className="fadeIn" style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    width: 380, background: "#0a1724ee", backdropFilter: "blur(12px)",
                    border: "1px solid #38c0fc", borderRadius: 8, padding: 16,
                    zIndex: 9999, boxShadow: "0 12px 40px #000000aa", color: "#ddeeff"
                }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#38c0fc", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, borderBottom: "1px solid #1a3045", paddingBottom: 8 }}>
                        GridForge Terminology
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>

                        <div>
                            <span style={{ color: "#f5b222", fontWeight: 800, fontSize: 11 }}>DA (Day-Ahead)</span>
                            <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                                The forward market. You lock in a contract (price and volume) a day in advance based on forecasted conditions.
                            </p>
                        </div>

                        <div>
                            <span style={{ color: "#38c0fc", fontWeight: 800, fontSize: 11 }}>ID (Intraday)</span>
                            <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                                Continuous trading market near real-time. Adjust your DA position by buying or selling power as conditions change.
                            </p>
                        </div>

                        <div>
                            <span style={{ color: "#1de98b", fontWeight: 800, fontSize: 11 }}>BM (Balancing Mechanism)</span>
                            <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                                National Grid's real-time auction to stabilize the grid. You offer emergency flexibility. Bids are called (accepted) by NESO.
                            </p>
                        </div>

                        <div>
                            <span style={{ color: "#b78bfa", fontWeight: 800, fontSize: 11 }}>PN (Physical Notification)</span>
                            <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                                Your baseline expectation of delivery. Equals your net contract position (DA + ID trades).
                            </p>
                        </div>

                        <div style={{ height: 1, background: "#1a3045", margin: "4px 0" }} />

                        <div>
                            <span style={{ color: "#ffffff", fontWeight: 800, fontSize: 11 }}>NIV (Net Imbalance Volume)</span>
                            <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                                The absolute systemic error of the grid. Positive (Long) = Too much power generating. Negative (Short) = Not enough power generating.
                            </p>
                        </div>

                        <div>
                            <span style={{ color: "#ffffff", fontWeight: 800, fontSize: 11 }}>SoC (State of Charge)</span>
                            <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                                For Batteries: The percentage of total storage currently filled. Determines how much you can physically inject (discharge) or absorb (charge).
                            </p>
                        </div>

                        <div>
                            <span style={{ color: "#ffffff", fontWeight: 800, fontSize: 11 }}>Imbalance Exposure</span>
                            <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                                If your physical real-time output (or limits) break your contracted PN, you pay a penalty to ELEXON based on the System Sell/Buy Price.
                            </p>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
