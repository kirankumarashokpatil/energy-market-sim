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

        // Robust host election: use timestamp to break ties in race conditions
        // If two players claim host at same time, the one with earlier timestamp wins
        const playersNode = gun.get(roomKey(room, "players"));
        const hostNode = gun.get(roomKey(room, "host"));
        const myTimestamp = Date.now();
        
        // Host election: only claim if there is absolutely no current host.
        // Avoid overwriting an existing host even if our clock is earlier/stale.
        hostNode.once((data) => {
            const currentHost = data?.pid;
            if (!currentHost) {
                // No host present, safe to claim
                hostNode.put({ pid: id, ts: myTimestamp }, () => {
                    hostNode.once(v => setIsHost(v?.pid === id));
                });
            } else if (currentHost === id) {
                // we rejoined as the original host
                setIsHost(true);
            } else {
                // someone else holds host – do not override
                setIsHost(false);
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

    // Sync role if the Host changed it in the database
    useEffect(() => {
        const dbRole = players[pid]?.role;
        if (dbRole && dbRole !== role) {
            setRole(dbRole);
        }
    }, [players, pid, role, setRole]);

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

    // hide roles that are marked as system assets (e.g. Interconnector)
    const roleOptions = Object.values(ROLES).filter(r => !r.isSystem && r.id !== "INSTRUCTOR");

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
                        <button data-testid="room-code-button" onClick={copyRoom} style={{
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
                            <button data-testid={`role-${r.id}`} key={r.id} onClick={() => setRole(r.id)} style={{
                                background: role === r.id ? "#38c0fc18" : "#0c1c2a",
                                border: `1px solid ${role === r.id ? "#38c0fc" : "#38c0fc22"}`,
                                borderRadius: 8, padding: "10px 8px", cursor: "pointer", textAlign: "center",
                                transition: "all 0.2s",
                            }}>
                                <div style={{ fontSize: 20 }}>{r.emoji}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: role === r.id ? "#38c0fc" : "#8ab8d0", marginTop: 4 }}>{r.name}</div>
                                <div style={{ fontSize: 7.5, color: "#4d7a96", marginTop: 2, lineHeight: 1.4 }}>{r.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick Help Panel */}
                <div style={{
                    background: "#0a1929", border: "1px solid #38c0fc22", borderRadius: 12, padding: 20, marginBottom: 20,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#38c0fc", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                        🎮 QUICK START TIPS
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div><strong style={{ color: "#1de98b" }}>1. Pick a role</strong> that matches your strategy</div>
                        <div><strong style={{ color: "#1de98b" }}>2. Click the "Learn" button</strong> (top-right) to see role strategies and market terminology</div>
                        <div><strong style={{ color: "#1de98b" }}>3. Watch the market phases</strong> unfold: DA ➜ ID ➜ BM ➜ Settlement</div>
                        <div><strong style={{ color: "#1de98b" }}>4. Your score is based on</strong>: profit + contribution to grid stability</div>
                    </div>
                </div>
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
                                const isMe = p.id === pid;
                                return (
                                    <div key={p.id || i} style={{
                                        background: "#0c1c2a", border: "1px solid #38c0fc22", borderRadius: 8, padding: "6px 12px",
                                        display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", minWidth: 200
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 14 }}>{r.emoji}</span>
                                            <div>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: "#ddeeff" }}>
                                                    {p.name} {isMe ? "(You)" : ""}
                                                </div>
                                                {/* Hide the text role if the host is viewing, since they get a dropdown */}
                                                {(!isHost) && <div style={{ fontSize: 8, color: "#4d7a96" }}>{r.name}</div>}
                                            </div>
                                        </div>

                                        {/* Host Controls: Role Override Dropdown */}
                                        {isHost && (
                                            <select
                                                value={p.role || "GENERATOR"}
                                                onChange={(e) => {
                                                    const newRole = e.target.value;
                                                    // Immediately update the GunDB node for that specific player
                                                    if (gun && room) {
                                                        gun.get(roomKey(room, "players")).get(p.id).put({ role: newRole });
                                                    }
                                                }}
                                                style={{
                                                    background: "#050e16", border: "1px solid #38c0fc44", borderRadius: 4,
                                                    color: "#38c0fc", fontSize: 9, padding: "4px", outline: "none", cursor: "pointer",
                                                    fontWeight: 700, fontFamily: "'Outfit'"
                                                }}
                                            >
                                                {roleOptions.map(opt => (
                                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                                ))}
                                            </select>
                                        )}
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
                    <button data-testid="waitingroom-back" onClick={() => setScreen("lobby")} style={{
                        padding: "12px 28px", background: "#0c1c2a", border: "1px solid #38c0fc33", borderRadius: 8,
                        color: "#4d7a96", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit'",
                    }}>
                        ← Back
                    </button>
                    <button data-testid="waitingroom-proceed" onClick={handleStart} style={{
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
