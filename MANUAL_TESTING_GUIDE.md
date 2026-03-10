# GridForge – Comprehensive Manual Testing Guide

## Overview

This document outlines manual testing procedures for the GridForge Balancing Mechanism simulator. Before releasing to your office colleagues, conduct a **30-minute chaos session** where trusted testers attempt to break the game.

This complements the automated unit tests (`MultiplayerIntegration.test.js`), E2E tests (`gridforge-comprehensive.test.cjs`), and network resilience tests (`network-chaos.test.cjs`).

---

## Pre-Test Checklist

### Environment Setup
- [ ] Game is running on your development server (`npm run dev`)
- [ ] At least 2 team members available (ideally 3–5 for multiplayer testing)
- [ ] Each tester has a separate browser window or incognito tab
- [ ] Network is stable (no intentional disruptions except in chaos scenarios)
- [ ] Browser console is open (F12 → Console tab) to spot JavaScript errors
- [ ] Test duration blocked: **30–45 minutes uninterrupted**

### Test Room Setup
- [ ] Pick a room code (e.g., `CHAOS1`, `BREAKME`, `STRESS1`)
- [ ] Assign roles:
  - **1 tester** = System Operator (NESO) — controls phase advances
  - **1–2 testers** = Physical assets (Generator, BESS, DSR) — submit bids
  - **1 tester** = Trader (if available) — does speculative trading
- [ ] All testers join the same room within 2 minutes of starting

---

## Testing Phases

### Phase A: Edge Case Input (Widget Testing)

These tests focus on **breaking input validation** and exposing UI bugs.

#### A1. Extreme Number Inputs
- [ ] **Test**: In DA phase, try entering `999999` in the MW output field
  - **Expected**: Input clamped or rejected; error message shown
  - **Fail**: Value accepted and bid submitted with 999,999 MW (breaks market)
  
- [ ] **Test**: Enter `-5000` in a price field
  - **Expected**: Negative rejected or clamped to $0
  - **Fail**: Negative price causes clearing algorithm to crash
  
- [ ] **Test**: Enter `0.0000001` (tiny decimal) in a 10 MW field
  - **Expected**: Rounding or min order size enforced
  - **Fail**: Order for 0.0000001 MW clutters merit order
  
- [ ] **Test**: Leave MW field blank and hit submit
  - **Expected**: Form validation error ("Required field")
  - **Fail**: Blank bid submitted, clearing algorithm hangs on NaN

#### A2. Rapid Input Changes
- [ ] **Test**: Fill MW field with `50`, then rapidly change to `75`, then `25` (3–4 times per second)
  - **Expected**: UI settles on final `25` value
  - **Fail**: React state gets out of sync; UI shows `50` but server sees `25`

#### A3. Copy-Paste Madness
- [ ] **Test**: Copy a number field, paste it 20 times rapidly
  - **Expected**: Only one bid submitted
  - **Fail**: Multiple duplicate bids submitted (no debouncing)

---

### Phase B: Button Lifecycle (Submission Testing)

These tests verify that submit buttons follow a **disable → success → lock** pattern.

#### B1. Double-Submit Prevention
- [ ] **Test**: Fill in a DA offer (Generator: 50 MW, £40)
- [ ] **Test**: Click "SUBMIT DA OFFER" button **twice** (within 1 second)
  - **Expected**: First click submits; second click is ignored (button disabled)
  - **Fail**: Two bids submitted for same offer; double charging to account
  
- [ ] **Test**: Submit a bid, then rapidly press the button 10+ times before page updates
  - **Expected**: Only one submission recorded
  - **Fail**: Multiple transactions on server

#### B2. Status Indication
- [ ] **Test**: After clicking submit, verify button changes state (text shows ✓, or becomes disabled)
  - **Expected**: Button shows `✓ SUBMITTED` or `LOCKED` state
  - **Fail**: Button text unchanged; tester unsure if submission worked

#### B3. Form Reset After Submit
- [ ] **Test**: Submit a bid (50 MW, £40)
- [ ] **Test**: Check if input fields are cleared and button is re-enabled for next phase
  - **Expected**: Fields cleared when phase advances; button unlocks in new phase
  - **Fail**: Old bid values persist; button stays locked in new phase (can't bid in ID)

---

### Phase C: Phase Transition Chaos (GunDB Sync Testing)

These tests verify all players sync correctly across phase boundaries.

#### C1. Phase Advance While Bidding
- [ ] **Test**: 
  1. Generator starts typing a bid (MW field has `25`)
  2. NESO advances phase to ID
  3. Check if Generator's partial bid is saved or lost
  - **Expected**: Bid is lost (partial inputs not saved); UI switches to ID phase
  - **Fail**: Bid is mysteriously submitted, or Generator still sees DA inputs in ID phase

#### C2. Browser Refresh During Phase
- [ ] **Test**:
  1. All players in DA phase
  2. One player (e.g., Trader) refreshes their browser (Ctrl+F5)
  3. Check if they rejoin the same game and phase
  - **Expected**: Trader re-enters DA phase with correct SP and game state
  - **Fail**: Trader joins a different room, or lands in wrong phase/SP

#### C3. Extreme Latency Phase Sync
- [ ] **Test**: Open Network Throttling (Chrome DevTools → Network tab)
  - Set to "Slow 3G" (2.5 Mbps down, 400ms latency)
  1. NESO advances phase
  2. Monitor how long other players take to see the new phase
  - **Expected**: < 5 seconds for "INTRADAY" to appear on all screens
  - **Fail**: Some players still in DA phase after 10+ seconds (GunDB not propagating)

---

### Phase D: Market Logic Stress Tests

These tests verify the **math and physics** don't break under extreme conditions.

#### D1. All Players Offer Zero Price
- [ ] **Test**: (BM phase)
  1. Generator offers 50 MW @ £0
  2. BESS offers 30 MW @ £0
  3. DSR offers 20 MW @ £0
  4. System is SHORT (needs supply)
  - **Expected**: Clearing price = £0 (or slight above due to congestion); all MW accepted
  - **Fail**: Clearing algorithm crashes ("divide by zero") or MCP = negative infinity

#### D2. One Player Bids Massive Volume
- [ ] **Test**: Generator bids 99,999 MW (or max allowed by input)
  - **Expected**: 
    - Either clamped to asset max (150 MW for OCGT)
    - Or accepted and clears market at their offer price
  - **Fail**: Overflow error; system imbalance wrong by orders of magnitude

#### D3. Exact Supply = Demand
- [ ] **Test**: (BM phase)
  1. Calculate system NIV (Net Imbalance Volume) from NESO's broadcast
  2. Have players collectively bid exactly that volume
  - **Expected**: Perfect clearing; MCP is either highest bid price (if short) or lowest offer price (if long)
  - **Fail**: Residual imbalance; MCP is nonsensical

#### D4. Battery at 100% SoC Tries to Charge
- [ ] **Test**: (ID or BM phase)
  1. BESS at 95%+ SoC
  2. Try to submit "Buy (Charge Battery)" order
  - **Expected**: Either:
    - Order is rejected ("SoC too high")
    - Or order accepted but 0 MW is cleared (availMW = 0)
  - **Fail**: Battery over-charged to 105% (physics broken)

#### D5. Generator at Min-Stable Dispatch Too Low
- [ ] **Test**: (BM phase)
  1. CCGT (min stable = 180 MW) in online state
  2. Try to dispatch for 50 MW (below minimum)
  - **Expected**: Either:
    - Dispatch rejected ("Below min stable")
    - Or plant trips offline (actual MW = 0)
  - **Fail**: Plant runs at 50 MW (violates thermal constraints)

---

### Phase E: Revenue & Settlement Sanity (Post-Game Checks)

After a full game (DA → ID → BM → Settlement), check if the **cashflow math adds up**.

#### E1. Total Revenue = Zero Sum
- [ ] **Test**: (Settlement phase)
  1. Record each player's final revenue
  2. Sum them: Gen_revenue + Supply_revenue + Trader_revenue + BESS_revenue + DSR_revenue + NESO_imbalance_penalty
  - **Expected**: Total very close to **£0** (within £100 if hub fee is ≤ ±£100)
  - **Fail**: Total profit = £10,000+ or deficit = £5,000 (money created/destroyed)

#### E2. Imbalance Cash Flows Correct Direction
- [ ] **Test**: 
  1. Note who was SHORT (selling more than contracted) vs LONG (buying more than contracted)
  2. Check settlement: SHORT players should gain; LONG players should lose (or vice versa)
  - **Expected**: SHORT player gains £100+ if market is in scarcity
  - **Fail**: SHORT player loses money in scarcity (logic reversed)

#### E3. Hub Fee Exists
- [ ] **Test**: Check NESO's revenue/Fee section
  - **Expected**: Hub fee collected (£50–£500 depending on market volatility)
  - **Fail**: Hub fee = £0 (settlement engine not charging fees)

---

### Phase F: UI/UX Stress (Visual & Interaction Testing)

#### F1. Leaderboard Updates
- [ ] **Test**: After settlement, check the Leaderboard
  - **Expected**: All players ranked by total profit, scores visible
  - **Fail**: Leaderboard empty, shows wrong player count, or previous game data visible

#### F2. Long Player Names
- [ ] **Test**: Change your name to `VeryLongPlayerNameThatIsMoreThan50Characters` and join
  - **Expected**: Name truncated or wrapped cleanly; doesn't break UI layout
  - **Fail**: Name causes table column overflow; buttons misaligned

#### F3. Rapid Role Switching
- [ ] **Test**: (Only if multi-asset game)
  1. Player with multiple assets rapidly switches between asset screens
  2. Check if SoC, fuel, or other asset state displays update correctly
  - **Expected**: All displays update instantly and correctly
  - **Fail**: Asset state shows stale data or crashes on switch

#### F4. Language/Font Edge Cases
- [ ] **Test**: (If applicable)
  1. Set browser to a non-English language
  2. Or use extreme font size (zoom to 200% or 50%)
  - **Expected**: App remains usable (labels readable, buttons clickable)
  - **Fail**: Text overflow; buttons off-screen; inputs unusable

---

### Phase G: Extreme Network Scenarios (If WLAN Testing Available)

#### G1. WiFi Disconnect Mid-Bid
- [ ] **Test**:
  1. Generator fills out a DA offer (50 MW, £40)
  2. Tester disconnects WiFi (unplug ethernet or airplane mode)
  3. Tester clicks submit
  4. Tester waits 5 seconds, then reconnects WiFi
  - **Expected**: Either:
    - Bid queued and submitted after reconnect
    - Or error message: "Network error, please retry"
  - **Fail**: Bid disappears silently; no error shown; tester unsure if bid was sent

#### G2. Phone Hotspot Fail
- [ ] **Test**: (If testers are on mobile)
  1. Mobile player playing on 4G hotspot
  2. Hotspot briefly drops (< 2 seconds)
  3. Player tries to submit bid during blip
  - **Expected**: Bid either queued or rejected gracefully
  - **Fail**: Session lost; player booted from game

---

## Scoring Rubric

### Critical Failures (Stops Release)
- [ ] Money creation/destruction (non-zero sum settlement)
- [ ] Double-submission of bids (duplicate charges)
- [ ] Player stuck in wrong phase (can't advance)
- [ ] Clearing algorithm crashes (NaN or undefined price)
- [ ] Asset physics violated (BESS > 100% SoC; Gen below min stable)

### Major Issues (Fix Before Release)
- [ ] Phase sync takes > 10 seconds
- [ ] Submit button allows re-submission before lock
- [ ] Bid values persist after phase change (old data in new phase)
- [ ] Leaderboard missing or incorrect

### Minor Issues (Document for v2)
- [ ] Layout breaks on extreme font sizes
- [ ] Asset names truncated in narrow windows
- [ ] Offline indicator not obvious
- [ ] Settings not persisted after refresh

---

## Test Report Template

After your 30-minute chaos session, fill out this template and share with your team:

```
═══════════════════════════════════════════════════════════════
  GridForge Manual Test Report
═══════════════════════════════════════════════════════════════

Date:        [DATE]
Duration:    [30+ minutes]
Testers:     [Names]
URL:         [localhost:5173]

CRITICAL FAILURES:
  [ ] None found ✅
  [ ] Found:
      - Item 1
      - Item 2

MAJOR ISSUES:
  [ ] None found ✅
  [ ] Found:
      - Issue 1
      - Issue 2

MINOR ISSUES / QUIRKS:
  [ ] None found ✅
  [ ] Found:
      - Quirk 1
      - Quirk 2

OVERALL ASSESSMENT:
  ✅ READY FOR RELEASE (no critical/major)
  ⚠️  NEEDS FIXES (have major issues)
  ❌ NOT READY (critical failures present)

NOTES:
[Any behavioral observations, user feedback, or suggestions]

═══════════════════════════════════════════════════════════════
```

---

## Running the Automated Test Suite First

Before manual testing, run the automated tests to catch obvious bugs:

```bash
# Unit tests (asset physics, settlement math)
npm test

# E2E comprehensive test (all roles, all phases)
node test/e2e/gridforge-comprehensive.test.cjs

# Network chaos tests (disconnect, late joiner, slow network)
node test/e2e/network-chaos.test.cjs
```

Fix any failures before inviting manual testers.

---

## Post-Test Signoff

Once you pass **both automated tests AND manual chaos session**, you're safe to release to your office colleagues.

Sign off:
- **Manual Test Lead**: _________________ Date: _________
- **Dev Team Lead**: _________________ Date: _________

---

## Common Issues & Fixes

### Issue: Settlement total not zero
**Diagnosis**: Check if hub fee calculation is correct in `SettlementEngine.js`
**Fix**: Verify `computeHubFeeFromSettlements()` is being called and result is included in NESO's P&L

### Issue: Phase doesn't sync across players
**Diagnosis**: GunDB may not be propagating Phase change
**Fix**: Check browser console for Gun errors; verify GunDB is connected to same relay

### Issue: Button stays disabled after settlement
**Diagnosis**: Submit button state not reset on phase change
**Fix**: In React component, reset button state when `phase` prop changes

### Issue: Battery overcharges to > 100%
**Diagnosis**: `updateSoF()` in `AssetPhysics.js` not clamping correctly
**Fix**: Verify `clamp(sofuel, MIN_SOC, MAX_SOC)` is applied at end of `updateSoF()` function

---

## Next Steps

After manual testing is complete and app is approved for release:

1. **Celebrate!** 🎉 You've bulletproofed your simulator.
2. **Schedule training session** with your office colleagues (30 min walkthrough + 1 hour hands-on game)
3. **Monitor feedback** during first week of live use; be ready to patch minor bugs
4. **Re-run automated suite** after any bug fixes to catch regressions
