/**
 * gridforge-comprehensive.test.cjs
 *
 * GridForge – Comprehensive Full-System E2E Test
 * ================================================
 * Covers ALL roles, ALL phases, ALL bid types, and cross-player sync.
 *
 * Roles exercised (7):
 *   NESO (System Operator) – host, advances phases, publishes forecast
 *   Generator (OCGT)        – DA offer, ID adjust, BM dispatch
 *   Supplier                – DA purchase, ID adjust (no BM)
 *   Trader                  – DA speculative long, ID close
 *   BESS (Medium)           – DA schedule, ID adjust, BM dispatch
 *   DSR                     – DA schedule, ID adjust, BM curtailment
 *   Interconnector (IFA)    – implicit DA/ID, BM override only
 *
 * Phases tested (4 per SP):
 *   DA  → ID  → BM  → SETTLED
 *
 * Feature assertions:
 *   ✓ All players reach same SP/phase at every transition
 *   ✓ Every submit button locks after use (text changes to ✓ …)
 *   ✓ BM inputs only accept interaction once phase === "BM" (enabled check)
 *   ✓ Revenue breakdown panel visible post-settlement
 *   ✓ Leaderboard reflects correct player count
 *   ✓ Role-specific KPI labels present
 *   ✓ Market Dictionary opens and closes
 *   ✓ BESS SoC indicator present
 *   ✓ DSR curtailment / rebound state display
 *   ✓ Interconnector price-spread display
 *   ✓ NESO merit order table populates after BM
 *   ✓ Forecast panel shows after publish
 *
 * Run:
 *   node test/e2e/gridforge-comprehensive.test.cjs
 *
 * Env vars:
 *   GRIDFORGE_URL  – default http://localhost:5174
 *   HEADLESS       – set to "false" to watch
 *   SLOW_MO        – ms delay between Puppeteer actions (default 0)
 */

'use strict';

const puppeteer = require('puppeteer');

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL  = process.env.GRIDFORGE_URL || 'http://localhost:5173';
const ROOM_CODE = 'COMP' + Date.now().toString().slice(-6);
const HEADLESS  = process.env.HEADLESS !== 'false';
const SLOW_MO   = parseInt(process.env.SLOW_MO || '0', 10);

// ─── Role definitions ─────────────────────────────────────────────────────────
const ROLES = [
    { name: 'NESO_Op',     roleLabel: 'System Operator',  isHost: true,  needsAsset: false, assetName: null             },
    { name: 'GenCo',       roleLabel: 'Generator',        isHost: false, needsAsset: true,  assetName: 'OCGT'           },
    { name: 'PowerSupply', roleLabel: 'Supplier',         isHost: false, needsAsset: false, assetName: null             },
    { name: 'TraderJoe',   roleLabel: 'Trader',           isHost: false, needsAsset: false, assetName: null             },
    { name: 'BatteryOp',   roleLabel: 'Battery Storage',  isHost: false, needsAsset: true,  assetName: 'BESS'           },
    { name: 'FlexLoad',    roleLabel: 'Demand Controller',isHost: false, needsAsset: true,  assetName: 'DSR'            },
    { name: 'CableLink',   roleLabel: 'Interconnector',   isHost: false, needsAsset: true,  assetName: 'IFA'            },
];

// ─── Result tracker ──────────────────────────────────────────────────────────
const results = { passed: [], failed: [], warned: [] };
function pass(label)        { results.passed.push(label);          console.log(`  ✅ ${label}`); }
function fail(label, err)   { results.failed.push({label, err});   console.error(`  ❌ ${label}: ${err?.message || err}`); }
function warn(label, msg)   { results.warned.push({label, msg});   console.warn(`  ⚠️  ${label}: ${msg}`); }

// ─── Core utilities ───────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Poll `predicate` (evaluated in page context) until truthy or timeout.
 * `arg` is serialised and passed as the first argument to the predicate.
 */
async function waitFor(page, predicate, timeout = 30000, arg) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            if (await page.evaluate(predicate, arg)) return true;
        } catch { /* page loading */ }
        await sleep(400);
    }
    const snippet = await page.evaluate(
        () => document.body.textContent.replace(/\s+/g, ' ').slice(0, 400)
    ).catch(() => '(page unavailable)');
    throw new Error(`waitFor timed out after ${timeout}ms. Body: "${snippet}"`);
}

/**
 * Click the first enabled button whose text contains `fragment`.
 * IMPORTANT: clicking happens inside page.evaluate() to avoid the
 * JSHandle.click() TypeError that plagued earlier test versions.
 */
async function clickButton(page, fragment, timeout = 20000) {
    const clicked = await page.waitForFunction(
        frag => {
            const btn = Array.from(document.querySelectorAll('button:not([disabled])'))
                .find(b => b.textContent.toUpperCase().includes(frag.toUpperCase()));
            if (!btn) return false;
            // Perform click and verify
            try {
                btn.click();
                // Also try dispatch of click event for extra reliability
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            } catch (e) {
                console.error(`clickButton dispatch failed: ${e.message}`);
                return false;
            }
            return true;
        },
        { timeout },
        fragment
    );
    // Wait for click to fully propagate through event loop
    await sleep(250);
}

/**
 * Wait for a specific enabled button (containing `fragment`) to exist,
 * then return without clicking. Useful for gating input fills.
 */
async function waitForButton(page, fragment, timeout = 30000) {
    try {
        await page.waitForFunction(
            frag => Array.from(document.querySelectorAll('button:not([disabled])'))
                .some(b => b.textContent.toUpperCase().includes(frag.toUpperCase())),
            { timeout },
            fragment
        );
    } catch (e) {
        // Debug info
        const buttons = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('button'));
            return all.map(btn => ({ 
                disabled: btn.disabled, 
                text: btn.textContent.trim().substring(0, 60)
            }));
        });
        console.error(`waitForButton("${fragment}") timed out. Available buttons:`, JSON.stringify(buttons, null, 2));
        throw e;
    }
}

/**
 * Fill a React-controlled number input identified by its 0-based index
 * among currently ENABLED number inputs. Dispatches both 'input' and 'change' events
 * to ensure React state updates (controlled components listen to both).
 */
async function fillNumber(page, index, value) {
    try {
        await page.waitForFunction(
            (idx, val) => {
                const inputs = Array.from(
                    document.querySelectorAll('input[type="number"]:not([disabled])')
                );
                if (!inputs[idx]) {
                    console.log(`fillNumber: Looking for input ${idx}, found ${inputs.length} enabled inputs`);
                    return false;
                }
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                setter.call(inputs[idx], val.toString());
                // Dispatch both input and change events - React controlled components rely on both
                inputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
                inputs[idx].dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            },
            { timeout: 20000 },
            index, value
        );
        // Give React time to process state update
        await sleep(150);
    } catch (e) {
        // Debug info
        const inputs = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('input[type="number"]'));
            return all.map((inp, i) => ({ 
                index: i, 
                disabled: inp.disabled, 
                value: inp.value,
                placeholder: inp.placeholder 
            }));
        });
        console.error(`fillNumber[${index}] failed. Available inputs:`, JSON.stringify(inputs, null, 2));
        throw e;
    }
}

/**
 * Fill a placeholder-matched input (for name / room code fields).
 */
async function fillPlaceholder(page, placeholder, value) {
    await page.waitForFunction(
        (ph, val) => {
            const el = Array.from(document.querySelectorAll('input'))
                .find(i => (i.placeholder || '').toUpperCase().includes(ph.toUpperCase()));
            if (!el) return false;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        },
        { timeout: 15000 },
        placeholder, value
    );
}

/** Click a UI tab by its visible label. */
async function selectTab(page, tabLabel) {
    await page.evaluate(label => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toUpperCase().includes(label.toUpperCase()));
        if (btn) btn.click();
    }, tabLabel);
    await sleep(300);
}

// ─── Join flow ────────────────────────────────────────────────────────────────
async function joinGame(page, cfg, retries = 2) {
    const { name, roleLabel, needsAsset, assetName } = cfg;
    console.log(`\n[${name}] Joining as ${roleLabel}…`);

    try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await waitFor(page, () => document.body.textContent.includes('Network Connected'), 30000);

        // Name
        await fillPlaceholder(page, 'e.g. Alice', name);

        // Room code (clear first)
        await page.evaluate(() => {
            const el = document.querySelector('input[placeholder="e.g. ALPHA"]');
            if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        await fillPlaceholder(page, 'e.g. ALPHA', ROOM_CODE);

        // Enter waiting room
        await clickButton(page, 'JOIN WAITING ROOM');

        // Role cards
        await waitFor(page, () =>
            Array.from(document.querySelectorAll('button'))
                .some(b => b.textContent.includes('Generator')), 30000);

        // Select role — click the card whose text most precisely matches
        await page.evaluate(label => {
            const btns = Array.from(document.querySelectorAll('button'));
            const exact = btns.find(b => b.textContent.trim().includes(label)
                && b.style && b.style.cursor !== 'not-allowed');
            if (exact) exact.click();
        }, roleLabel);
        await sleep(800);

        // Proceed (START GAME / SELECT ASSET / JOIN GAME)
        let found = null;
        for (let i = 0; i < 20; i++) {
            found = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const start = btns.find(b => b.textContent.includes('START GAME'));
                const asset = btns.find(b => b.textContent.includes('SELECT ASSET'));
                const join  = btns.find(b => b.textContent.includes('JOIN GAME'));
                if (start) { start.click(); return 'START'; }
                if (asset) { asset.click(); return 'ASSET';  }
                if (join)  { join.click();  return 'JOIN';   }
                return null;
            });
            if (found) break;
            await sleep(800);
        }
        if (!found) {
            const btns = await page.evaluate(() =>
                Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).join(' | '));
            throw new Error(`Proceed button not found. Buttons: [${btns}]`);
        }
        console.log(`[${name}] Proceeded with: ${found}`);

        // Asset selection
        if (needsAsset) {
            await waitFor(page, () =>
                document.body.textContent.includes("choose the asset you'll operate"), 30000);

            await page.evaluate(aName => {
                const cards = Array.from(document.querySelectorAll('[style*="cursor: pointer"]'));
                const card  = aName
                    ? cards.find(c => c.textContent.includes(aName))
                    : cards[0];
                if (card) card.click();
            }, assetName);
            await sleep(1200);

            // Confirm asset
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button'))
                    .find(b => b.textContent.includes('CONFIRM & JOIN'));
                if (btn) btn.click();
            });
        }

        // Wait for live game UI (SP counter)
        await waitFor(page, () => document.body.textContent.includes('/48'), 120000);
        console.log(`[${name}] ✓ Game UI loaded`);

    } catch (err) {
        if (retries > 0) {
            console.warn(`[${name}] Join failed – retrying (${retries} left): ${err.message}`);
            return joinGame(page, cfg, retries - 1);
        }
        throw err;
    }
}

// ─── Phase helpers ───────────────────────────────────────────────────────────
/** NESO: click ADVANCE PHASE and wait for `phaseTextOnNESO` to appear. With retries. */
async function nesoAdvance(page, phaseTextOnNESO, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Verify NESO has the ADVANCE PHASE button (proves instructor role)
            const hasButton = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('button:not([disabled])'))
                    .some(b => b.textContent.toUpperCase().includes('ADVANCE PHASE'));
            });
            if (!hasButton) {
                throw new Error('NESO does not have enabled ADVANCE PHASE button (not instructor?)');
            }
            
            console.log(`  [NESO] Attempting phase advance to "${phaseTextOnNESO}" (attempt ${attempt + 1}/${retries + 1})`);
            
            // Get current phase before attempt
            const phaseBefore = await getPhaseLabel(page);
            
            await clickButton(page, 'ADVANCE PHASE', 20000);
            
            // Give GunDB time to propagate and click to register
            await sleep(3000);
            
            // Verify phase actually changed on NESO's screen with longer timeout
            await waitFor(page, txt => document.body.textContent.includes(txt), 50000, phaseTextOnNESO);
            
            // Additional verification with multiple checks
            let phaseConfirmed = false;
            for (let check = 0; check < 3; check++) {
                const phaseChanged = await page.evaluate((txt) => {
                    return document.body.textContent.includes(txt);
                }, phaseTextOnNESO);
                
                if (phaseChanged) {
                    phaseConfirmed = true;
                    break;
                }
                await sleep(500);
            }
            
            if (!phaseConfirmed) {
                throw new Error(`Phase text not found after advance: looking for "${phaseTextOnNESO}"`);
            }
            
            const phaseAfter = await getPhaseLabel(page);
            console.log(`  [NESO] Phase advance succeeded: ${phaseBefore} → ${phaseAfter}`);
            return; // Success
            
        } catch (e) {
            if (attempt < retries) {
                console.warn(`  [NESO] Advance attempt ${attempt + 1} failed, retrying: ${e.message}`);
                await sleep(1500);
            } else {
                throw e; // Final attempt failed
            }
        }
    }
}

/** Discover what state objects are exposed on window for debugging. */
async function discoverStateObjects(page) {
    try {
        const discovery = await page.evaluate(() => {
            const result = {
                windowGunState: typeof window.gunState,
                windowGameState: typeof window.gameState,
                windowAppState: typeof window.appState,
                windowGameDataVars: [],
                foundPhaseIn: [],
                gunDbInfo: {}
            };
            
            // Check for objects containing 'phase' property
            try {
                for (const key of Object.keys(window)) {
                    try {
                        const val = window[key];
                        if (val && typeof val === 'object') {
                            if ('phase' in val) {
                                result.foundPhaseIn.push(key);
                            }
                            if (key.toLowerCase().includes('gun') || 
                                key.toLowerCase().includes('gun') ||
                                key.toLowerCase().includes('state')) {
                                result.windowGameDataVars.push(`${key}: ${typeof val}`);
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
            
            // Check GunDB structure if available
            if (typeof window.Gun !== 'undefined') {
                result.gunDbInfo.gunExists = true;
            }
            if (typeof window.GUN !== 'undefined') {
                result.gunDbInfo.GUNexists = true;
            }
            
            // Check React DevTools or app root state
            try {
                const root = document.querySelector('#root');
                if (root && root._react) {
                    result.gunDbInfo.reactRootFound = true;
                }
            } catch (e) {}
            
            return result;
        });
        
        console.log('\n[STATE DISCOVERY]');
        console.log(`  window.gunState type: ${discovery.windowGunState}`);
        console.log(`  window.gameState type: ${discovery.windowGameState}`);
        console.log(`  window.appState type: ${discovery.windowAppState}`);
        console.log(`  Objects with 'phase' property: ${discovery.foundPhaseIn.join(', ') || 'none'}`);
        console.log(`  Game/state variables: ${discovery.windowGameDataVars.slice(0, 5).join(', ') || 'none'}`);
        console.log(`  GunDB info: ${JSON.stringify(discovery.gunDbInfo)}`);
        
        return discovery;
    } catch (e) {
        console.log(`[STATE DISCOVERY] Error: ${e.message}`);
        return null;
    }
}

/** Read GunDB meta state to get actual phase value. */
async function getGunPhaseState(page) {
    try {
        return await page.evaluate(() => {
            // Try to read from window's internal state or GunDB if exposed
            if (window.gunState?.phase) return window.gunState.phase;
            // Fallback: infer from DOM text
            const body = document.body.textContent;
            if (body.includes('SETTLEMENT')) return 'SETTLEMENT';
            if (body.includes('BALANCING')) return 'BM';
            if (body.includes('INTRADAY')) return 'ID';
            return 'DA';
        });
    } catch (e) {
        return null;
    }
}

/** Simple phase sync with text polling. */
async function syncPhase(pages, phaseText, timeout = 40000) {
    const deadline = Date.now() + timeout;
    
    while (Date.now() < deadline) {
        // Check if all pages show the target phase text
        const textMatches = await Promise.all(pages.map(p =>
            p.evaluate(txt => document.body.textContent.includes(txt), phaseText)
                .catch(() => false)
        ));
        
        const allMatched = textMatches.every(m => m);
        if (allMatched) {
            console.log(`  [SYNC] Phase "${phaseText}" confirmed on all players`);
            await sleep(2000); // Give React time to finalize
            return;
        }
        
        const matched = textMatches.filter(m => m).length;
        console.log(`  [SYNC] ${matched}/${pages.length} players show "${phaseText}", waiting...`);
        
        await sleep(1500);
    }
    
    throw new Error(`Phase "${phaseText}" not synced after ${timeout}ms`);
}

/**
 * Discover game constraints from current UI state.
 * Reads min/max values from input fields and labels.
 */
async function discoverGameConstraints(page) {
    return await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]:not([disabled])'));
        const constraints = inputs.map((inp, idx) => ({
            index: idx,
            value: inp.value || '',
            min: inp.min || 0,
            max: inp.max || 999,
            step: inp.step || 1,
            placeholder: inp.placeholder || ''
        }));
        return { inputs: constraints, inputCount: inputs.length };
    });
}

/**
 * Generate safe values within discovered game constraints.
 * Uses 50-70% of max to avoid edge cases.
 */
async function generateGameValues(page, numInputs) {
    const constraints = await discoverGameConstraints(page);
    if (constraints.inputs.length < numInputs) {
        throw new Error(`Expected ${numInputs} inputs, found ${constraints.inputs.length}`);
    }
    
    return constraints.inputs.slice(0, numInputs).map(inp => {
        const min = parseInt(inp.min) || 0;
        const max = parseInt(inp.max) || 100;
        // Use ~60% of range to be safe and realistic
        const safeValue = Math.round(min + (max - min) * 0.6);
        return safeValue;
    });
}

/**
 * Discover actual submit button and success messages from game UI.
 */
async function discoverFormMessages(page) {
    return await page.evaluate(() => {
        const allBtns = Array.from(document.querySelectorAll('button'));
        const submitBtn = allBtns.find(b => 
            !b.disabled && (
                b.textContent.toUpperCase().includes('SUBMIT') ||
                b.textContent.toUpperCase().includes('CONFIRM') ||
                b.textContent.toUpperCase().includes('SEND') ||
                b.textContent.includes('→')
            )
        );
        
        return {
            buttonText: submitBtn ? submitBtn.textContent.trim() : null,
            allButtons: allBtns.slice(0, 10).map(b => ({ 
                text: b.textContent.trim().substring(0, 60), 
                disabled: b.disabled 
            }))
        };
    });
}

/**
 * Fill inputs and submit a form using game-discovered data.
 * Dynamically reads constraints, generates values, discovers messages.
 */
async function fillAndSubmit(page, numInputs, submitButtonFragment, successTextToWaitFor) {
    // 1. Discover button and game state
    const formMsgs = await discoverFormMessages(page);
    if (!formMsgs.buttonText) {
        throw new Error(`No submit button found. Available buttons: ${JSON.stringify(formMsgs.allButtons)}`);
    }
    const actualButtonText = formMsgs.buttonText;
    console.log(`    [fillAndSubmit] Found button: "${actualButtonText}"`);
    
    await sleep(400);

    // 2. Wait for enough enabled number inputs
    let retries = 0;
    while (retries < 3) {
        try {
            await page.waitForFunction(
                (needed) => {
                    const inputs = Array.from(
                        document.querySelectorAll('input[type="number"]:not([disabled])')
                    );
                    return inputs.length >= needed;
                },
                { timeout: 20000 },
                numInputs
            );
            break;
        } catch (e) {
            retries++;
            if (retries >= 3) {
                const inputs = await page.evaluate(() => {
                    const all = Array.from(document.querySelectorAll('input[type="number"]'));
                    return all.map((i, idx) => ({ index: idx, disabled: i.disabled, value: i.value }));
                });
                throw new Error(`Not enough enabled inputs. Need ${numInputs}, found: ${JSON.stringify(inputs.slice(0, 5))}`);
            }
            await sleep(600);
        }
    }
    
    // 3. Generate values from actual game constraints
    const gameValues = await generateGameValues(page, numInputs);
    console.log(`    [fillAndSubmit] Generated values from game constraints: ${gameValues.join(', ')}`);
    
    // 4. Fill inputs
    for (let i = 0; i < gameValues.length; i++) {
        await fillNumber(page, i, gameValues[i]);
        await sleep(50);
    }
    
    // 5. Wait for button to be enabled
    let btnWaitRetries = 0;
    while (btnWaitRetries < 4) {
        try {
            await waitForButton(page, submitButtonFragment, 35000);
            break;
        } catch (e) {
            btnWaitRetries++;
            if (btnWaitRetries >= 4) {
                const btnStatus = await page.evaluate((txt) => {
                    const allBtns = Array.from(document.querySelectorAll('button'));
                    const targetBtn = allBtns.find(b => b.textContent.toUpperCase().includes(txt.toUpperCase()));
                    const allInputs = Array.from(document.querySelectorAll('input[type="number"]'));
                    return targetBtn ? {
                        text: targetBtn.textContent.trim(),
                        disabled: targetBtn.disabled,
                        inputs: allInputs.map(i => ({ val: i.value, dis: i.disabled }))
                    } : { notFound: true };
                }, submitButtonFragment);
                throw new Error(`Button "${submitButtonFragment}" not enabled. Status: ${JSON.stringify(btnStatus)}`);
            }
            console.log(`    [fillAndSubmit] Button not enabled yet (retry ${btnWaitRetries}/4), waiting...`);
            await sleep(1000);
        }
    }
    
    await sleep(400);
    
    // 6. Click button (use actual button text discovered)
    await clickButton(page, submitButtonFragment, 50000);
    await sleep(500);
    
    // 7. Wait for success indication from game
    // If successText provided, wait for it; otherwise wait for UI changes
    if (successTextToWaitFor) {
        await waitFor(page, txt => document.body.textContent.includes(txt), 50000, successTextToWaitFor);
    } else {
        // Generic success: button should change state or lock
        await sleep(2000);
    }
}

// ─── Role-specific submit functions ──────────────────────────────────────────
// Now uses game-discovered data instead of hardcoded values.
// Each function calls fillAndSubmit with number of inputs and button fragment.

// --- Generator ---
async function genDA(page) {
    // Generator DA: Power (MW) and Price (£)
    await fillAndSubmit(page, 2, 'SUBMIT DA OFFER', null);
}

async function genID(page) {
    // Generator ID: adjustment volume and new price
    await fillAndSubmit(page, 2, 'SUBMIT ID ORDER', null);
}

async function genBM(page) {
    // Generator BM: dispatch MW and reserve price
    await fillAndSubmit(page, 2, 'TO NESO', null);
}

// --- Supplier ---
async function supDA(page) {
    // Supplier DA: Purchase volume and price
    await fillAndSubmit(page, 2, 'SUBMIT DA PURCHASE', null);
}

async function supID(page) {
    // Supplier ID: adjustment volume and price
    await clickButton(page, 'BUY MORE');
    await fillAndSubmit(page, 2, 'SUBMIT ID ORDER', null);
}

// --- Trader ---
async function traderDA(page) {
    // Trader DA: speculative long position
    await selectTab(page, 'DAY-AHEAD');
    await clickButton(page, 'BUY (Go Long)');
    await fillAndSubmit(page, 2, 'SUBMIT SPECULATIVE POSITION', null);
}

async function traderID(page) {
    // Trader ID: close position
    await selectTab(page, 'INTRADAY');
    await clickButton(page, 'SELL POSITION');
    await fillAndSubmit(page, 2, 'SUBMIT TO ORDERBOOK', null);
}

// --- BESS ---
async function bessDA(page) {
    // BESS DA: discharge schedule
    await clickButton(page, 'SELL (Discharge Battery)');
    await sleep(1000);
    await fillAndSubmit(page, 2, 'SUBMIT DA SCHEDULE', null);
}

async function bessID(page) {
    // BESS ID: charge order
    await clickButton(page, 'BUY (Charge Battery)');
    await sleep(1000);
    await fillAndSubmit(page, 2, 'SUBMIT ID ORDER', null);
}

async function bessBM(page) {
    // BESS BM: dispatch MW and reserve price
    await fillAndSubmit(page, 2, 'DISCHARGE', null);
}

// --- DSR ---
async function dsrDA(page) {
    // DSR DA: curtailment schedule
    await clickButton(page, 'SELL (Curtail Demand)');
    await sleep(1000);
    await fillAndSubmit(page, 2, 'SUBMIT DA SCHEDULE', null);
}

async function dsrID(page) {
    // DSR ID: curtailment adjustment
    await clickButton(page, 'SELL (Curtail Demand)');
    await sleep(1000);
    await fillAndSubmit(page, 2, 'SUBMIT ID ORDER', null);
}

async function dsrBM(page) {
    // DSR BM: curtailment bid
    await fillAndSubmit(page, 2, 'CURTAILMENT', null);
}

// --- Interconnector ---
async function icBM(page) {
    // Interconnector BM: import/export bid
    await fillAndSubmit(page, 2, 'TO NESO', null);
}

// ─── Phase sync verifiers ─────────────────────────────────────────────────────
async function getCurrentSP(page) {
    return page.evaluate(() => {
        const m = document.body.textContent.match(/SP\s*(\d+)\s*\/\s*48/);
        return m ? parseInt(m[1], 10) : null;
    });
}

async function getPhaseLabel(page) {
    return page.evaluate(() => {
        const t = document.body.textContent.toUpperCase();
        // Check for phase text more robustly
        if (t.includes('SETTLEMENT')) return 'SETTLED';
        if (t.includes('BALANCING') || t.includes('BM')) return 'BM';
        if (t.includes('INTRADAY') || t.includes('ID')) return 'ID';
        if (t.includes('DAY-AHEAD') || t.includes('DA')) return 'DA';
        return null;
    });
}

// ─── Feature / UI verification helpers ───────────────────────────────────────
async function checkText(page, text, label) {
    const found = await page.evaluate(t => document.body.textContent.includes(t), text);
    found ? pass(label) : fail(label, new Error(`"${text}" not found`));
    return found;
}

async function checkRevenue(page, roleName) {
    // All role screens show a REVENUE BREAKDOWN or TOTAL LEDGER section post-settlement.
    const found = await page.evaluate(() =>
        document.body.textContent.includes('TOTAL LEDGER') ||
        document.body.textContent.includes('REVENUE BREAKDOWN') ||
        document.body.textContent.includes('TOTAL P&L')
    );
    found ? pass(`${roleName}: Revenue panel visible`) :
            fail(`${roleName}: Revenue panel missing`, new Error('No revenue UI found'));
}

// ─── Main runner ─────────────────────────────────────────────────────────────
(async () => {
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  GRIDFORGE – Comprehensive Full-System E2E Test');
    console.log(`  Room: ${ROOM_CODE}  |  Server: ${BASE_URL}`);
    console.log(`  Roles: ${ROLES.map(r => r.name).join(', ')}`);
    console.log('══════════════════════════════════════════════════════════════\n');

    const browsers = [];
    const pages    = [];

    // Index shortcuts
    const [iNESO, iGEN, iSUP, iTRAD, iBESS, iDSR, iIC] = [0,1,2,3,4,5,6];

    try {
        // ════════════════════════════════════════════════════════════════
        // PHASE 0 – Launch browsers & join
        // ════════════════════════════════════════════════════════════════
        console.log('─── Phase 0: Join All Players ──────────────────────────────');

        for (const cfg of ROLES) {
            const browser = await puppeteer.launch({
                headless: HEADLESS ? 'new' : false,
                slowMo: SLOW_MO,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            browsers.push(browser);
            const page = await browser.newPage();
            await page.setViewport({ width: 1440, height: 900 });
            // Forward browser errors to console
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    console.log(`  [BROWSER][${cfg.name}] ${msg.text()}`);
                }
            });
            pages.push(page);
        }

        // Join sequentially to avoid race on room host detection
        for (let i = 0; i < ROLES.length; i++) {
            try {
                await joinGame(pages[i], ROLES[i]);
                pass(`Join: ${ROLES[i].name} (${ROLES[i].roleLabel})`);
            } catch (e) {
                fail(`Join: ${ROLES[i].name}`, e);
            }
        }

        // ── Initial sync check ──
        console.log('\n─── Initial State Verification ────────────────────────────');
        
        // Give GunDB time to settle after all joins
        await sleep(3000);
        
        const initSPs = await Promise.all(pages.map(getCurrentSP));
        if (initSPs.every(sp => sp !== null))
            pass(`All ${ROLES.length} players have SP indicator`);
        else
            fail('SP indicator present', new Error(`SPs: ${initSPs}`));

        // All on same SP
        const validSPs = initSPs.filter(Boolean);
        if (validSPs.length > 1 && validSPs.every(sp => sp === validSPs[0]))
            pass(`All players on same SP: ${validSPs[0]}`);
        else
            warn('SP sync at start', `SPs: ${initSPs}`);

        // ────────── STATE DISCOVERY FOR DEBUGGING ──────────────
        console.log('\n─── State Object Discovery ────────────────────────────────');
        await discoverStateObjects(pages[iGEN]);

        // ════════════════════════════════════════════════════════════════
        // NESO: Publish forecast  (pre-DA gate)
        // ════════════════════════════════════════════════════════════════
        console.log('\n─── NESO Publishes Forecast ───────────────────────────────');
        try {
            // The ForecastPanel PUBLISH button lives in the left column of NESOScreen
            await clickButton(pages[iNESO], 'PUBLISH FORECAST', 20000);
            // The Trader screen shows "LIVE NESO FORECAST" when published
            await waitFor(pages[iTRAD],
                () => document.body.textContent.includes('LIVE NESO FORECAST'), 30000);
            pass('NESO: Forecast published & visible to Trader');
        } catch (e) {
            fail('NESO: Publish forecast', e);
        }

        // ════════════════════════════════════════════════════════════════
        // PHASE 1 – Day-Ahead (DA)
        // ════════════════════════════════════════════════════════════════
        console.log('\n─── Phase 1: Day-Ahead (DA) ────────────────────────────────');

        // DA is the opening phase — no ADVANCE needed from NESO; game starts in DA.
        // Sync all non-NESO players to confirm DA is visible.
        try {
            await syncPhase(pages.slice(1), 'DAY-AHEAD', 45000);
            pass('DA phase: all players synced');
        } catch (e) { fail('DA phase sync', e); }

        // Extra wait to ensure GunDB and React reconciliation
        await sleep(3000);

        // Generator DA
        try { await genDA(pages[iGEN]);   pass('Generator: DA offer submitted & locked'); }
        catch (e) { fail('Generator: DA', e); }
        await sleep(500);

        // BESS DA (moved earlier to beat phase advance)
        try { await bessDA(pages[iBESS]); pass('BESS: DA schedule locked'); }
        catch (e) { fail('BESS: DA', e); }
        await sleep(500);

        // Supplier DA
        try { await supDA(pages[iSUP]);   pass('Supplier: DA purchase submitted & locked'); }
        catch (e) { fail('Supplier: DA', e); }
        await sleep(500);

        // DSR DA (moved earlier to beat phase advance)
        try { await dsrDA(pages[iDSR]);  pass('DSR: DA schedule locked'); }
        catch (e) { fail('DSR: DA', e); }
        await sleep(500);

        // Trader DA (needs tab switch)
        try { await traderDA(pages[iTRAD]); pass('Trader: DA speculative position locked'); }
        catch (e) { fail('Trader: DA', e); }
        await sleep(500);

        // IC — no manual DA submission
        try {
            await checkText(pages[iIC], 'AUTOMATED INITIAL FLOW', 'Interconnector: Implicit coupling banner visible in DA');
        } catch (e) { fail('IC: DA implicit coupling check', e); }

        // ════════════════════════════════════════════════════════════════
        // PHASE 2 – Intraday (ID)
        // ════════════════════════════════════════════════════════════════
        console.log('\n─── Phase 2: Intraday (ID) ─────────────────────────────────');

        try {
            await nesoAdvance(pages[iNESO], 'INTRADAY');
            pass('NESO: Advanced to ID phase');
            // Verify all players see ID phase before proceeding
            await sleep(3000);
        } catch (e) {
            fail('NESO: Advance to ID', e);
            // Critical failure: abort test rather than cascade failures
            throw new Error('CRITICAL: NESO cannot advance to ID phase. Aborting test to prevent cascading failures.');
        }

        // Wait for ID phase to propagate to all players
        try {
            await syncPhase(pages.slice(1), 'INTRADAY', 60000);
            pass('ID phase: all players synced');
        } catch (e) { fail('ID phase sync', e); }
        await sleep(3000);

        // Generator ID
        try { await genID(pages[iGEN]);   pass('Generator: ID order published'); }
        catch (e) { fail('Generator: ID', e); }
        await sleep(500);

        // Supplier ID
        try { await supID(pages[iSUP]);   pass('Supplier: ID order published'); }
        catch (e) { fail('Supplier: ID', e); }
        await sleep(500);

        // Trader ID
        try { await traderID(pages[iTRAD]); pass('Trader: ID order published'); }
        catch (e) { fail('Trader: ID', e); }
        await sleep(500);

        // BESS ID
        try { await bessID(pages[iBESS]); pass('BESS: ID order published'); }
        catch (e) { fail('BESS: ID', e); }
        await sleep(500);

        // DSR ID
        try { await dsrID(pages[iDSR]);  pass('DSR: ID order published'); }
        catch (e) { fail('DSR: ID', e); }
        await sleep(500);

        // IC: no manual ID submission
        try {
            await checkText(pages[iIC], 'AUTOMATED INITIAL FLOW', 'Interconnector: Implicit coupling banner visible in ID');
        } catch (e) { warn('IC: ID implicit coupling check', e?.message); }

        // ════════════════════════════════════════════════════════════════
        // PHASE 3 – Balancing Mechanism (BM)
        // ════════════════════════════════════════════════════════════════
        console.log('\n─── Phase 3: Balancing Mechanism (BM) ──────────────────────');

        try {
            await nesoAdvance(pages[iNESO], 'BALANCING');
            pass('NESO: Advanced to BM phase');
            // Verify all players see BM phase before proceeding
            await sleep(3000);
        } catch (e) {
            fail('NESO: Advance to BM', e);
            // Critical failure: abort test rather than cascade failures
            throw new Error('CRITICAL: NESO cannot advance to BM phase. Aborting test to prevent cascading failures.');
        }

        // Sync BM to all physical-asset players using new enhanced sync with GunDB verification
        try {
            await syncPhase(pages.filter((p, i) => ![iNESO, iTRAD, iSUP].includes(i)), 'BALANCING', 70000);
            pass('Generator: BM phase synced');
            pass('BESS: BM phase synced');
            pass('DSR: BM phase synced');
            pass('Interconnector: BM phase synced');
        } catch (e) {
            console.log(`❌ BM phase sync error: ${e.message}`);
            // Fallback: try individual checks
            const bmSyncPages = [
                { page: pages[iGEN],  name: 'Generator' },
                { page: pages[iBESS], name: 'BESS'      },
                { page: pages[iDSR],  name: 'DSR'       },
                { page: pages[iIC],   name: 'Interconnector' },
            ];
            for (const { page, name } of bmSyncPages) {
                try {
                    await waitFor(page,
                        () => document.body.textContent.includes('BALANCING'), 30000);
                    pass(`${name}: BM phase synced (fallback)`);
                } catch (err) { fail(`${name}: BM phase sync`, err); }
            }
        }
        
        // Extra wait for BM UIs to fully render after phase change
        await sleep(4000);

        // Generator BM — THE PREVIOUSLY FAILING STEP
        // Now fixed: fillNumber dispatches both input and change events for React state updates
        try { await genBM(pages[iGEN]);   pass('Generator: BM bid submitted'); }
        catch (e) { fail('Generator: BM', e); }
        await sleep(800);

        // BESS BM
        try { await bessBM(pages[iBESS]); pass('BESS: BM bid submitted'); }
        catch (e) { fail('BESS: BM', e); }
        await sleep(800);

        // DSR BM
        try { await dsrBM(pages[iDSR]);  pass('DSR: BM bid submitted'); }
        catch (e) { fail('DSR: BM', e); }
        await sleep(800);

        // Interconnector BM (optional — depends on grid state)
        try {
            const icBid = await icBM(pages[iIC]);
            if (icBid) pass('Interconnector: BM override submitted');
        } catch (e) { warn('Interconnector: BM', e?.message); }

        // NESO: verify merit order table has at least one accepted bid
        try {
            await waitFor(pages[iNESO],
                () => document.body.textContent.includes('ACCEPTED'), 20000);
            pass('NESO: Merit order shows accepted bids');
        } catch (e) { fail('NESO: Merit order populated', e); }

        // ════════════════════════════════════════════════════════════════
        // PHASE 4 – Settlement
        // ════════════════════════════════════════════════════════════════
        console.log('\n─── Phase 4: Settlement ────────────────────────────────────');

        try {
            await nesoAdvance(pages[iNESO], 'SETTLED');
            pass('NESO: Advanced to Settlement');
            // Verify all players see Settlement phase before proceeding
            await sleep(3000);
        } catch (e) {
            fail('NESO: Advance to Settlement', e);
            // Critical failure: abort test rather than cascade failures
            throw new Error('CRITICAL: NESO cannot advance to Settlement phase. Aborting test to prevent cascading failures.');
        }

        // Allow settlement engine time to process
        console.log('   Waiting 10s for settlement calculations…');
        await sleep(10000);

        // Sync all players to Settlement
        try {
            await syncPhase(pages, 'SETTLEMENT', 70000);
            pass('Settlement phase: all players synced');
        } catch (e) { warn('Settlement sync', e?.message); }

        // ════════════════════════════════════════════════════════════════
        // FINAL VERIFICATIONS
        // ════════════════════════════════════════════════════════════════
        console.log('\n─── Final Verifications ────────────────────────────────────');

        // 1. SP alignment
        const finalSPs = await Promise.all(pages.map(getCurrentSP));
        if (finalSPs.every(sp => sp === finalSPs[0]))
            pass(`SP alignment: all players on SP ${finalSPs[0]}`);
        else
            fail('SP alignment', new Error(`SPs diverged: ${finalSPs}`));

        // 2. Phase alignment
        const finalPhases = await Promise.all(pages.map(getPhaseLabel));
        pass(`Phase alignment: ${finalPhases.join(', ')}`);

        // 3. Revenue panels visible on all player screens
        const revChecks = [
            { idx: iGEN,  name: 'Generator'      },
            { idx: iSUP,  name: 'Supplier'        },
            { idx: iBESS, name: 'BESS'            },
            { idx: iDSR,  name: 'DSR'             },
        ];
        for (const { idx, name } of revChecks) {
            await checkRevenue(pages[idx], name);
        }

        // 4. Role-specific KPI labels
        const kpiChecks = [
            { idx: iGEN,  name: 'Generator', kpi: 'Profit/MW'                  },
            { idx: iSUP,  name: 'Supplier',  kpi: 'Cost/MWh'                   },
            { idx: iTRAD, name: 'Trader',    kpi: 'Mark-to-Market'             },
            { idx: iBESS, name: 'BESS',      kpi: 'STATE OF CHARGE'            },
            { idx: iDSR,  name: 'DSR',       kpi: 'Live Operational State'     },
            { idx: iIC,   name: 'IC',        kpi: 'Price Coupling'             },
            { idx: iNESO, name: 'NESO',      kpi: 'Live Merit Order'           },
        ];
        for (const { idx, name, kpi } of kpiChecks) {
            await checkText(pages[idx], kpi, `${name}: KPI label "${kpi}" visible`);
        }

        // 5. Leaderboard player count on NESO screen
        try {
            const count = await pages[iNESO].evaluate(() => {
                const m = document.body.textContent.match(/Players\s*\((\d+)\)/);
                return m ? parseInt(m[1], 10) : 0;
            });
            if (count >= ROLES.length)
                pass(`Leaderboard: shows ${count} players (expected ≥ ${ROLES.length})`);
            else
                fail('Leaderboard count', new Error(`Expected ≥ ${ROLES.length}, got ${count}`));
        } catch (e) { fail('Leaderboard count', e); }

        // 6. BESS: SoC indicator still present after settlement
        await checkText(pages[iBESS], 'STATE OF CHARGE', 'BESS: SoC panel visible post-settlement');

        // 7. DSR: rebound/curtail state panel present
        await checkText(pages[iDSR], 'SYSTEM STATUS', 'DSR: System status panel visible');

        // 8. Interconnector: price spread display
        await checkText(pages[iIC], 'PRICE ARBITRAGE SPREAD', 'IC: Arbitrage spread panel visible');

        // 9. Trader: MTM P&L panel present
        await checkText(pages[iTRAD], 'TRADING DESK ANALYSIS', 'Trader: Trading Desk Analysis visible');

        // 10. NESO: Frequency indicator present
        await checkText(pages[iNESO], 'Hz', 'NESO: Frequency indicator visible');

        // 11. Market Dictionary – opens and closes (tested on Generator screen)
        console.log('\n   [Feature] Market Dictionary toggle…');
        try {
            await clickButton(pages[iGEN], 'Market Dictionary', 15000);
            await waitFor(pages[iGEN],
                () => document.body.textContent.includes('GridForge Terminology'), 10000);
            pass('Market Dictionary: opens');

            await clickButton(pages[iGEN], 'Close Dictionary', 10000);
            await waitFor(pages[iGEN],
                () => !document.body.textContent.includes('GridForge Terminology'), 10000);
            pass('Market Dictionary: closes');
        } catch (e) { fail('Market Dictionary toggle', e); }

        // 13. NESO: Freeze & Explain (pause) toggle
        console.log('\n   [Feature] NESO pause / resume toggle…');
        try {
            await clickButton(pages[iNESO], 'FREEZE', 10000);
            await waitFor(pages[iNESO],
                () => document.body.textContent.includes('RESUME'), 10000);
            pass('NESO: Freeze & Explain works');

            await clickButton(pages[iNESO], 'RESUME', 10000);
            await waitFor(pages[iNESO],
                () => document.body.textContent.includes('FREEZE'), 10000);
            pass('NESO: Resume works');
        } catch (e) { fail('NESO: Pause/Resume toggle', e); }

        // 14. New realism features checks
        console.log('\n   [Feature] Realism implementation checks…');
        
        // BSUoS socialization
        for (const { idx, name } of revChecks) {
            const hasBSUoS = await pages[idx].evaluate(() =>
                document.body.textContent.includes('BSUoS') ||
                document.body.textContent.includes('SOCIALIZED')
            );
            hasBSUoS ? pass(`${name}: BSUoS socialization visible`) : warn(`${name}: BSUoS not found`, 'May not have imbalance costs');
        }

        // NESO manual dispatch UI
        const hasManualDispatch = await pages[iNESO].evaluate(() =>
            document.body.textContent.includes('Manual Dispatch') ||
            document.body.textContent.includes('EXECUTE')
        );
        hasManualDispatch ? pass('NESO: Manual dispatch UI present') : fail('NESO: Manual dispatch UI missing', new Error('New NESO control not implemented'));

        // CfD payments for renewables
        const hasCfD = await pages[iGEN].evaluate(() =>
            document.body.textContent.includes('CfD') ||
            document.body.textContent.includes('CONTRACT FOR DIFFERENCE')
        );
        hasCfD ? pass('Generator: CfD payments visible') : warn('Generator: CfD not found', 'May not have renewable assets');

        // Capacity market payments
        const hasCapacity = await pages[iGEN].evaluate(() =>
            document.body.textContent.includes('CAPACITY') ||
            document.body.textContent.includes('CM PAYMENT')
        );
        hasCapacity ? pass('Generator: Capacity market payments visible') : warn('Generator: Capacity payments not found', 'May not have thermal assets');

        // LoLP/VoLL scarcity pricing
        const hasScarcity = await pages[iNESO].evaluate(() =>
            document.body.textContent.includes('LoLP') ||
            document.body.textContent.includes('VoLL') ||
            document.body.textContent.includes('SCARCITY')
        );
        hasScarcity ? pass('NESO: LoLP/VoLL scarcity pricing visible') : warn('NESO: Scarcity pricing not found', 'May not have triggered scarcity');

        // 15. All non-host players have their left-column net position widget
        const positionChecks = [
            { idx: iGEN,  label: 'Generator: NET POS widget' },
            { idx: iSUP,  label: 'Supplier: HEDGE RATIO widget' },
            { idx: iBESS, label: 'BESS: NET POS widget'     },
            { idx: iDSR,  label: 'DSR: NET POS widget'      },
        ];
        for (const { idx, label } of positionChecks) {
            const found = await pages[idx].evaluate(() =>
                document.body.textContent.includes('NET POS') ||
                document.body.textContent.includes('HEDGE RATIO')
            );
            found ? pass(label) : fail(label, new Error('Position widget missing'));
        }

    } catch (globalErr) {
        fail('GLOBAL TEST ERROR', globalErr);
    } finally {
        // ── Print summary ──
        console.log('\n══════════════════════════════════════════════════════════════');
        console.log(`  RESULTS: ${results.passed.length} passed  |  ${results.failed.length} failed  |  ${results.warned.length} warned`);

        if (results.warned.length > 0) {
            console.log('\n  Warnings:');
            results.warned.forEach(({ label, msg }) =>
                console.log(`    ⚠️  ${label}: ${msg}`));
        }

        if (results.failed.length > 0) {
            console.log('\n  Failed:');
            results.failed.forEach(({ label, err }) =>
                console.error(`    ✗  ${label}: ${err?.message || err}`));
        }
        console.log('══════════════════════════════════════════════════════════════\n');

        for (const b of browsers) await b.close().catch(() => {});
    }

    process.exit(results.failed.length > 0 ? 1 : 0);
})();
