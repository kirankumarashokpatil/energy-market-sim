import { useEffect, useRef, useCallback } from "react";
import { ASSETS, SP_DURATION_H, FORGIVENESS, ROLES, SCORING_CONFIG } from "../shared/constants.js";
import { f0, spTime } from "../shared/utils.js";
import { clearBM, feedbackMarketState, clearDA, computeForecasts } from "../engine/MarketEngine.js";
import { availMW, updateSoF } from "../engine/AssetPhysics.js";
import { computeImbalanceSettlement } from "../engine/SettlementEngine.js";
import { computeRoleScore, computeSystemScore, computeOverallScore } from "../engine/ScoringEngine.js";
import { updateSystemState, computePlayerSystemImpact, updatePlayerImpact, buildPlayerStats } from "../engine/PhysicalEngine.js";

/**
 * useGameEngine: Encapsulates core game loop logic
 * 
 * Handles:
 * - Phase transitions (DA → ID → BM → SETTLED → DA)
 * - Market clearing and physics updates
 * - Settlement calculations
 * - Player state updates
 * 
 * @param {Object} appState - Current app state (sp, phase, market, players, etc.)
 * @param {Object} playerRefs - References to player-specific state
 * @param {Object} setters - State setter functions
 * @param {Object} callbacks - Callback functions (addToast, etc.)
 */
export function useGameEngine(appState, playerRefs, setters, callbacks) {
  const { addToast } = callbacks;
  const {
    sp, phase, market, players, spContracts, pid, asset: ak, gameMode, role,
    physicalState, cash, contractPosition, orderbookSnap, daOrderbookSnap
  } = appState;

  const {
    setMarket, setCash, setPhysicalState, setSpContracts, setSystemState,
    setPlayerScores, setOverallScoreHistory, setSpHistory, setImbalancePenalty,
    setContractPosition, setDaCash
  } = setters;

  const prevPhaseRef = useRef({ phase: "INIT", sp: 0 });

  /**
   * Handle phase transitions with settlement and market clearing
   */
  const handlePhaseTransition = useCallback(async (oldPhase, oldSp, gun, room, isInstructor) => {
    if (!market || !ak) return;
    // Diagnostic log for phase transition sync
    console.log('[GameEngine] handlePhaseTransition:', { oldPhase, oldSp, room, isInstructor });
    if (gun && room) {
      console.log('[GameEngine] GunDB sync state:', {
        gunReady: !!gun,
        room,
        market,
        players,
        spContracts,
        phase,
        sp
      });
    }

    const myDef = { ...ASSETS[ak], ...(playerRefs.assetConfig || {}) };
    const isGenerator = myDef.kind && ["thermal", "wind", "solar", "hydro"].includes(myDef.kind);
    const isStorage = myDef.kind === "bess";

    // --- DA CLOSED → Calculate Settlement ---
    if (oldPhase === "DA") {
      const daArr = [...Object.values(daOrderbookSnap || {}).filter(b => b && b.mw)];
      const daRes = clearDA(daArr, market.forecast);
      const mine = daRes.accepted_bids.find(a => a.id === pid);

      // Diagnostic log for DA phase
      console.log('[GameEngine] DA phase:', { daArr, daRes, mine });

      if (mine) {
        // BUG-008 FIX: use daRes.cp (not myDef.daPrice which doesn't exist)
        const daRevenue = mine.mwAcc * daRes.cp * SP_DURATION_H;

        // BUG-008 FIX: actually credit the cash
        setCash(prev => prev + daRevenue);
        setDaCash(prev => prev + daRevenue);
        setContractPosition(prev => prev + mine.mwAcc);

        // BUG-008 FIX: store daRev so SETTLED phase can see it (even though
        // we no longer re-credit it there — this is for display/Elexon audit)
        setSpContracts(prev => {
          const next = { ...prev };
          if (!next[oldSp]) next[oldSp] = {};
          if (!next[oldSp][pid]) next[oldSp][pid] = {};
          next[oldSp][pid].daRev = daRevenue;
          return next;
        });
      }
    }

    // --- BM CLOSED (Actual Delivery) ---
    if (oldPhase === "BM") {
      const bmArr = [...Object.values(orderbookSnap || {}).filter(b => b && b.mw)];
      const res = clearBM(bmArr, market.actual);
      // Diagnostic log for BM phase
      console.log('[GameEngine] BM phase:', { bmArr, res });
      setMarket(prev => ({ ...prev, actual: feedbackMarketState(prev.actual, res) }));
      const mine = res.accepted.find(a => a.id === pid);

      let startupDeduction = 0;
      if (mine && myDef.startupCost) {
        const prevSpPhysical = spContracts[oldSp - 1]?.[pid]?.physicalAtEndOfSp;
        const wasOnlineBefore = prevSpPhysical?.status === "ONLINE";
        if (!wasOnlineBefore) startupDeduction = myDef.startupCost;
      }

      setSpContracts(prev => {
        const next = { ...prev };
        if (!next[oldSp]) next[oldSp] = {};
        for (const b of res.accepted) {
          if (b.isBot && b.id.startsWith("BOT_")) continue;
          if (!next[oldSp][b.id]) next[oldSp][b.id] = {};
          next[oldSp][b.id].bmAccepted = { mw: b.mwAcc, price: res.cp, rev: b.revenue };
          if (b.id === pid && startupDeduction > 0) {
            next[oldSp][b.id].startupOccurred = true;
          }
        }
        return next;
      });

      // BM revenue (already net of wear via clearBM) minus startup if applicable
      const netRevenue = (mine?.revenue || 0) - startupDeduction;
      setCash(prev => prev + netRevenue);
    }

    // --- SETTLEMENT: Calculate imbalance and update scores ---
    if (oldPhase === "SETTLED" && market.actual) {
      const myC = spContracts[oldSp]?.[pid] || {};
      const contractPosMw = contractPosition || 0;
      const actualPosMw = myC.bmAccepted ? (market.actual.isShort ? myC.bmAccepted.mw : -myC.bmAccepted.mw) : 0;

      // Diagnostic log for SETTLED phase
      console.log('[GameEngine] SETTLED phase:', { myC, contractPosMw, actualPosMw, marketActual: market.actual });

      let intendedPhysical = myC.bmAccepted
        ? (market.actual.isShort ? myC.bmAccepted.mw : -myC.bmAccepted.mw)
        : 0;

      let actualPhysical = contractPosMw + actualPosMw;
      if (market.actual.trippedAssets?.includes(ak)) {
        const isDsr = myDef.kind === "dsr";
        if (!isDsr || !physicalState?.pendingReboundMwh > 0) {
          actualPhysical = 0;
        }
      }

      const deviation = actualPhysical - contractPosMw;
      const forgiveMult = gameMode === "TUTORIAL" ? (FORGIVENESS.penaltyMultiplier || 0.5) : 1;
      const imbPen = deviation >= 0
        ? (deviation * market.actual.ssp * SP_DURATION_H * forgiveMult)
        : (deviation * market.actual.sbp * SP_DURATION_H * forgiveMult);

      // BUG-013 FIX: operatingCost removed — wear already netted inside clearBM revenue.
      // BUG-012 FIX: bmAccepted.rev removed — already credited in BM phase above.
      // DA revenue also already credited in DA phase — do NOT re-add myC.daRev here.
      const totalSpRev = imbPen;  // imbalance charge/credit only
      if (imbPen < -5) {
        setImbalancePenalty(prev => prev + Math.abs(imbPen));
      }

      // Update scoring
      const playerImbalance = deviation;
      const systemNIV = market.actual.niv;
      const spImpact = computePlayerSystemImpact(playerImbalance, systemNIV);
      const isStressSP = Math.abs(systemNIV) > (SCORING_CONFIG.stressNIVThreshold || 300);
      const deliveredOk = Math.abs(deviation) < 5;

      setSystemState(prev => {
        const balancingCost = Math.abs(market.actual.niv) * (market.actual.sbp || 50) * 0.01;
        const updated = updateSystemState(prev, { sp: oldSp, niv: systemNIV, balancingCost, freq: market.actual.freq });
        updated.playerImpacts = updatePlayerImpact(prev.playerImpacts, pid, spImpact, isStressSP, deliveredOk);
        return updated;
      });

      // Store physical state for next SP startup determination
      setSpContracts(prev => {
        const next = { ...prev };
        if (!next[oldSp]) next[oldSp] = {};
        if (!next[oldSp][pid]) next[oldSp][pid] = {};
        next[oldSp][pid].physicalAtEndOfSp = { status: physicalState?.status, currentMw: physicalState?.currentMw };
        return next;
      });
    }
  }, [market, ak, playerRefs, spContracts, pid, gameMode, role, physicalState, contractPosition, orderbookSnap, daOrderbookSnap,
    setMarket, setCash, setPhysicalState, setSpContracts, setSystemState, setPlayerScores, setOverallScoreHistory, setSpHistory, setImbalancePenalty, setContractPosition, addToast]);

  return { handlePhaseTransition, prevPhaseRef };
} 