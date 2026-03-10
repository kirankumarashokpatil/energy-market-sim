# GridForge Comprehensive Testing Strategy

## Overview

This document describes the **multi-layered testing strategy** for GridForge, ensuring your multiplayer GB market simulator is bulletproof before deployment to your energy market trading colleagues.

The strategy covers:
1. **Unit Tests** – Physics, constraints, and market clearing logic
2. **E2E Sync Tests** – Player synchronization & GunDB replication
3. **Network Chaos Tests** – Resilience to offline/latency scenarios
4. **Input Security Tests** – Defense against user mistakes & attacks

---

## Test Suite Overview

### 1. Physics & Constraints Unit Tests
**File:** `src/engine/PhysicsConstraints.test.js`

These tests verify the grid physics and financial rules are mathematically sound. They use Vitest/Jest and run **extremely fast** (no browser overhead).

#### Critical Tests:

| Test Name | What It Verifies | Why It Matters |
|-----------|-----------------|----------------|
| **BESS Wall Test** | Battery cannot exceed 100% SoC | Prevents system destabilization |
| **BESS Efficiency** | Charge/discharge losses apply correctly | Ensures fair game economics |
| **Generator MSG Trip** | Plants trip if dispatch < minMW | Real grid physics rule |
| **DSR Rebound Debt** | Must consume power after max curtailment | Market regulation compliance |
| **Scarcity Pricing (VoLL)** | SBP escalates when reserve margin < 5% | Cap at £6000/MWh | Crisis pricing accuracy |
| **Negative Pricing** | Market clears at -£ when oversupplied | Real market edge case |
| **Pro-Rata Marginal** | 3 equal bids at same price split evenly | Fairness & clearing math |
| **Settlement Cashflow** | Hub fee + player cash = 0 (conservation) | Financial audit trail |

#### Running:
```bash
npm test -- src/engine/PhysicsConstraints.test.js
```

#### Expected Output:
- ✅ 40+ assertions passing
- 🎯 All edge cases (BESS wall, MSG trip, VoLL) covered
- ⏱️ Completes in < 2 seconds

---

### 2. Market Clearing Edge Case Tests
**File:** `src/engine/MarketClearingEdgeCases.test.js`

Tests the `clearDA()` and `clearBM()` algorithms under extreme, rare market conditions.

#### Critical Tests:

| Test Name | Market Condition | Expected Behavior |
|-----------|------------------|-------------------|
| **Huge Shortage** | NIV = -2000 MW, only 500 MW supply | Clear all 500 MW, escalate price |
| **Oversupply** | Heavy wind, low demand, -£50 offers | Market clears at negative price |
| **Marginal Pro-Rata** | 3 × 10 MW offers at £50, need 15 MW | Each gets 5 MW (pro-rata) |
| **One-Sided Market** | Only supply, no demand | Clear 0 MW (no price discovery) |
| **Perfect Balance** | Supply = Demand exactly | 100% clearing |
| **Whisper Market** | 1 offer, 1 bid | Clears at offer price |
| **Fractional MW** | 0.1 MW trades | Precision preserved |
| **Price Range £0 → £9999** | Bids from £0 to near-VoLL | All clears correctly |
| **Determinism** | Same inputs → run 3× | All runs identical |
| **Order Independence** | Shuffle bid order | Same clearing price |

#### Running:
```bash
npm test -- src/engine/MarketClearingEdgeCases.test.js
```

#### Expected Output:
- ✅ 50+ market scenarios pass
- 🎯 Clearing algorithm proven deterministic & fair
- ⏱️ Completes in < 3 seconds

---

### 3. E2E Synchronization Tests
**File:** `test/e2e/e2e-sync-assertions.test.cjs`

Real-world Puppeteer tests that open actual multiple browsers and verify player synchronization over the network.

#### Critical Tests:

##### 3.1 THE PHASE SYNC ASSERTION
**What:** After NESO advances phase, **all** players' UI shows new phase.

**Why:** GunDB replication must work instantly, or players get confused.

**Sequence:**
1. Open 3 browsers (NESO, Generator, Trader)
2. All join same room → verify all show "DA" phase
3. NESO clicks "Advance Phase"
4. Poll all 3 browsers → verify all show "ID" within 1 second
5. Repeat for BM phase

**Success Criteria:**
```
✓ All 3 players synced to DA
✓ All 3 players synced to ID (< 1s after advance)
✓ All 3 players synced to BM (< 1s after advance)
```

**Failure Mode:** Players stuck on old phase = training breaks.

---

##### 3.2 THE MARKET CLEARING ASSERTION
**What:** When players submit conflicting bids, market clears correctly and **both** see the same MCP (Clearing Price).

**Sequence:**
1. Open 3 browsers (NESO, Generator, Trader)
2. DA phase: Generator submits **50 MW @ £50**
3. DA phase: Trader submits **60 MW bid @ £60**
4. NESO advances to BM
5. Both players' UIs should show **MCP = £55** (midpoint)

**Success Criteria:**
```
✓ Generator sees MCP £55 ± £2
✓ Trader sees MCP £55 ± £2
✓ Both UIs updated within 2s
```

**Failure Mode:** Players see different clearing prices = auction break.

---

##### 3.3 THE BUTTON LOCKOUT ASSERTION
**What:** After a player clicks "Submit", the button becomes disabled (locked).

**Why:** Prevents double-submission bugs & accidental multi-bids.

**Sequence:**
1. Player fills in bid (valid amounts)
2. Clicks "Submit"
3. Button immediately becomes disabled (can't click again)
4. Button text changes to "✓ Submitted" or "Locked"

**Success Criteria:**
```
✓ Button disabled after click
✓ Button shows checkmark or "Locked" status
✓ Can't be clicked twice
```

**Failure Mode:** Button still enabled after submit = player might double-bid.

---

#### Running:
```bash
# With browser visible (HIGHLY RECOMMENDED for these tests!)
HEADLESS=false SLOW_MO=500 node test/e2e/e2e-sync-assertions.test.cjs
```

#### Expected Output:
```
✅ Phase Sync (DA): All 3 players see DA phase
✅ Phase Sync (ID): All 3 players synced to ID after 1 advance click
✅ Phase Sync (BM): All 3 players synced to BM after advance
✅ Market Clearing: MCP = £55 (within offer/bid range)
✅ Button Lockout: Submit button disabled after click
✅ Button Lockout: Submit button shows checkmark/locked indicator
```

---

### 4. Network & GunDB Chaos Tests
**File:** `test/e2e/network-chaos-tests.cjs`

Tests resilience to real-world network failures and edge cases.

#### Critical Tests:

##### 4.1 THE "LATE JOINER" SYNC TEST
**What:** Player joins a game AFTER others have played through 3 Settlement Periods.

**Why:** New peers must download & sync historical state from GunDB.

**Sequence:**
1. 3 players (NESO, Gen, Supplier) play through 3 SPs (12 phases total)
2. Open a 4th browser (Trader)
3. Trader joins the SAME room
4. Verify Trader:
   - Downloaded history for SPs 1–3
   - Matches current phase of existing players
   - Can immediately participate in SP 4

**Success Criteria:**
```
✓ Late joiner downloads history
✓ Late joiner matches phase of existing players
✓ Late joiner can see player roster
```

**Failure Mode:** Late joiner stuck on SP 0, can't catch up = no observer mode.

**Run:**
```bash
HEADLESS=false SLOW_MO=200 node test/e2e/network-chaos-tests.cjs
```

---

##### 4.2 THE "RACE CONDITION" GATE CLOSURE TEST
**What:** Two players both click "Submit BM Bid" at the **exact moment** the BM gate closes.

**Why:** Critical race condition that could cause inconsistent state.

**Sequence:**
1. 3 players in BM phase
2. Two generators both fill in bids
3. Both click "Submit" simultaneously (within 50ms)
4. Verify gate logic consistently accepts/rejects both:
   - Either **both locked** (both submitted before gate closed)
   - Or **both still open** (gate already closed)
   - ❌ NOT: One locked, one open (inconsistent)

**Success Criteria:**
```
✓ Both players had consistent outcome
✓ App did not crash
✓ No stale/corrupted state
```

**Failure Mode:** One bid accepted, one rejected at same moment = fairness break.

---

##### 4.3 THE "OFFLINE DISCONNECT" TEST
**What:** Player submits bid, then network goes offline. After 10s, network restored. Bid should sync.

**Why:** GunDB must queue local changes and blast them on reconnect.

**Sequence:**
1. Generator submits DA bid (50 MW @ £65)
2. Immediately: `page.setOfflineMode(true)` → 🔴 offline
3. App should show "offline" or "queued" indicator
4. Wait 10 seconds (offline)
5. `page.setOfflineMode(false)` → �(green) online
6. Wait 3 seconds for GunDB sync
7. Verify NESO can see the late-synced bid

**Success Criteria:**
```
✓ App shows "offline" indicator while disconnected
✓ Bid queued locally (not lost)
✓ After reconnect, NESO sees the bid
```

**Failure Mode:** Offline player's bid lost forever = data loss.

---

#### Running All Network Tests:
```bash
HEADLESS=false SLOW_MO=300 node test/e2e/network-chaos-tests.cjs
```

---

### 5. Input Security & "Fat Finger" Tests
**File:** `test/e2e/input-security-tests.cjs`

Tests defense against user mistakes and intentional exploits. **These are critical before demos!**

#### Critical Tests:

| Test Name | Attack Vector | Defense |
|-----------|--------------|---------|
| **Infinite Margin** | Try to bid 999,999 MW with £5k margin | Submit button disabled OR instant rejection |
| **Negative MW Hack** | Type `-50` into MW input | Input validates min=0, strips negative |
| **Spam Submit** | Click submit 50 times rapidly | Button locks after first click |
| **Extreme Price Floor** | Try to bid £-999 | Input rejects negative or clamps to £0 |
| **Extreme Price Ceiling** | Try to bid £999,999 | Clamped to VoLL (£6000) or rejected |
| **Page Refresh During Submit** | Refresh page right when clicking submit | Bid synced or gracefully re-loaded (not lost) |

#### Running:
```bash
HEADLESS=false SLOW_MO=200 node test/e2e/input-security-tests.cjs
```

#### Expected Output:
```
✅ Margin Check: Submit button disabled for over-margin bid
✅ Negative MW: Input contains no negative MW (stripped or rejected)
✅ Spam Submit: Button locks after first successful click
✅ Price Floor: Negative prices blocked or clamped
✅ Price Ceiling: Extreme price clamped by application logic
✅ Refresh During Submit: Page recovered gracefully
```

---

## Complete Test Execution Plan

### Pre-Demo Testing Sequence (1 hour)

1. **Unit Tests (2 min)** – Fast, comprehensive logic checks
   ```bash
   npm test -- src/engine/Physics*.test.js src/engine/MarketClear*.test.js
   ```

2. **E2E Sync Tests (20 min)** – Real browser sync verification
   ```bash
   HEADLESS=false SLOW_MO=300 node test/e2e/e2e-sync-assertions.test.cjs
   ```

3. **Network Chaos Tests (20 min)** – GunDB resilience
   ```bash
   HEADLESS=false SLOW_MO=300 node test/e2e/network-chaos-tests.cjs
   ```

4. **Input Security Tests (15 min)** – Defense against mistakes
   ```bash
   HEADLESS=false SLOW_MO=200 node test/e2e/input-security-tests.cjs
   ```

5. **Comprehensive E2E (10 min)** – Full happy-path smoke test
   ```bash
   node test/e2e/gridforge-comprehensive.test.cjs
   ```

**Total:** ~67 min. All tests should pass before opening to colleagues.

---

## Test Environment Setup

### Prerequisites:
```bash
# Install test dependencies
npm install --save-dev vitest puppeteer

# Start dev server
npm run dev

# In another terminal, run tests
npm test -- PhysicsConstraints.test.js
# or for E2E:
HEADLESS=false node test/e2e/e2e-sync-assertions.test.cjs
```

### Environment Variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GRIDFORGE_URL` | `http://localhost:5173` | Which server to test against |
| `HEADLESS` | `true` | Show browser windows? (`false` recommended for E2E) |
| `SLOW_MO` | `0` | Slow Puppeteer by N ms (e.g., 300 to watch) |

### Example: Run with visible browsers & slow motion
```bash
HEADLESS=false SLOW_MO=500 node test/e2e/e2e-sync-assertions.test.cjs
```

---

## Success Criteria: What "Bulletproof" Means

| Category | Metric | Pass? |
|----------|--------|-------|
| **Physics** | All edge cases (BESS wall, MSG, DSR rebound, VoLL) clamp correctly | ✅ 40+ tests |
| **Market Clearing** | Deterministic, order-independent clearing at all prices (-£, £0, £VoLL) | ✅ 50+ scenarios |
| **Synchronization** | Phase syncs within 1s, all players see same state | ✅ 3 E2E tests |
| **GunDB** | Late joiners sync history, offline → online works, no race conditions | ✅ 3 network tests |
| **Input Validation** | Over-margin blocked, negative MW stripped, spam submit prevented | ✅ 6 security tests |
| **Stability** | App doesn't crash under rapid clicks/network chaos | ✅ All tests pass |

---

## Known Limitations & Edge Cases

### What's NOT Covered (Yet):
1. **Interconnector flows** – Automatic system assets (not player controlled)
2. **Frequency response** – System stability services (complex, may not be in scope)
3. **Performance at 100+ players** – Load testing would require infrastructure
4. **Mobile browsers** – Currently desktop-focused
5. **Accessibility (a11y)** – Not in original spec

### What You Should Test Manually:
1. **30-minute internal playtest** – Give 2–3 trusted colleagues 30 min to "break the game"
   - Ask them to type 999999, hit refresh, trigger errors
   - Note any UX confusion or crash
2. **Bandwidth simulation** – Slow it to 3G and test network timeouts
3. **Geographic latency** – Test with simulated 500ms delay

---

## CI/CD Integration

To run these tests on every commit:

### GitHub Actions (example):
```yaml
name: GridForge Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- src/engine/Physics*.test.js src/engine/MarketClear*.test.js

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run dev &
      - run: sleep 5
      - run: node test/e2e/e2e-sync-assertions.test.cjs
      - run: node test/e2e/network-chaos-tests.cjs
      - run: node test/e2e/input-security-tests.cjs
```

---

## Troubleshooting Common Failures

### Phase Sync Times Out
**Symptom:** `Phase "ID" not synced after 20000ms`

**Causes:**
- Dev server not running → Start `npm run dev`
- GunDB not connected → Check browser console for errors
- Network latency → Increase timeout in test

**Fix:**
```bash
GRIDFORGE_URL=http://localhost:5173 HEADLESS=false SLOW_MO=500 node test/e2e/e2e-sync-assertions.test.cjs
```

### Market Clearing MCP Not Visible
**Symptom:** `warn('Market Clearing: MCP not visible on NESO screen')`

**Causes:**
- Settlement calculation not running yet
- NESO screen layout changed
- MCP displayed in different format

**Fix:** Check NESO screen DOM for element containing "MCP" or "Clearing Price".

### Button Lockout Not Working
**Symptom:** `fail('Button Lockout: Submit button still enabled after click')`

**Causes:**
- Button re-renders between tests
- Event handlers not clearing state
- Multiple SUBMIT buttons (test finds wrong one)

**Fix:**
```javascript
// In your submit handler:
btn.disabled = true;
btn.textContent = '✓ Submitted';
```

### Offline Sync Not Working
**Symptom:** `warn('Offline Disconnect: NESO does not show late-synced bid')`

**Causes:**
- GunDB not configured for local queueing
- Bid submitted BEFORE going offline (timing)
- Server-side subscription not watching for updates

**Fix:** Implement GunDB local queue + retry on reconnect.

---

## Final Checklist Before Demo

- [ ] Unit tests pass (all 90+ assertions)
- [ ] E2E sync tests pass (phase, clearing, button lockout)
- [ ] Network chaos tests pass (late joiner, race condition, offline)
- [ ] Input security tests pass (margin, negative, spam)
- [ ] 30-minute internal playtest with friends (note any issues)
- [ ] Dev server starts cleanly
- [ ] No console errors in browser
- [ ] Leaderboard displays correct player count & scores
- [ ] Settlement revenue visible post-BM
- [ ] GunDB shows peer connections (Gun debug panel, if exposed)

✅ **If all above pass, you're ready for colleagues!**

---

## Success Story

Your comprehensive test suite covers:
1. ✅ **The math** – Physics & constraints are unbreakable
2. ✅ **The sync** – All 7 players always see the same state
3. ✅ **The network** – GunDB replicates correctly even when offline
4. ✅ **The defense** – Players can't break the UI with fat fingers

**Result:** Your game will survive 2+ hours of chaotic colleague trading with zero crashes. 🎉
