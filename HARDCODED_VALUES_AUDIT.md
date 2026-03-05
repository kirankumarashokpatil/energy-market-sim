# GridForge Hardcoded Values Audit

**Date:** March 5, 2026  
**Scope:** Complete search of src/components/roles/*.jsx, src/engine/*.js, src/shared/*.js  
**Status:** All hardcoded numerical values identified for extraction into configuration

---

## Summary Statistics
- **Total Hardcoded Values Found:** 250+
- **Files Affected:** 10 core files
- **Categories:** Prices (£/MWh), MW capacities, MWh storage, percentages, multipliers, timestamps, thresholds

---

## SHARED CONSTANTS (src/shared/constants.js)

### Timing & Duration
| Value | Line | Type | Context | Should be Extracted |
|-------|------|------|---------|-------------------|
| 15000 | 4 | ms | TICK_MS — tick interval | YES - Configurable by game mode |
| 9000 | 6 | ms | DA_CYCLE — DA window | YES - Different modes need different gates |
| 30000 | DA timing | ms | Slow tick speed | YES - Preset in TICK_SPEEDS |
| 10000 | NORMAL | ms | Normal tick speed | YES |
| 5000 | TURBO | ms | Turbo tick speed | YES |
| 4000 | 129 | ms | ID_WINDOW_MS — intraday gate | YES - Should align with phase duration |
| 0.5 | 8 | hours | SP_DURATION_H — settlement period | YES - Critical constant used everywhere |

### SoC & Energy Bounds
| Value | Line | Type | Context | Should be Extracted |
|-------|------|------|---------|-------------------|
| 10 | 5 | % | MIN_SOC — minimum battery SoC | YES - Different for BESS_S vs _M vs _L |
| 90 | 5 | % | MAX_SOC — maximum battery SoC | YES - Hysteresis for different assets |

### Frequency & Grid Failure
| Value | Line | Type | Context | Should be Extracted |
|-------|------|------|---------|-------------------|
| 49.5 | 10 | Hz | FREQ_FAIL_LO — system frequency lower limit | YES - National Grid Standard |
| 50.5 | 10 | Hz | FREQ_FAIL_HI — system frequency upper limit | YES - National Grid Standard |
| 5 | 11 | SP | FREQ_FAIL_DURATION — ticks before blackout | YES - Regulatory parameter |

### Forgiveness Mode
| Value | Line | Type | Context | Should be Extracted |
|-------|------|------|---------|-------------------|
| 0.25 | 15 | multiplier | Penalty multiplier in tutorial | YES - Per-mode setting |
| 15 | 16 | SP | Frequency failure duration extended in tutorial | YES - Per-mode setting |
| 0.5 | 17 | multiplier | Wear cost halved in tutorial | YES - Per-mode setting |

### Scenario Parameters (SCENARIOS dict)
| Scenario | NIV Bias | Price Mod | Wind Mod | Event Prob | Status |
|----------|----------|-----------|----------|-----------|--------|
| NORMAL | 0 | 1.0 | 1.0 | 1.0 | Hardcoded |
| WINTER_PEAK | -150 MW | 1.45 | 0.65 | 1.3 | Hardcoded |
| WIND_GLUT | +160 MW | 0.55 | 1.85 | 0.8 | Hardcoded |
| DUNKELFLAUTE | -220 MW | 1.90 | 0.04 | 0.6 | Hardcoded |
| SPIKE | -180 MW | 2.20 | 0.50 | 2.0 | Hardcoded |

**Action:** Extract to `SCENARIO_CONFIG` JSON

---

## ASSET DEFINITIONS (ASSETS dict in constants.js)

### BESS Assets
| Asset | Max MW | Max MWh | Eff % | Wear £/MWh | Min Stable | Ramp MW/SP | Status |
|-------|--------|---------|-------|-----------|-----------|-----------|--------|
| BESS_S | 15 | 30 | 92% | 4 | 0 | 15 | Hardcoded |
| BESS_M | 50 | 100 | 90% | 8 | 0 | 50 | Hardcoded |
| BESS_L | 100 | 400 | 87% | 13 | 0 | 100 | Hardcoded |
| HYDRO | 120 | 720 | 76% | 1.5 | 0 | 60 | Hardcoded |

### Thermal Assets
| Asset | Max MW | Fuel MWh | Min Stable | Ramp | Startup SPs | Startup Cost | Var Cost | Status |
|-------|--------|----------|-----------|------|------------|----------|----------|--------|
| OCGT | 150 | 600 | 40 MW | 30 | 1 SP | £3,500 | £85/MWh | Hardcoded |
| CCGT | 450 | 999999 | 180 MW | 15 | 2 SPs | £12,000 | £65/MWh | Hardcoded |
| NUCLEAR | 1000 | 999999 | 700 MW | 5 | 6 SPs | £50,000 | £10/MWh | Hardcoded |

### Flexible & Renewable Assets
| Asset | Max MW | Duration | Rebound | Loss % | Status |
|-------|--------|----------|---------|--------|--------|
| DSR | 65 MW | 2 SPs max | 1.2x multiplier | — | Hardcoded |
| WIND | 120 MW | — | — | 0% | Hardcoded |
| SOLAR | 80 MW | — | — | 0% | Hardcoded |

### Interconnectors
| Cable | Max MW | Foreign Market | Loss % | Ramp MW/SP | Status |
|-------|--------|----------------|--------|-----------|--------|
| IFA (France) | 2000 | priceFR | 3% | 500 | Hardcoded |
| NSL (Norway) | 1400 | priceNO | 3% | 350 | Hardcoded |
| BritNed (NL) | 1000 | priceNL | 3% | 250 | Hardcoded |
| Viking (Denmark) | 1400 | priceDK | 3% | 350 | Hardcoded |

**Action:** Extract to `ASSET_CONFIG.json` with versioning

---

## SUPPLIER DEFINITIONS (SUPPLIERS dict)

| Supplier | Portfolio MW | Forecast Error % | Retail Tariff | Risk Appetite | Status |
|----------|--------------|------------------|---------------|---------------|--------|
| BRITISH_GAS | 1800 MW | ±4% | £150/MWh | LOW | Hardcoded |
| OCTOPUS | 1200 MW | ±6% | £140/MWh | HIGH | Hardcoded |
| EDF | 1500 MW | ±5% | £145/MWh | MEDIUM | Hardcoded |
| OVO | 900 MW | ±5% | £148/MWh | MEDIUM | Hardcoded |
| SCOTTISH_POWER | 1100 MW | ±5% | £146/MWh | MEDIUM | Hardcoded |

**Action:** Extract to `SUPPLIER_CONFIG.json`

---

## EVENT PROBABILITIES & PRICE IMPACTS (EVENTS array)

| Event ID | NIV Impact | Price Δ | Probability | Status |
|----------|-----------|---------|------------|--------|
| TRIP | -280 MW | +£45 | 6% | Hardcoded |
| WIND_UP | +200 MW | -£18 | 8% | Hardcoded |
| DMD_HI | -140 MW | +£18 | 9% | Hardcoded |
| DMD_LO | +120 MW | -£14 | 7% | Hardcoded |
| DUNKEL | -350 MW | +£65 | 3% | Hardcoded - CRITICAL |
| COLD | -200 MW | +£35 | 4% | Hardcoded |
| INTERCON | +180 MW | -£22 | 5% | Hardcoded |
| CASCADE | -420 MW | +£80 | 2% | Hardcoded |
| SPIKE | -250 MW | +£90 | 2% | Hardcoded |
| WIND_LOW | -180 MW | +£22 | 10% | Hardcoded |

**Action:** Extract to `EVENT_DEFINITIONS.json` with seasons/scenarios

---

## MARKET ENGINE (src/engine/MarketEngine.js)

### Price Calculation Multipliers
| Context | Value | Purpose | Status |
|---------|-------|---------|--------|
| Base demand curve scaling | 0.72 + 0.28 multiplier | Day profile amplitude | Hardcoded |
| Demand hour range | 5 - 24 | Hours in demand phase | Hardcoded |
| Expected demand range | [0.4, 1.2] | DA forecast clamping | Hardcoded |
| Wind range | [0, 1] | Normalized wind capacity | Hardcoded |
| Solar hour range | 6 - 18 | Daylight window | Hardcoded |
| Solar amplitude | 0.8 + 0.4 variation | Peak solar | Hardcoded |
| Base NIV multiplier | 650 | NIV scaling factor | Hardcoded |
| NIV demand coupling | -0.52 | NIV baseline offset | Hardcoded |

### SBP/SSP Calculation
| Scenario | Short SBP Mult | Long SBP Mult | Short SSP Mult | Long SSP Mult | Min | Max |
|----------|---|---|---|---|---|---|
| System Short (NIV < 0) | 1.32× | 0.82× | 0.72× | 1.22× | £10 | £900 |
| System Long (NIV ≥ 0) | Same multipliers reversed | Same | £5 | £800 |

**Action:** Extract to `PRICE_MODEL_CONFIG.json`

### Regional European Price Curves (Line 45-49)
| Market | Base Formula | Amplitude | Bias | Status |
|--------|--------------|-----------|------|--------|
| France (priceFR) | 50 + 40×sin(...) | 40 | -2 | Hardcoded — Nuclear stable |
| Norway (priceNO) | 40 + 20×sin(...) | 20 | -1 | Hardcoded — Hydro stable |
| Netherlands (priceNL) | 95% × GB + variation | 20-30 | 0 | Hardcoded — Gas coupled |
| Denmark (priceDK) | 30 + (1-wind)×60 | 60 | 0 | Hardcoded — Wind inverse |

**Action:** Extract to `FOREIGN_PRICE_MODEL.json`

### Forecast Error Components (Line 80-85)
| Component | Range | Purpose | Status |
|-----------|-------|---------|--------|
| windError | -12% to +18% | Wind forecast error band | Hardcoded |
| demandError | ±120 MW | Demand forecast error | Hardcoded |
| solarError | -6% to +14% | Solar forecast error band | Hardcoded |

**Action:** Extract to `FORECAST_ERROR_CONFIG.json`

### Bot Bid Strategy (Line 110-130)
| Parameter | Value | Purpose | Status |
|-----------|-------|---------|--------|
| Min MW | 6 | Minimum bot bid size | Hardcoded |
| Max MW allocation | 65% of capacity | Bot MW as % of max | Hardcoded |
| Price markup (SHORT) | 0.55+ (0-55% premium) | Bot markup when SHORT | Hardcoded |
| Price markup (LONG) | 1.15+ (15-170% premium) | Bot markup when LONG | Hardcoded |

**Action:** Extract to `BOT_BIDDING_STRATEGY.json`

---

## ROLE SCREENS

### BessScreen.jsx Hardcoded Values
| Line | Value | Type | Context | Should Extract |
|------|-------|------|---------|-----------------|
| 23 | 50 | £/MWh | SBP default | YES - Use market data |
| 23 | 50 | £/MWh | SSP default | YES - Use market data |
| 31 | 100 | divisor | SoC percentage | YES - Reference to MAX_SOC constant |
| 31 | 0.5 | hours | SP duration in discharge calc | YES - Use SP_DURATION_H |
| 86 | 0.8 | multiplier | SBP discount for BM price hint | YES - Parameter |
| 86 | 1.2 | multiplier | SSP markup for BM price hint | YES - Parameter |

**Action:** Replace with constants.js references

### DsrScreen.jsx Hardcoded Values
| Line | Value | Type | Context | Should Extract |
|------|-------|------|---------|-----------------|
| 23 | 50 | £/MWh | SBP default | YES |
| 24 | 50 | £/MWh | SSP default | YES |
| 68 | 30 | minutes display | Curtail duration in mins | YES - Derived from constant |
| 213 | 0.8 | multiplier | SBP discount for BM | YES |
| 213 | 1.5 | multiplier | SBP markup for BM (DSR special) | YES - **INVESTIGATE** |

**Action:** Verify SBP 1.5× multiplier — is this intentional for DSR role?

### GeneratorScreen.jsx Hardcoded Values
| Line | Value | Type | Context | Should Extract |
|------|-------|------|---------|-----------------|
| 23 | 50 | £/MWh | SBP default | YES |
| 23 | 50 | £/MWh | SSP default | YES |
| 55 | 0.5 | hours | SP duration in ramp calc | YES - Use SP_DURATION_H |
| 220 | 0.8 | multiplier | SBP discount for BM | YES |
| 220 | 1.2 | multiplier | SSP markup for BM | YES |

### InterconnectorScreen.jsx Hardcoded Values
| Line | Value | Type | Context | Should Extract |
|------|-------|------|---------|-----------------|
| 13 | 50 | £/MWh | baseRef default | YES |
| 45 | 0.03 | fraction | Loss factor (3%) | YES - Asset-specific, check definitions |
| 67 | 1000 | MW | Max IC capacity sample | YES - Use from ASSETS.IC_* |

### NESOScreen.jsx Hardcoded Values
| Line | Value | Type | Context | Should Extract |
|------|-------|------|---------|-----------------|
| 93-96 | 50, 50, 0, 50 | mixed | Market defaults | YES |
| 168 | 35 | GW | Base demand in calculations | **INVESTIGATE** - Why 35? UK avg is ~40-45GW |
| 168 | 0.72 + 0.28 × ... | formula | Demand curve peak factor | YES - From market engine |
| 232 | 500 | MW | Dynamic Containment service level | YES - PARAMETER |
| 233-236 | 200, 75 | MW | Freq response multiplier | YES - PARAMETER |

**Action:** Review demand baseline assumptions

### SupplierScreen.jsx Hardcoded Values
| Line | Value | Type | Context | Should Extract |
|------|-------|------|---------|-----------------|
| 23 | 50 | £/MWh | SBP default | YES |
| 23 | 50 | £/MWh | SSP default | YES |
| Various | supplier defaults | various | Retail tariffs, portfolio MW | YES - All in constants already |

### TraderScreen.jsx Hardcoded Values
| Line | Value | Type | Context | Should Extract |
|------|-------|------|---------|-----------------|
| 71 | 5000 | £ | Starting capital for trader | YES - Different per role/mode |
| 72 | 1000 | £ | Margin floor threshold | YES |
| 99-100 | 100 | divisor | Price range in sparkline | YES - Parameter |

**Action:** Make trader starting capital configurable per game mode

---

## SCORING ENGINE (src/engine/ScoringEngine.js)

### Scoring Thresholds
| Metric | Breakpoint Array | Purpose | Status |
|--------|------------------|---------|--------|
| Trader RAR | [[-1000,10],[0,30],[0.5,50],[1,70],[1.5,85],[2,100]] | Risk-Adjusted Return thresholds | Hardcoded |
| Generator Profit/MW | [[-500,0],[0,20],[100,50],[400,70],[700,85],[1000,100]] | £/MW breakpoints | Hardcoded |
| BESS £/MWh | [[0,20],[50,50],[100,70],[150,85],[200,100]] | Revenue per MWh shifted | Hardcoded |
| Supplier Cost/MWh | [[100,10],[80,40],[65,60],[50,80],[40,100]] | Cost per MWh (inverted) | Hardcoded |
| DSR Reliability Rev | [[-500,0],[0,20],[50,50],[100,70],[150,85],[200,100]] | Revenue × reliability | Hardcoded |
| Interconnector Congestion | [[0,20],[5000,50],[15000,70],[30000,85],[50000,100]] | Congestion revenue bands | Hardcoded |

### Weighting
| Component | Weight | Status |
|-----------|--------|--------|
| Role Score vs System Score (alpha) | 0.6 | Hardcoded |
| Consistency penalty (multi-round) | 0.1 | Hardcoded |
| Stress NIV threshold | 300 MW | Hardcoded |

### Role-Specific Weights
| Role | Primary Weight | Secondary Weight | Status |
|------|---|---|---|
| Trader | 85% | 15% | Hardcoded |
| Generator | 80% | 20% | Hardcoded |
| BESS | 75% | 25% | Hardcoded |
| Supplier | 80% | 20% | Hardcoded |
| DSR | 80% | 20% | Hardcoded |
| Interconnector | 80% | 20% | Hardcoded |
| NESO | 40% stab, 20% cost, 15% MAE, 25% clearing | Composite | Hardcoded |
| Elexon | 50% acc, 30% time, 20% trans | Composite | Hardcoded |

**Action:** Extract entire scoring config to `SCORING_CONFIG_v2.json` with documentation

### Scoring Reference Values
| Value | Line | Purpose | Status |
|-------|------|---------|--------|
| 50 | Generator imbalance cost ceiling | £50/MWh reference for imbalance scoring | Hardcoded |
| 6.2 | NESO stability calc | Divides avg NIV (origin unclear) | **INVESTIGATE** |
| 200 | NESO clearing | BM share scaling to 100 | Hardcoded |
| 20 | BESS SoC penalty | Points per SoC event | Hardcoded |
| 15 | DSR missed event | Points per missed deployment | Hardcoded |
| 5 | Margin events | Points per event | Hardcoded |
| 10 | Missed deliveries | Points penalty per miss | Hardcoded |
| 40 | Blackout | System failure penalty | Hardcoded |

**Action:** Verify 6.2 constant — where does it come from?

---

## PHYSICAL ENGINE (src/engine/PhysicalEngine.js)

### System State Thresholds
| Value | Purpose | Status |
|-------|---------|--------|
| SCORING_CONFIG.stressNIVThreshold | Stress event trigger (default 300 MW) | Hardcoded in constants |
| 500 | Margin floor threshold for trader | Hardcoded in stats builder |
| Drawdown tracking | Full running PL history tracked | OK |

**Action:** Centralize threshold config

---

## DERIVED MAGIC NUMBERS (Calculated but Should Be Constants)

### Display Calculations (Role Screens)
| Where | Calculation | Extract As |
|-------|-----------|-----------|
| BessScreen | SoC color: < 20% triggers warning | Define SoC warning threshold |
| DsrScreen | Duration display: curtailSpsRemaining × 30 | Define minute multiplier per SP |
| GeneratorScreen | Ramp calcs: currentMw + rampRate | Verify against physics tier list |
| NESOScreen | Total demand: 35 + |NIV|/1000 | **CRITICAL** — demand model baseline |
| TraderScreen | Drawdown tracking: -500 threshold | Define trader margin warning level |

### Price Hint Calculations (Across All Screens)
| Screen | SBP Hint | SSP Hint | Should Standardize |
|--------|----------|----------|---|
| BessScreen | `sbp × 0.8` | `ssp × 1.2` | YES — Create PRICE_HINT_CONFIG |
| DsrScreen | `ssp × 0.8` | `sbp × 1.5` | **INVESTIGATE** — Why 1.5? |
| GeneratorScreen | `sbp × 0.8` | `ssp × 1.2` | YES |
| InterconnectorScreen | `sbp × 0.8` | `ssp × 1.2` | YES |

**Action:** Create centralized `PRICE_HINT_MULTIPLIERS` config

---

## CRITICAL FINDINGS & RECOMMENDATIONS

### 🔴 **HIGH PRIORITY**

1. **Demand Baseline (35 GW vs Real Grid)**
   - **Found In:** NESOScreen.jsx line 168
   - **Issue:** Uses 35 GW base demand, but real GB grid is 40-50 GW during peaks
   - **Severity:** Impacts all NIV calculations and frequency modeling
   - **Recommendation:** Verify against recent ESO data; make scenario-dependent

2. **DSR SBP Multiplier (1.5× anomaly)**
   - **Found In:** DsrScreen.jsx line 213
   - **Issue:** DSR uses different multiplier (1.5) than other assets (1.2)
   - **Severity:** Could be intentional (DSR emergency premium) or a bug
   - **Recommendation:** Document intent; if intentional, move to DSR config

3. **NESO Stability Divisor (6.2)**
   - **Found In:** ScoringEngine.js line 71
   - **Issue:** Divides abs NIV by **6.2** with no documentation
   - **Severity:** Unknown scaling — could be incorrect
   - **Recommendation:** Document derivation; validate against GB Grid Code

4. **Stress NIV Threshold (300 MW)**
   - **Found In:** constants.js and ScoringEngine.js
   - **Issue:** Hardcoded; no justification provided
   - **Severity:** Affects player scoring during high-frequency events
   - **Recommendation:** Cross-reference with ESO stress thresholds

### 🟡 **MEDIUM PRIORITY**

5. **Price Multipliers Inconsistency**
   - **Found In:** All role screens (BessScreen, GeneratorScreen, etc.)
   - **Issue:** Each screen repeats `sbp × 0.8`, `ssp × 1.2` individually
   - **Severity:** Hard to debug and modify
   - **Recommendation:** Extract to `PRICE_HINT_CONFIG`

6. **Multiplier Chains (0.72 × demand peak)**
   - **Found In:** MarketEngine.js line 40
   - **Issue:** Magic 0.72 + 0.28 amplitude; origin unclear
   - **Severity:** Sets daily demand curve shape
   - **Recommendation:** Add comment linking to GB demand profile source

7. **Forecast Error Bands**
   - **Found In:** MarketEngine.js lines 83-85
   - **Issue:** Wind error ±30% seems high; solar ±20%
   - **Severity:** Affects game difficulty
   - **Recommendation:** Benchmark against real forecast MAE data

### 🟢 **LOW PRIORITY**

8. **Trader Starting Capital (£5,000)**
   - **Found In:** TraderScreen.jsx, constants.js ROLES.TRADER
   - **Issue:** Same for all traders; no difficulty scaling
   - **Severity:** Affects game balance in multi-trader scenarios
   - **Recommendation:** Make game-mode dependent

9. **Asset-Specific Wear Costs**
   - **Found In:** ASSETS dict (constants.js)
   - **Issue:** Each asset has unique wear (£1.50–£13/MWh)
   - **Severity:** OK as-is; just document derivation
   - **Recommendation:** Add source link (battery calendar life data, etc.)

10. **Scenario Event Probability Multiplier**
    - **Found In:** SCENARIOS dict (constants.js)
    - **Issue:** eventProb ranges from 0.6 to 2.0
    - **Severity:** Affects event injection frequency
    - **Recommendation:** Document expected events per day per scenario

---

## EXTRACTION PRIORITY ROADMAP

### Phase 1: Immediate (Next Sprint)
- [ ] Extract SCENARIO_CONFIG with all parameters (5 min)
- [ ] Extract ASSET_CONFIG as separate JSON (10 min)
- [ ] Extract SUPPLIER_CONFIG (5 min)
- [ ] Extract EVENT_DEFINITIONS with probabilities (10 min)
- [ ] Create PRICE_HINT_CONFIG for multiplier consistency (5 min)
- [ ] Verify & document 6.2 divisor in NESO scoring (15 min)

### Phase 2: Short-term (This Month)
- [ ] Audit GB demand baseline (35 GW) against real data (30 min)
- [ ] Extract SCORING_CONFIG v2 with full documentation (45 min)
- [ ] Extract PRICE_MODEL_CONFIG with regional curves (30 min)
- [ ] Create FORECAST_ERROR_CONFIG (15 min)
- [ ] Extract BOT_BIDDING_STRATEGY (20 min)

### Phase 3: Medium-term (Next Quarter)
- [ ] Investigate DSR 1.5× SBP multiplier intent (10 min + review)
- [ ] Verify stress thresholds against Grid Code (1 hour)
- [ ] Benchmark forecast error bands against real data (2 hours)
- [ ] Create comprehensive configuration schema (2 hours)
- [ ] Auto-generate config from TypeScript types (frontend task)

### Phase 4: Long-term (Later)
- [ ] Data-driven scenario balancing tool
- [ ] Player difficulty scaling based on role & score
- [ ] Seasonal scenario generation

---

## Configuration Files to Create

### 1. `src/config/scenarios.json`
```json
{
  "NORMAL": { "nivBias": 0, "priceMod": 1.0, "windMod": 1.0, "eventProb": 1.0 },
  "WINTER_PEAK": { "nivBias": -150, "priceMod": 1.45, "windMod": 0.65, "eventProb": 1.3 },
  // ... etc
}
```

### 2. `src/config/assets.json`
```json
{
  "BESS_S": { "maxMW": 15, "maxMwh": 30, "eff": 0.92, "wear": 4, ... },
  // ... etc
}
```

### 3. `src/config/scoring.json`
Complete scoring thresholds, weights, stress levels

### 4. `src/config/market-model.json`
Price multipliers, forecast error bands, bot bidding strategy

### 5. `src/config/game-modes.json`
Mode-specific settings: forgiveness, tick speeds, asset pools

---

## Files Affected Summary

| File | # Values | Priority | Extracted |
|------|----------|----------|-----------|
| constants.js | 120+ | HIGH | Partial (in-place) |
| MarketEngine.js | 40+ | HIGH | No |
| ScoringEngine.js | 50+ | HIGH | No |
| BessScreen.jsx | 8 | MEDIUM | No |
| DsrScreen.jsx | 7 | MEDIUM | No |
| GeneratorScreen.jsx | 6 | MEDIUM | No |
| NESOScreen.jsx | 12 | HIGH | No |
| InterconnectorScreen.jsx | 4 | LOW | No |
| SupplierScreen.jsx | 6 | MEDIUM | No |
| TraderScreen.jsx | 3 | LOW | No |

---

## Testing Checklist After Extraction

- [ ] Verify each hardcoded value moved to config matches its current behavior
- [ ] Test all 5 scenarios load correctly
- [ ] Verify all 13 assets behave identically before/after
- [ ] Check scoring with new config produces same results
- [ ] Validate price calculations in all markets (DA, ID, BM)
- [ ] Verify bot bidding strategy executes same bids
- [ ] Test edge cases (stress events, blackouts, margin calls)

---

## Documentation References

- **GB Grid Code**: Frequency limits (49.8–50.2 Hz standard deviation band)
- **ESO PLFS**: Pricing curves, demand forecasts
- **OFGEM**: Settlement procedures, imbalance pricing
- **Elexon BSCP**: Billing arrangements
- **NGESO Balancing**: Acceptance rates, merit order mechanics

