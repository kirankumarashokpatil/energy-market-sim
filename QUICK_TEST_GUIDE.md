# Quick Start: Running Your Comprehensive Test Suite

## One-Command Test Run

```bash
# Run all tests in order (unit → E2E → network)
npm test && node test/e2e/gridforge-comprehensive.test.cjs && node test/e2e/network-chaos.test.cjs
```

---

## Individual Test Commands

### 1️⃣ Unit Tests (Asset Physics & Market Math)
```bash
npm test
```

**Duration**: ~30 seconds  
**What it tests**: 
- BM clearing determinism
- Settlement zero-sum conservation
- Edge cases: BESS limits, Generator MSG, zero/negative pricing

**Success criteria**: All tests pass (0 failures)

---

### 2️⃣ E2E Comprehensive Test (7 Browsers, All Roles)
```bash
node test/e2e/gridforge-comprehensive.test.cjs
```

**Duration**: ~3–5 minutes  
**What it tests**:
- All 6 players (NESO, Generator, Supplier, Trader, BESS, DSR)
- All 4 phases (DA → ID → BM → Settlement)
- **Phase Sync Assertion**: ✅ All players see same phase
- **Button Lockout Assertion**: ✅ Submit buttons disable after use
- **Market Clearing Assertion**: ✅ MCP is calculated and logical
- Button states, role-specific KPIs, revenue panels

**Success criteria**: ✅ Passed assertions > 50

**To watch it run** (open browser windows):
```bash
HEADLESS=false node test/e2e/gridforge-comprehensive.test.cjs
```

**Custom server URL**:
```bash
GRIDFORGE_URL=http://your-server:5173 node test/e2e/gridforge-comprehensive.test.cjs
```

---

### 3️⃣ Network Chaos Tests (Disconnect, Late Joiner, 3G)
```bash
node test/e2e/network-chaos.test.cjs
```

**Duration**: ~2–3 minutes  
**What it tests**:
- **Disconnect Test**: Network drops, then reconnects; bid still syncs
- **Late Joiner Test**: Player joins after SP 1 & 2; downloads history; catches up
- **Slow 3G Test**: App loads and responds on throttled 400ms latency connection

**Success criteria**: ✅ 10+ passed assertions

---

### 4️⃣ Manual Testing (30–45 min, your team)
```bash
1. Open MANUAL_TESTING_GUIDE.md
2. Invite 2–5 colleagues
3. Run through chaos scenarios (7 phases of testing)
4. Fill out test report
5. Sign off
```

**Success criteria**: 
- [ ] No critical failures
- [ ] No major issues
- [ ] Team confident in release

---

## Expected Outputs

### ✅ All Tests Pass
```
═══════════════════════════════════════════════════════════════════
  GRIDFORGE TEST SUITE – ALL PASSING
═══════════════════════════════════════════════════════════════════

Unit Tests:
  ✓ Multiplayer integration harness
  ✓ Edge Case Tests – Physics Constraints
  PASS  10 passed

E2E Comprehensive:
  ✓ Join: All 6 players (NESO, Gen, Sup, Trader, BESS, DSR)
  ✓ DA Phase: Phase Sync + Button Lockout on all players
  ✓ ID Phase: Phase Sync + Button Lockout on all players
  ✓ BM Phase: Phase Sync + Button Lockout + Market Clearing
  ✓ Settlement: Phase Sync + Revenue panels visible
  PASS  28 passed, 0 failed

Network Chaos:
  ✓ Test 1: Disconnect & Reconnect
  ✓ Test 2: Late Joiner Catches Up
  ✓ Test 3: Slow 3G Resilience
  PASS  11 passed, 0 failed

Manual Testing:
  ✓ Completed by team
  ✓ No critical failures found
  ✓ SIGNED OFF FOR RELEASE
═══════════════════════════════════════════════════════════════════
```

---

### ❌ If a Test Fails

#### Example: Phase Sync Fails
```
  ❌ Phase Sync: Mismatch on "BM"
     Players see: BM, BM, ID, BM, ID, BM
```

**What to do**:
1. Check GunDB relay is running: `gun-relay.cjs` in your terminal
2. Verify all browsers are on same room code
3. Check browser console (F12) for Gun connection errors
4. Re-run with `HEADLESS=false` to debug visually

#### Example: Button Lockout Fails
```
  ❌ Button Lockout (Generator): Submit button still ENABLED after submission
```

**What to do**:
1. Check React component that renders submit button
2. Verify `disabled` attribute is set after state update
3. Check for event handler preventing state change
4. Inspect with DevTools: right-click button → "Inspect" → check `disabled` ?

#### Example: Market Clearing Fails
```
  ❌ Market Clearing: MCP £999,999 is logical (SBP: £50.00, SSP: £42.50)
```

**What to do**:
1. Check `clearBM()` function in `MarketEngine.js`
2. Verify prices are within logical range
3. Look for divide-by-zero or NaN in clearing algorithm
4. Add debug logging: `console.log('BM result:', result);`

---

## Test Configuration

### Environment Variables

```bash
# Run E2E tests with browser window visible (for debugging)
HEADLESS=false node test/e2e/gridforge-comprehensive.test.cjs

# Use custom server URL
GRIDFORGE_URL=http://192.168.1.100:5173 node test/e2e/gridforge-comprehensive.test.cjs

# Slow down Puppeteer actions (helpful for watching what happens)
SLOW_MO=500 node test/e2e/gridforge-comprehensive.test.cjs

# Combine: watch, slow, custom URL
HEADLESS=false SLOW_MO=500 GRIDFORGE_URL=http://localhost:5174 \
  node test/e2e/gridforge-comprehensive.test.cjs
```

### System Requirements

- **Node.js** 16+ (for Puppeteer)
- **Chrome/Chromium** browser (automatically installed by Puppeteer)
- **GunDB relay** running (in separate terminal: `node gun-relay.cjs`)
- **GridForge app** running on dev server (in separate terminal: `npm run dev`)

---

## Test Result Categories

### ✅ PASS - All Green
```
✓ Phase Sync: All 6 players show "BM"
✓ Market Clearing: MCP £47.50 is logical
✓ Button Lockout (Generator): Submit button is DISABLED
```
→ **Safe to release**

### ⚠️ WARN - Non-Blocking Issues
```
⚠ Generator: App may not have visual offline indicator (may not have imbalance costs)
⚠ Market Clearing: MCP not visible on NESO screen (Check backend calculations)
```
→ **Document for next version, release is safe**

### ❌ FAIL - Blocking Issues
```
❌ Market Clearing: MCP £999,999 is logical
❌ Button Lockout (Generator): Submit button still ENABLED
❌ Settlement total not zero-sum (difference: £5,000)
```
→ **Fix before release**

---

## Debugging Tips

### 1. Check GunDB Connection
```javascript
// In browser console:
console.log(window.Gun);  // Should be defined
console.log(window.gunState);  // Should have game state
```

### 2. Watch Network Traffic
1. Open DevTools (F12)
2. Network tab → right-click → "Disable cache"
3. Look for failed Gun requests (any 4xx/5xx?)
4. Check WebSocket status (should be green/connected)

### 3. Debug a Specific Assertion
Add temporary logging in the test:

```javascript
// In gridforge-comprehensive.test.cjs, before verifyPhaseSync():
const phaseData = await Promise.all(pages.map(p => p.evaluate(() => {
    console.log('Page phase data:', document.body.textContent.substring(0, 200));
    return getPhaseLabel(p);
})));
console.log('All phases:', phaseData);
```

### 4. Replay a Failed Test
```bash
# Keep app/relay running
HEADLESS=false SLOW_MO=500 node test/e2e/gridforge-comprehensive.test.cjs

# Manually step through in browser windows
# Press pause, edit inputs, inspect state
```

---

## Full Release Workflow

```
┌─────────────────────────────────────────────────────────┐
│  1. Start GunDB Relay                                   │
│     $ node gun-relay.cjs                                │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  2. Start GridForge Dev Server                          │
│     $ npm run dev                                       │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  3. Run All Tests                                       │
│     $ npm test && \                                     │
│       node test/e2e/gridforge-comprehensive.test.cjs && \
│       node test/e2e/network-chaos.test.cjs             │
│                                                         │
│     Expected: 49 passed, 0 failed                       │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  4. If ANY FAIL:                                        │
│     • Check browser console for errors                  │
│     • Review GunDB relay logs                           │
│     • Re-run with HEADLESS=false to debug visually      │
│     • Read error message carefully                      │
│     • Fix bug in code                                   │
│     • Go back to Step 3                                 │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  5. Schedule Manual Testing Session                     │
│     • 30 min prep: Print MANUAL_TESTING_GUIDE.md        │
│     • 45 min testing: Run with 2–5 colleagues          │
│     • 15 min debrief: Fill out test report             │
│                                                         │
│     Expected: No critical/major issues, team confident  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  6. Release to Office 🎉                               │
│     • Schedule training session                         │
│     • Have test results on hand for any questions       │
│     • Monitor first week for feedback                   │
└─────────────────────────────────────────────────────────┘
```

---

## Frequently Asked Questions

### Q: How long do all tests take?
**A**: ~10 minutes total
- Unit tests: 30 seconds
- E2E test: 3–5 minutes  
- Network tests: 2–3 minutes
- Manual testing: 30–45 minutes (separate session)

### Q: Do I need to run all tests, or just one?
**A**: Before release: **all of them**.  
For development: run just the test category you're working on (unit tests if fixing physics, E2E if fixing UI, etc.)

### Q: Can I run tests on a deployed server (not localhost)?
**A**: Yes!
```bash
GRIDFORGE_URL=https://gridforge.example.com node test/e2e/gridforge-comprehensive.test.cjs
```

### Q: What if a test hangs (doesn't finish)?
**A**: Press `Ctrl+C` to force quit. Then:
1. Check if GunDB relay crashed (terminal with gun-relay.cjs)
2. Check if dev server crashed
3. Restart both and try again

### Q: Can I modify the tests for my use case?
**A**: Absolutely! The tests are in your repo and documented. Feel free to:
- Add more players
- Test specific role combinations
- Add industry-specific scenarios
- Customize assertion thresholds

---

## Success! 🚀

When all tests pass:

```
═══════════════════════════════════════════════════════
  ✅ GRIDFORGE IS BULLETPROOF
═══════════════════════════════════════════════════════

Unit Tests:      ✓ 10 passed
E2E Tests:       ✓ 28 passed
Network Tests:   ✓ 11 passed
Manual Testing:  ✓ Completed & Signed Off

READY FOR RELEASE TO OFFICE COLLEAGUES 🎉

═══════════════════════════════════════════════════════
```

Your multiplayer GB market simulator can now safely handle:
- 7 concurrent players
- All 4 phases with perfect sync
- Network disconnections and late joiners
- Edge cases and user errors
- Revenue conservation and zero-sum settlement

**Enjoy your training session!** ⚡
