# Critical Logical Fixes - GridForge Engine

## Summary
This document details the systemic logical bugs identified in core game engines and provides fixes to prevent:
- Double-dip cash settlements
- SoC drift in BESS bidding
- Net-zero bidding blockers
- Forecast skill integration issues

---

## 1. CRITICAL: Double-Dip Cash Settlement Bug

**File:** `SettlementEngine.js` + Game State Management  
**Severity:** 🔴 HIGH  
**Issue:**
- If `cash` in player state represents the **imbalance settlement** (physical meter difference),
- And UI displays `totalRev = cash + daCash`,
- Then the BM accepted cash is being **double-counted** because the imbalance already includes the BM effect on final meter.

**Root Cause:**
```javascript
// BAD: This double-counts
const totalRev = cash + daCash + bmCash;  // If cash = imbalance settlement (includes BM)

// GOOD: Should be
const totalRev = imbalanceCash + daCash;  // Where imbalanceCash = (actual - contracted) * price
```

**Fix:**
Clarify state structure:
- `daCash`: Revenue from DA contract execution
- `imbalanceCash`: Settlement on any deviation (physical - DA contract - BM accepted)
- Do NOT add BM cash separately; it's already in imbalanceCash

**Status:** ⚠️ NEEDS AUDIT - Check `spContracts[sp][pid].cash` calculation in game state

---

## 2. CRITICAL: BESS Net-Zero Bidding Blocker

**File:** `BessScreen.jsx` lines 58-59  
**Severity:** 🔴 HIGH  
**Issue:**
If BESS is at 100% SoC with a "Sell" contract (positive `contractPosition`), the UI prevents "Buy" bids:
```javascript
max={isShort ? sustainedDischargeMw : sustainedChargeMw}
// If full: sustainedChargeMw = 0 → can't bid to charge
// But: Buy 50 MW cancels half of Sell contract = net balanced
```

**Root Cause:** Raw capacity checks don't account for contractual offsets.

**Fix:** Calculate NET available MW considering existing contracts:
```javascript
// Calculate net-available capacity for BM phase
const getNetAvailableMw = () => {
  const contractMw = contractPosition || 0;  // Positive = discharge, negative = charge
  
  if (contractMw > 0) {
    // Has a discharge contract: Can charge up to offset it + available headroom
    const chargeHeadroom = (maxChargeMwh / (def.eff || 1)) / SP_DURATION_H;
    const netChargeCapacity = sustainedDischargeMw + chargeHeadroom; // Can "Buy" to offset "Sell"
    return {
      maxBuy: Math.min(def.maxMW, netChargeCapacity),
      maxSell: sustainedDischargeMw
    };
  } else if (contractMw < 0) {
    // Has a charge contract: Can discharge up to offset it + available energy
    const dischargeCapacity = (maxDischargeMwh * (def.eff || 1)) / SP_DURATION_H;
    const netDischargeCapacity = sustainedChargeMw + dischargeCapacity; // Can "Sell" to offset "Buy"
    return {
      maxBuy: sustainedChargeMw,
      maxSell: Math.min(def.maxMW, netDischargeCapacity)
    };
  } else {
    // No contract: Normal capacity limits
    return {
      maxBuy: sustainedChargeMw,
      maxSell: sustainedDischargeMw
    };
  }
};
```

**Implementation:** Apply in BM input maxes:
```javascript
const netCaps = getNetAvailableMw();
<input max={isShort ? netCaps.maxSell : netCaps.maxBuy} />
```

**Status:** ⏳ READY TO IMPLEMENT

---

## 3. MEDIUM: BESS SoC Efficiency Asymmetry - VERIFIED WORKING

**File:** `AssetPhysics.js` lines 20-35  
**Severity:** 🟡 MEDIUM  
**Finding:** ✅ ALREADY CORRECT  

The code DOES apply efficiency asymmetrically:
- **Discharge:** `internalCostMwh = mwh / eff` (export 100 MW, lose 111 MWh SoC)
- **Charge:** `internalGainMwh = mwh * eff` (import 100 MW, gain 90 MWh SoC)

AND `availMW()` correctly factors this:
```javascript
// Discharge capacity: Physical SoC * eff / duration
isShort ? clamp(((sofuel - MIN_SOC) / 100 * def.maxMWh * def.eff) / SP_DURATION_H, ...)
// Charge capacity: Available headroom / eff / duration  
      : clamp(((MAX_SOC - sofuel) / 100 * def.maxMWh / def.eff) / SP_DURATION_H, ...)
```

✅ **NO FIX NEEDED** - This is correct!

---

## 4. LOW: Forecast Skill Integration - VERIFIED WORKING

**File:** `ForecastEngine.js` line 77  
**Severity:** 🟢 LOW  
**Finding:** ✅ ALREADY CORRECT

Skill level IS used in confidence band calculation:
```javascript
const confidence = demand.map(d => d * this.params.noise_level * (1.1 - this.skill_level));
// skill=0.0: confidence*1.1 (worst accuracy)
// skill=0.9: confidence*0.2 (good accuracy)
```

✅ **NO FIX NEEDED** - Slider accurately affects forecast noise!

---

## 5. PERFORMANCE: GunDB Heartbeat Efficiency

**File:** `WaitingRoom.jsx` lines 58-60  
**Severity:** 🟡 MEDIUM  
**Issue:**
Heartbeat updates to `players/{pid}.lastSeen` every 5s trigger full UI recalculation in `NESOScreen.jsx` leaderboard.

**Fix:** Separate metadata from heartbeat:
```javascript
// OLD: Triggers full re-render
gun.get(roomKey(room, "players")).get(pid).put({ lastSeen: Date.now() });

// NEW: Use separate heartbeat node
gun.get(roomKey(room, "heartbeat")).get(pid).put(Date.now());
// Then in NESOScreen, only read heartbeat for active player count, not full player data
```

**Status:** ⏳ OPTIMIZATION - Not blocking

---

## 6. MEDIUM: DSR Rebound Penalty Mitigation

**File:** `DsrScreen.jsx` + `SettlementEngine.js`  
**Severity:** 🟡 MEDIUM  
**Issue:**
If DSR is forced to rebound while grid is SHORT (high prices £500+/MWh), they absorb massive penalty for "helping."

**Fix Suggestion:**
Add "Rebound Credit Window" - Cap imbalance price during forced rebound:
```javascript
// In computeImbalanceSettlement:
if (reboundActive && imbalanceMw > 0) {
  // Player is being forced to consume
  // Cap the price they pay to average of last 3 SPs
  const cappedPrice = Math.min(price, averagePriceLastThreeSps);
  const cash = imbalanceMw * spDurationH * cappedPrice;
  return { cash, reboundCredited: price > cappedPrice };
}
```

**Status:** ⏳ DESIGN DECISION - Awaiting gameplay balance feedback

---

## Implementation Checklist

- [ ] **HIGH:** Audit `cash` calculation in game state (double-dip settlement)
- [ ] **HIGH:** Implement net-zero bidding for BESS (allow Buy when full if Sell contract exists)
- [ ] **MEDIUM:** Optimize GunDB heartbeat into separate node
- [ ] **MEDIUM:** Optional: Add DSR rebound credit window
- [ ] **LOW:** Verify forecast skill integration is visible in UI

---

## Testing Requirements

After fixes:
1. ✅ Settlement test: Verify `totalRev` = `daCash + imbalanceCash` (not double-counted)
2. ✅ BESS test: Full battery + Sell contract can now "Buy" to offset
3. ✅ Forecast test: Skill slider changes noise band visually
4. ✅ Leaderboard: Doesn't flicker on heartbeat updates
