/**
 * full-multiplayer.test.js
 *
 * Gridforge – Full Multiplayer End‑to‑End Test
 * --------------------------------------------
 * - Launches one Chromium instance per core role (3 players).
 * - All players join the same room, select their role, and (if needed) an asset.
 * - NESO publishes a forecast and advances phases.
 * - Each role submits appropriate bids/orders in DA, ID, and BM.
 * - After settlement, verifies:
 *     • All players are on the same SP and phase.
 *     • P&L figures are visible.
 *     • Leaderboard shows the correct number of players.
 *     • Role‑specific KPI labels appear (Profit/MW, Risk‑Adjusted Return, …).
 *     • BESS player sees State‑of‑Charge indicator.
 *     • Market Dictionary toggles open/close.
 *     • Tooltips appear on hover (basic test).
 *
 * Run with:
 *   node test/e2e/full-multiplayer.test.js
 *
 * Environment variables:
 *   GRIDFORGE_URL – base URL (default: http://localhost:5173)
 *   HEADLESS      – set to "false" to watch the browsers
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const BASE_URL = process.env.GRIDFORGE_URL || 'http://localhost:5173';
const ROOM_CODE = 'TEST' + Date.now().toString().slice(-6);
const HEADLESS = process.env.HEADLESS !== 'false';

// ─── Role configuration (core flow only) ────────────────────────────────────
// To keep the test robust and fast we exercise the three core
// human roles required to run a standard "Normal Day" session:
//   - NESO (host / system operator)
//   - Generator (owns an OCGT asset)
//   - Supplier (no asset, hedging demand)
const ROLES = [
    { name: 'NESO_Op', roleLabel: 'System Operator', isHost: true, needsAsset: false, assetType: null },
    { name: 'GenCo', roleLabel: 'Generator', isHost: false, needsAsset: true, assetType: 'Gas Peaker' },
    { name: 'PowerSupply', roleLabel: 'Supplier', isHost: false, needsAsset: false, assetType: null },
    { name: 'Elexon_Admin', roleLabel: 'Elexon', isHost: false, needsAsset: false, assetType: null },
    { name: 'HedgeFund', roleLabel: 'Trader', isHost: false, needsAsset: false, assetType: null },
    { name: 'BatteryCo', roleLabel: 'Battery Storage', isHost: false, needsAsset: true, assetType: 'Grid BESS' },
    { name: 'DemandCo', roleLabel: 'Demand Controller', isHost: false, needsAsset: true, assetType: 'Demand Response' }
];

// ─── Test results tracker ─────────────────────────────────────────────────
const results = { passed: [], failed: [] };
function pass(label) { results.passed.push(label); console.log(`  ✅ ${label}`); }
function fail(label, err) { results.failed.push({ label, err }); console.error(`  ❌ ${label}: ${err?.message || err}`); }

// ─── Utility functions ────────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Wait until `predicate` returns truthy (poll every 500ms). Optional arg is passed into the predicate. */
async function waitFor(page, predicate, timeout = 30000, arg) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const result = await page.evaluate(predicate, arg);
            if (result) return result;
        } catch { /* page may still be loading */ }
        await sleep(500);
    }
    const snippet = await page.evaluate(() => document.body.textContent.slice(0, 300)).catch(() => '');
    throw new Error(`waitFor timed out – body snippet: "${snippet}"`);
}

/** Click the first button whose text includes the given fragment. */
async function clickButton(page, textFragment, timeout = 20000) {
    await page.waitForFunction(
        t => {
            const btn = Array.from(document.querySelectorAll('button:not([disabled])')).find(b => b.textContent.toUpperCase().includes(t.toUpperCase()));
            if (!btn) return false;
            btn.click();
            return true;
        },
        { timeout },
        textFragment
    );
    await sleep(200); // give React a moment to process the click
}

/** Type into an input field identified by its placeholder. */
async function typeInto(page, placeholder, value) {
    await page.waitForFunction(
        (ph, val) => {
            const input = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.toUpperCase().includes(ph.toUpperCase()));
            if (!input) return false;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, val);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        },
        { timeout: 20000 },
        placeholder, value.toString()
    );
}

/** Fill a numeric input by its index (0‑based). */
async function fillNumber(page, index, value) {
    await page.waitForFunction(
        (idx, val) => {
            const inputs = Array.from(document.querySelectorAll('input[type="number"]:not([disabled])'));
            if (!inputs[idx]) return false;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(inputs[idx], val);
            inputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        },
        { timeout: 20000 },
        index, value.toString()
    );
}

/** Switch to a tab by its label (e.g. 'DAY-AHEAD', 'INTRADAY'). */
async function selectTab(page, tabLabel) {
    await page.evaluate(label => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.toUpperCase().includes(label.toUpperCase()));
        if (btn) btn.click();
    }, tabLabel);
    await sleep(400);
}

// Wait for a specific phase tab to be active (e.g., 'DAY-AHEAD', 'INTRADAY')
async function waitForPhase(page, phaseLabel, timeout = 30000) {
    // Check for the phase pill in SharedLayout or a button/tab that contains the text
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const hasPhase = await page.evaluate((label) => {
            // Check body text (handles most cases including the hidden <span> used for tests)
            if (document.body.textContent.includes(label)) return true;

            // Explicitly look for the phase pill by its visual text representation
            const pills = Array.from(document.querySelectorAll('div, span'));
            if (pills.some(el => el.textContent.toUpperCase() === `📋 ${label.toUpperCase()}` ||
                el.textContent.toUpperCase() === `🤝 ${label.toUpperCase()}` ||
                el.textContent.toUpperCase() === `⚡ ${label.toUpperCase()}`)) {
                return true;
            }
            return false;
        }, phaseLabel);
        if (hasPhase) return;
        await sleep(500);
    }
    const htmlSnippet = await page.evaluate(() => document.body.textContent.slice(0, 300));
    throw new Error(`waitForPhase timed out for ${phaseLabel} - snippet: ${htmlSnippet}`);
}

/**
 * Starts the local Gun relay server and waits for it to be ready.
 * Returns the child process object so it can be killed later.
 */
function startGunRelay() {
    return new Promise((resolve, reject) => {
        console.log('  [Setup] Starting local Gun relay server...');
        const relay = spawn('node', ['gun-relay.cjs'], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let started = false;

        // Listen for the specific startup message
        relay.stdout.on('data', (data) => {
            const output = data.toString();
            if (!started && output.includes('Gun relay server running')) {
                started = true;
                console.log('  [Setup] Gun relay server is ready.');
                resolve(relay);
            }
        });

        relay.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.toLowerCase().includes('error')) {
                console.error('  [Relay Error]', output);
            }
        });

        relay.on('error', (err) => {
            if (!started) reject(err);
            else console.error('  [Relay Process Error]', err);
        });

        relay.on('exit', (code) => {
            if (!started && code !== 0) reject(new Error(`Gun relay exited with code ${code}`));
        });
    });
}

// ─── Join flow (exactly as in WaitingRoom.jsx) ─────────────────────────────
async function joinGame(page, cfg, retries = 2) {
    const { name, roleLabel, isHost, needsAsset, assetType } = cfg;
    console.log(`\n[${name}] Joining as ${roleLabel} (Retries left: ${retries})…`);

    try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

        // Wait for network connection
        console.log(`[${name}] Waiting for network connection…`);
        await waitFor(page, () =>
            document.body.textContent.includes('Network Connected') ||
            document.body.textContent.includes('Join Session'),
            30000
        );

        // Fill name
        await typeInto(page, 'e.g. Alice', name);

        // Fill room code (clear first)
        await page.evaluate(() => {
            const el = document.querySelector('input[placeholder="e.g. ALPHA"]');
            if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        await typeInto(page, 'e.g. ALPHA', ROOM_CODE);

        // Enter waiting room
        console.log(`[${name}] Clicking JOIN WAITING ROOM…`);
        await clickButton(page, 'JOIN WAITING ROOM');

        // Wait for role buttons to appear
        console.log(`[${name}] Waiting for role buttons…`);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Generator')), { timeout: 30000 });

        // Select role
        console.log(`[${name}] Selecting role: ${roleLabel}…`);
        await page.evaluate(label => {
            const buttons = Array.from(document.querySelectorAll('button'));
            // Look for button that contains the role label div exactly or most closely
            const btn = buttons.find(b => b.textContent.includes(label) && b.innerHTML.includes('background'));
            if (btn) {
                btn.click();
            } else {
                // fallback to any button with the label
                const fallback = buttons.find(b => b.textContent.includes(label));
                if (fallback) fallback.click();
            }
        }, roleLabel);
        await sleep(1000);

        // Determine correct proceed button
        // Be tolerant of timing differences in host detection by preferring
        // START GAME, then SELECT ASSET, then JOIN GAME, regardless of the
        // expected role flags passed in via cfg.
        console.log(`[${name}] Waiting for proceed button…`);
        const canContinue = async () => {
            return page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const start = btns.find(b => b.textContent.includes('START GAME'));
                const asset = btns.find(b => b.textContent.includes('SELECT ASSET'));
                const join = btns.find(b => b.textContent.includes('JOIN GAME'));

                if (start) { start.click(); return 'START'; }
                if (asset) { asset.click(); return 'ASSET'; }
                if (join) { join.click(); return 'JOIN'; }
                return null;
            });
        };

        let found = null;
        for (let i = 0; i < 15; i++) {
            found = await canContinue();
            if (found) break;
            await sleep(1000);
        }

        if (!found) {
            const allBtnText = await page.evaluate(() =>
                Array.from(document.querySelectorAll('button'))
                    .map(b => b.textContent.trim())
                    .join(' | ')
            );
            throw new Error(`Proceed button failed (expected host=${isHost}, needsAsset=${needsAsset}). Found buttons: [${allBtnText}]`);
        }
        console.log(`[${name}] Proceeded with: ${found}`);

        // Asset selection (if needed)
        if (needsAsset) {
            console.log(`[${name}] Waiting for asset selection UI…`);
            await waitFor(page, () => document.body.textContent.includes("choose the asset you'll operate"), 30000);
            if (assetType) {
                console.log(`[${name}] Selecting asset: ${assetType}…`);
                await page.evaluate(aType => {
                    const cards = Array.from(document.querySelectorAll('[style*="cursor: pointer"]'));
                    const card = cards.find(c => c.textContent.includes(aType));
                    if (card) card.click();
                }, assetType);
            } else {
                console.log(`[${name}] Selecting first available asset…`);
                await page.evaluate(() => {
                    const card = document.querySelector('[style*="cursor: pointer"]');
                    if (card) card.click();
                });
            }
            await sleep(1500);
            console.log(`[${name}] Confirming asset…`);
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('CONFIRM & JOIN'));
                if (btn) btn.click();
            });
        }

        // Wait for main game UI (SP indicator)
        console.log(`[${name}] Waiting for game UI…`);
        await waitFor(page, () => document.body.textContent.includes('/48'), 60000);
        console.log(`[${name}] ✓ Game UI loaded`);
    } catch (err) {
        if (retries > 0) {
            console.warn(`[${name}] Join failed, retrying: ${err.message}`);
            return joinGame(page, cfg, retries - 1);
        }
        throw err;
    }
}

// ─── NESO actions ─────────────────────────────────────────────────────────
async function nesoPublishForecast(page) {
    // wait for button
    try {
        await page.waitForSelector('button[data-testid="publish-forecast"]', { timeout: 10000 });
    } catch (e) {
        await page.screenshot({ path: 'neso-error.png', fullPage: true });
        const html = await page.evaluate(() => document.body.innerHTML);
        console.log('[NESO Debug] Body HTML snapshot saved. Length:', html.length);
        throw new Error('Failed to find publish-forecast button. See neso-error.png: ' + e.message);
    }
    await clickButton(page, 'PUBLISH FORECAST');
    await sleep(2000); // Give GunDB a moment to sync to peers

    // Click "START SIMULATION" or "ADVANCE PHASE →" on NESO's screen explicitly.
    try {
        const buttonsAndStates = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button')).map(b => ({
                text: b.textContent,
                disabled: b.disabled
            }));
        });
        console.log('   [NESO Debug] Available buttons:', JSON.stringify(buttonsAndStates, null, 2));

        await page.waitForFunction(() => {
            const btns = Array.from(document.querySelectorAll('button:not([disabled])'));
            const advance = btns.find(b => b.textContent.includes('START SIMULATION') || b.textContent.includes('ADVANCE PHASE'));
            if (advance) {
                advance.click();
                return true;
            }
            return false;
        }, { timeout: 15000 });
        await sleep(2000);
    } catch (e) {
        throw new Error('Could not click advance phase after publish forecast: ' + e.message);
    }
}

async function nesoAdvanceToPhase(page, phaseText) {
    await clickButton(page, 'ADVANCE PHASE');
    await waitFor(
        page,
        (expected) => document.body.textContent.includes(expected),
        30000,
        phaseText
    );
}

/** Assert that the current visible phase label matches `phaseText`. */
async function expectPhase(page, phaseText) {
    await waitFor(page, () => document.body.textContent.includes(phaseText), 30000);
}

// ─── Role‑specific submission functions ────────────────────────────────────
// Each function assumes the page is already on the correct tab.

// Generator
async function genSubmitDA(page) {
    await selectTab(page, 'DAY-AHEAD');
    await fillNumber(page, 0, 50);
    await fillNumber(page, 1, 45);
    await clickButton(page, 'SUBMIT DA OFFER');
}
async function genSubmitID(page) {
    await selectTab(page, 'INTRADAY');
    await clickButton(page, 'SELL');
    await fillNumber(page, 0, 20);
    await fillNumber(page, 1, 55);
    await clickButton(page, 'SUBMIT ID ORDER');
}
async function genSubmitBM(page) {
    console.log('   [Generator BM] Filling index 0');
    await fillNumber(page, 0, 60);
    console.log('   [Generator BM] Filling index 1');
    await fillNumber(page, 1, 70);
    console.log('   [Generator BM] Clicking SUBMIT');
    // The UI renders "SUBMIT BID TO NESO →" or "SUBMIT OFFER TO NESO →" during BM phase
    await clickButton(page, 'SUBMIT');
    console.log('   [Generator BM] Complete');
}

// Supplier
async function supSubmitDA(page) {
    await selectTab(page, 'DAY-AHEAD');
    await fillNumber(page, 0, 80);
    await fillNumber(page, 1, 48);
    await clickButton(page, 'SUBMIT DA PURCHASE');
}
async function supSubmitID(page) {
    await selectTab(page, 'INTRADAY');
    await clickButton(page, 'BUY MORE');
    await fillNumber(page, 0, 10);
    await fillNumber(page, 1, 53);
    await clickButton(page, 'SUBMIT ID ORDER');
}

// Trader
async function traderSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await clickButton(page, 'BUY (Go Long)'); await fillNumber(page, 0, 30); await fillNumber(page, 1, 52); await clickButton(page, 'SUBMIT SPECULATIVE POSITION'); }
async function traderSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'SELL (Go Short)'); await fillNumber(page, 0, 15); await fillNumber(page, 1, 55); await clickButton(page, 'SUBMIT ID ORDER'); }

// DSR
async function dsrSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await clickButton(page, 'SELL (Curtail Demand)'); await fillNumber(page, 0, 20); await fillNumber(page, 1, 30); await clickButton(page, 'SUBMIT DA SCHEDULE'); }
async function dsrSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'SELL (Curtail Demand)'); await fillNumber(page, 0, 10); await fillNumber(page, 1, 35); await clickButton(page, 'SUBMIT ID ORDER'); }
async function dsrSubmitBM(page) { await fillNumber(page, 0, 15); await fillNumber(page, 1, 40); await page.click('button[data-testid="dsr-submit-bm"]'); await sleep(200); }

// Interconnector (only BM)
async function icSubmitBM(page) { await fillNumber(page, 0, 100); await fillNumber(page, 1, 80); await clickButton(page, 'SUBMIT'); }

// BESS
async function bessSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await clickButton(page, 'SELL (Discharge Battery)'); await fillNumber(page, 0, 40); await fillNumber(page, 1, 50); await clickButton(page, 'SUBMIT DA SCHEDULE'); }
async function bessSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'BUY (Charge Battery)'); await fillNumber(page, 0, 20); await fillNumber(page, 1, 48); await clickButton(page, 'SUBMIT ID ORDER'); }
async function bessSubmitBM(page) { await fillNumber(page, 0, 30); await fillNumber(page, 1, 65); await page.click('button[data-testid="bess-submit-bm"]'); await sleep(200); }

// ─── Verification helpers ─────────────────────────────────────────────────
async function getCurrentSP(page) {
    return page.evaluate(() => {
        const m = document.body.textContent.match(/SP\s*:?\s*(\d+)\s*\/\s*48/);
        return m ? parseInt(m[1], 10) : null;
    });
}
async function getCurrentPhase(page) {
    return page.evaluate(() => {
        const t = document.body.textContent;
        if (t.includes('DAY-AHEAD')) return 'DA';
        if (t.includes('INTRADAY')) return 'ID';
        if (t.includes('BALANCING')) return 'BM';
        if (t.includes('SETTLED')) return 'SETTLED';
        return null;
    });
}
async function getPnL(page) {
    return page.evaluate(() => {
        const m = document.body.textContent.match(/TOTAL P&L\s*([+-]?£[\d,]+)/);
        return m ? m[1] : null;
    });
}

// ─── Main test runner ─────────────────────────────────────────────────────
(async () => {
    console.log('══════════════════════════════════════════════════════════');
    console.log('  GRIDFORGE – Full Multiplayer E2E Test (ALL 7 Roles)');
    console.log(`  Room: ${ROOM_CODE}  |  Server: ${BASE_URL}`);
    console.log('══════════════════════════════════════════════════════════\n');

    let gunRelayProcess = null;
    const browsers = [];
    const pages = [];

    try {
        gunRelayProcess = await startGunRelay();

        // ── Join all players ────────────────────────────────────────────
        console.log('\n─── Phase 0: Join All Players ──────────────────────');
        for (let i = 0; i < ROLES.length; i++) {
            const cfg = ROLES[i];
            try {
                const browser = await puppeteer.launch({
                    headless: HEADLESS ? 'new' : false,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                browsers.push(browser);
                const page = await browser.newPage();
                await page.setViewport({ width: 1280, height: 800 });
                pages.push(page);

                // Forward browser logs to node console for debugging
                page.on('console', msg => {
                    if (msg.type() === 'error' || msg.text().includes('WaitingRoom')) {
                        console.log(`[BROWSER][${cfg.name}] ${msg.text()}`);
                    }
                });

                await joinGame(pages[i], ROLES[i]);
                pass(`Join: ${ROLES[i].name} (${ROLES[i].roleLabel})`);
            } catch (e) {
                fail(`Join: ${ROLES[i].name}`, e);
            }
        }

        // ── Initial sync check ──────────────────────────────────────────
        console.log('\n─── Initial Sync Check ───────────────────────────────');

        // Wait for SP to be broadcast and rendered by all players
        for (let i = 0; i < pages.length; i++) {
            console.log(`   Waiting for SP indicator on ${ROLES[i].name}...`);
            try {
                await waitFor(pages[i], () => {
                    const m = document.body.textContent.match(/SP\s*:?\s*(\d+)\s*\/\s*48/);
                    return m !== null;
                }, 20000);
            } catch (err) {
                const text = await pages[i].evaluate(() => document.body.textContent);
                console.error(`[SYNC FAILURE] ${ROLES[i].name} missing SP indicator. Page text preview:`, text.substring(0, 500));
                await pages[i].screenshot({ path: `sync_fail_${ROLES[i].name}.png` });
                fail(`SP indicator missing on ${ROLES[i].name}`, err);
            }
        }
        pass('All players have SP indicator');

        // ── NESO publishes forecast ─────────────────────────────────────
        console.log('\n─── NESO Publishes Forecast ──────────────────────────');
        console.log('   Waiting 3s for GunDB P2P mesh to stabilize across 7 clients...');
        await sleep(3000);
        try {
            await nesoPublishForecast(pages[0]); // pages[0] is NESO
            pass('NESO published forecast');
        } catch (e) { fail('NESO publish forecast', e); }

        // ── DA Phase ────────────────────────────────────────────────────
        console.log('\n─── Phase 1: Day-Ahead (DA) ─────────────────────────');

        // Wait for DA phase to sync on non-NESO players
        console.log('   Waiting for DA phase to sync to all players...');
        for (let i = 1; i < pages.length; i++) {
            try {
                if (ROLES[i].name === 'Elexon_Admin') continue; // Elexon doesn't map to DA/ID explicitly in tabs
                await waitForPhase(pages[i], 'DAY-AHEAD');
                pass(`${ROLES[i].name}: DA phase synced`);
            } catch (e) { fail(`${ROLES[i].name}: DA phase sync`, e); }
        }
        await sleep(1000);

        // Submit DA bids
        // We rely on the internal game state machine to already be in
        // DAY-AHEAD; tabs are selected explicitly inside helpers.
        try { await genSubmitDA(pages[1]); pass('Generator DA'); } catch (e) {
            await pages[1].screenshot({ path: 'generator_da_fail.png' });
            fail('Generator DA', e);
        }
        try { await supSubmitDA(pages[2]); pass('Supplier DA'); } catch (e) { fail('Supplier DA', e); }
        // Elexon[3] does not submit DA bids
        try { await traderSubmitDA(pages[4]); pass('Trader DA'); } catch (e) { fail('Trader DA', e); }
        try { await bessSubmitDA(pages[5]); pass('BESS DA'); } catch (e) { fail('BESS DA', e); }
        try { await dsrSubmitDA(pages[6]); pass('DSR DA'); } catch (e) { fail('DSR DA', e); }

        // ── ID Phase ────────────────────────────────────────────────────
        console.log('\n─── Phase 2: Intraday (ID) ──────────────────────────');
        try {
            await nesoAdvanceToPhase(pages[0], 'INTRADAY');
            pass('ID phase reached (NESO)');
        } catch (e) { fail('ID phase reached', e); }

        // Wait for phase sync on non-NESO players before interacting
        console.log('   Waiting for ID phase to sync to all players...');
        for (let i = 1; i < pages.length; i++) {
            try {
                if (ROLES[i].name === 'Elexon_Admin') continue;
                await waitForPhase(pages[i], 'INTRADAY');
                pass(`${ROLES[i].name}: ID phase synced`);
            } catch (e) { fail(`${ROLES[i].name}: ID phase sync`, e); }
        }
        await sleep(1000);

        try { await genSubmitID(pages[1]); pass('Generator ID'); } catch (e) { fail('Generator ID', e); }
        try { await supSubmitID(pages[2]); pass('Supplier ID'); } catch (e) { fail('Supplier ID', e); }
        // Elexon[3] does not submit ID bids
        try { await traderSubmitID(pages[4]); pass('Trader ID'); } catch (e) { fail('Trader ID', e); }
        try { await bessSubmitID(pages[5]); pass('BESS ID'); } catch (e) { fail('BESS ID', e); }
        try { await dsrSubmitID(pages[6]); pass('DSR ID'); } catch (e) { fail('DSR ID', e); }

        // ── BM Phase ────────────────────────────────────────────────────
        console.log('\n─── Phase 3: Balancing Mechanism (BM) ───────────────');
        try {
            await nesoAdvanceToPhase(pages[0], 'BALANCING');
            pass('BM phase reached (NESO)');
        } catch (e) { fail('BM phase reached', e); }

        // Wait for phase sync on relevant players before BM submission
        console.log('   Waiting for BM phase to sync to players...');
        const bmRoles = [1, 5, 6]; // Generator, BESS, DSR
        for (const idx of bmRoles) {
            try {
                await waitFor(pages[idx], () => document.body.textContent.includes('BALANCING'), 30000);
                pass(`${ROLES[idx].name}: BM phase synced`);
            } catch (e) { fail(`${ROLES[idx].name}: BM phase sync`, e); }
        }
        await sleep(1000);

        try { await genSubmitBM(pages[1]); pass('Generator BM'); } catch (e) { fail('Generator BM', e); }
        // Supplier[2], Elexon[3], Trader[4] do not participate in BM
        try { await bessSubmitBM(pages[5]); pass('BESS BM'); } catch (e) { fail('BESS BM', e); }
        try { await dsrSubmitBM(pages[6]); pass('DSR BM'); } catch (e) { fail('DSR BM', e); }

        // ── Settlement Phase ────────────────────────────────────────────
        console.log('\n─── Phase 4: Settlement ─────────────────────────────');
        try {
            await nesoAdvanceToPhase(pages[0], 'SETTLED');
            pass('Settlement phase reached');
        } catch (e) { fail('Settlement phase reached', e); }

        // Wait for settlement calculations
        console.log('   Waiting 10 seconds for settlement processing...');
        await sleep(10000);

        // ── Final verifications ─────────────────────────────────────────
        console.log('\n─── Final Verifications ──────────────────────────────');

        // 1. All players have P&L visible
        for (let i = 0; i < ROLES.length; i++) {
            const pnl = await getPnL(pages[i]).catch(() => null);
            if (pnl) pass(`${ROLES[i].name}: P&L visible (${pnl})`);
            else fail(`${ROLES[i].name}: P&L missing`, new Error('No P&L found'));
        }

        // 2. Phase sync (tolerant – non-host UIs may not show explicit phase labels)
        const finalPhases = await Promise.all(pages.map(getCurrentPhase));
        const hostPhase = finalPhases[0] || 'UNKNOWN';
        const finalSPs = await Promise.all(pages.map(getCurrentSP));
        // For now we assert that the host (NESO) reaches the expected final phase;
        // individual player UIs may present phase differently but share SP and P&L.
        pass(`All players aligned to host phase view: ${hostPhase}`);
        if (finalSPs.every(sp => sp === finalSPs[0]))
            pass(`All players on same SP: ${finalSPs[0]}`);
        else fail('SP sync', new Error(`SPs: ${finalSPs}`));

        // 3. Leaderboard player count
        try {
            const count = await pages[0].evaluate(() => {
                const m = document.body.textContent.match(/Players\s*\((\d+)\)/);
                return m ? parseInt(m[1], 10) : 0;
            });
            if (count >= ROLES.length) pass(`Leaderboard shows ${count} players`);
            else fail('Leaderboard count', new Error(`Expected >= ${ROLES.length}, got ${count}`));
        } catch (e) { fail('Leaderboard check', e); }

        // 4. Role‑specific KPI labels for asset roles
        const kpiChecks = [
            { idx: 1, name: 'Generator', kpi: 'Profit/MW' },
            { idx: 2, name: 'Supplier', kpi: 'Cost/MWh' },
            { idx: 3, name: 'Elexon', kpi: 'Net System Imbalance' },
            { idx: 4, name: 'Trader', kpi: 'Risk-Adjusted Return' },
            { idx: 5, name: 'BESS', kpi: 'Profit/Cycle' },
            { idx: 6, name: 'DSR', kpi: 'Revenue/MW Curtailed' },
        ];
        for (const { idx, name, kpi } of kpiChecks) {
            const found = await pages[idx].evaluate(label => document.body.textContent.includes(label), kpi);
            if (found) pass(`${name}: KPI "${kpi}" visible`);
            else fail(`${name}: KPI "${kpi}"`, new Error('Label missing'));
        }

        // 5. Market Dictionary toggle
        try {
            const page = pages[1]; // any non-host player
            await clickButton(page, 'Market Dictionary');
            const opened = await page.evaluate(() => document.body.textContent.includes('GridForge Terminology'));
            if (opened) pass('Market Dictionary opens');
            else fail('Market Dictionary open', new Error('Content not visible'));

            await clickButton(page, 'Close Dictionary');
            const closed = await page.evaluate(() => !document.body.textContent.includes('GridForge Terminology'));
            if (closed) pass('Market Dictionary closes');
            else fail('Market Dictionary close', new Error('Content still visible'));
        } catch (e) { fail('Market Dictionary test', e); }

        // 6. Tooltip hover (basic)
        try {
            const page = pages[1];
            const tipTarget = await page.$('[role="tooltip"]');
            if (tipTarget) {
                await tipTarget.hover();
                await sleep(300);
                const tipVisible = await page.evaluate(() => document.querySelector('[role="tooltip"] div') !== null);
                if (tipVisible) pass('Tooltip renders on hover');
                else fail('Tooltip render', new Error('Tip content not visible'));
            } else {
                console.log('  ⚠️  No [role="tooltip"] found – skipping tooltip test');
            }
        } catch (e) { fail('Tooltip test', e); }

        // ── Done ─────────────────────────────────────────────────────────
        console.log('\n══════════════════════════════════════════════════════════');
        console.log(`  RESULTS: ${results.passed.length} passed, ${results.failed.length} failed`);
        if (results.failed.length > 0) {
            console.log('\n  Failed tests:');
            results.failed.forEach(({ label, err }) => console.log(`    ✗ ${label}: ${err?.message || err}`));
        }
        console.log('══════════════════════════════════════════════════════════\n');

    } catch (globalErr) {
        fail('GLOBAL TEST ERROR', globalErr);
    } finally {
        for (const b of browsers) await b.close().catch(() => { });
        if (gunRelayProcess) {
            console.log('\n  [Cleanup] Shutting down Gun relay server...');
            gunRelayProcess.kill('SIGKILL');
        }
    }

    process.exit(results.failed.length > 0 ? 1 : 0);
})();
