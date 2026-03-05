import { useState, useEffect, useRef } from "react";
import { ROLES, GAME_MODES, SCENARIOS } from "../shared/constants.js";
import { roomKey, uid } from "../shared/utils.js";

const ROLE_NEEDS_ASSET = (roleId) => {
    const r = ROLES[roleId];
    return r && r.canOwnAssets !== false;
};

/* ─── WAITING ROOM ─── */
export default function WaitingRoom({
    gun, room, name, pid, setPid, role, setRole, setScreen,
    isHost, setIsHost, gameMode, setGameMode, scenarioId, setScenarioId, players
}) {
    const [copied, setCopied] = useState(false);
    const joinedRef = useRef(false);

    // Register this player in the room on mount
    useEffect(() => {
        if (!gun || !room || joinedRef.current) return;
        joinedRef.current = true;

        const id = pid || uid();
        if (!pid) setPid(id);

        // Check if we're the first player (host/instructor)
        const playersNode = gun.get(roomKey(room, "players"));
        // Use a dedicated host key for robust election
        const hostNode = gun.get(roomKey(room, "host"));
        hostNode.get('pid').once((currentHost) => {
            if (!currentHost) {
                // Try to claim host
                hostNode.put({ pid: id }, (ack) => {
                    // We don't strictly wait for ack to proceed with UI, 
                    // but we verify our claim immediately following this
                });
                setIsHost(true);
            } else if (currentHost === id) {
                setIsHost(true);
            }
        });

        // Register ourselves
        playersNode.get(id).put({
            name: name.trim(),
            role: role,
            lastSeen: Date.now(),
            ready: false,
        });

        return () => { };
    }, [gun, room]);

    // Keep alive heartbeat
    useEffect(() => {
        if (!gun || !room || !pid) return;
        const interval = setInterval(() => {
            gun.get(roomKey(room, "players")).get(pid).put({ lastSeen: Date.now() });
        }, 5000);
        return () => clearInterval(interval);
    }, [gun, room, pid]);

    // Update role in Gun when it changes
    useEffect(() => {
        if (!gun || !room || !pid) return;
        gun.get(roomKey(room, "players")).get(pid).put({ role });
    }, [role, gun, room, pid]);

    const copyRoom = () => {
        navigator.clipboard?.writeText(room);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleStart = () => {
        if (!gun || !room) return;
        // Push initial game state if host
        if (isHost) {
            gun.get(roomKey(room, "meta")).put({
                sp: 1,
                phase: "DA",
                phaseStartTs: Date.now(),
                scenarioId,
                paused: false,
            });
        }
        // Non-asset roles skip asset selection
        if (!ROLE_NEEDS_ASSET(role)) {
            setScreen("game_no_asset");
        } else {
            setScreen("asset");
        }
    };

    const activePlayers = Object.values(players).filter(
        p => p && p.name && Date.now() - (p.lastSeen || 0) < 60000
    );

    const roleOptions = Object.values(ROLES).filter(r => r.id !== "INSTRUCTOR");

    return (
        <div style={{
            background: "#050e16", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Outfit', sans-serif", color: "#ddeeff",
            position: "relative", overflow: "hidden",
        }}>
            {/* Subtle grid background */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(#38c0fc08 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

            <div style={{ position: "relative", zIndex: 1, maxWidth: 720, width: "100%", padding: "32px 24px" }}>
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#38c0fc", marginBottom: 8 }}>GRIDFORGE</div>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 900, letterSpacing: 2, marginBottom: 8 }}>WAITING ROOM</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 12, color: "#4d7a96" }}>Room Code:</span>
                        <button onClick={copyRoom} style={{
                            background: "#0c1c2a", border: "1px solid #38c0fc44", borderRadius: 6, padding: "4px 14px",
                            fontFamily: "'JetBrains Mono'", fontSize: 18, fontWeight: 900, color: "#38c0fc", letterSpacing: 4, cursor: "pointer",
                        }}>
                            {room}
                        </button>
                        <span style={{ fontSize: 10, color: copied ? "#1de98b" : "#4d7a96" }}>{copied ? "Copied!" : "Click to copy"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#4d7a96", marginTop: 4 }}>
                        Share this code with other players to join
                    </div>
                </div>

                {/* Role Selection */}
                <div style={{
                    background: "#0a1929", border: "1px solid #38c0fc22", borderRadius: 12, padding: 20, marginBottom: 20,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#38c0fc", marginBottom: 12 }}>SELECT YOUR ROLE</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                        {roleOptions.map(r => (
                            <button key={r.id} onClick={() => setRole(r.id)} style={{
                                background: role === r.id ? "#38c0fc18" : "#0c1c2a",
                                border: `1px solid ${role === r.id ? "#38c0fc" : "#38c0fc22"}`,
                                borderRadius: 8, padding: "10px 8px", cursor: "pointer", textAlign: "center",
                                transition: "all 0.2s",
                            }}>
                                <div style={{ fontSize: 20 }}>{r.emoji}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: role === r.id ? "#38c0fc" : "#8ab8d0", marginTop: 4 }}>{r.name}</div>
                                <div style={{ fontSize: 7.5, color: "#4d7a96", marginTop: 2, lineHeight: 1.4 }}>{r.desc?.split("—")[0]}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Connected Players */}
                <div style={{
                    background: "#0a1929", border: "1px solid #38c0fc22", borderRadius: 12, padding: 20, marginBottom: 20,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#38c0fc", marginBottom: 12 }}>
                        CONNECTED PLAYERS ({activePlayers.length})
                    </div>
                    {activePlayers.length === 0 ? (
                        <div style={{ fontSize: 11, color: "#4d7a96", textAlign: "center", padding: 16 }}>
                            Waiting for players to join...
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {activePlayers.map((p, i) => {
                                const r = ROLES[p.role] || ROLES.GENERATOR;
                                return (
                                    <div key={p.id || i} style={{
                                        background: "#0c1c2a", border: "1px solid #38c0fc22", borderRadius: 8, padding: "6px 12px",
                                        display: "flex", alignItems: "center", gap: 6,
                                    }}>
                                        <span style={{ fontSize: 14 }}>{r.emoji}</span>
                                        <div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: "#ddeeff" }}>{p.name}</div>
                                            <div style={{ fontSize: 8, color: "#4d7a96" }}>{r.name}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Host Controls */}
                {isHost && (
                    <div style={{
                        background: "#0a1929", border: "1px solid #b78bfa33", borderRadius: 12, padding: 20, marginBottom: 20,
                    }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#b78bfa", marginBottom: 12 }}>🎓 HOST CONTROLS</div>

                        {/* Game Mode */}
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "#8ab8d0", marginBottom: 6 }}>GAME MODE</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {Object.values(GAME_MODES).map(gm => (
                                    <button key={gm.id} onClick={() => setGameMode(gm.id)} style={{
                                        background: gameMode === gm.id ? "#b78bfa22" : "#0c1c2a",
                                        border: `1px solid ${gameMode === gm.id ? "#b78bfa" : "#38c0fc22"}`,
                                        borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                                        fontSize: 9, fontWeight: 700, color: gameMode === gm.id ? "#b78bfa" : "#8ab8d0",
                                    }}>
                                        {gm.emoji} {gm.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Scenario (simplified: Normal Day only) */}
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "#8ab8d0", marginBottom: 6 }}>SCENARIO</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {Object.values(SCENARIOS).filter(s => s.id === "NORMAL").map(s => (
                                    <button key={s.id} onClick={() => setScenarioId(s.id)} style={{
                                        background: scenarioId === s.id ? `${s.col}22` : "#0c1c2a",
                                        border: `1px solid ${scenarioId === s.id ? s.col : "#38c0fc22"}`,
                                        borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                                        fontSize: 9, fontWeight: 700, color: scenarioId === s.id ? s.col : "#8ab8d0",
                                    }}>
                                        {s.emoji} {s.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <button onClick={() => setScreen("lobby")} style={{
                        padding: "12px 28px", background: "#0c1c2a", border: "1px solid #38c0fc33", borderRadius: 8,
                        color: "#4d7a96", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit'",
                    }}>
                        ← Back
                    </button>
                    <button onClick={handleStart} style={{
                        padding: "12px 36px", background: "linear-gradient(135deg, #38c0fc22, #b78bfa22)",
                        border: "1px solid #38c0fc66", borderRadius: 8, color: "#38c0fc", fontSize: 13,
                        fontWeight: 800, cursor: "pointer", fontFamily: "'Outfit'", letterSpacing: 1,
                    }}>
                        {isHost ? "START GAME →" : (ROLE_NEEDS_ASSET(role) ? "SELECT ASSET →" : "JOIN GAME →")}
                    </button>
                </div>
            </div>
        </div>
    );
}
