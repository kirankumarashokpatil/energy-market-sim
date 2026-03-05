/**
 * full-multiplayer.test.js
 *
 * Gridforge – Full Multiplayer End‑to‑End Test
 * --------------------------------------------
 * - Launches one Chromium instance per role (8 players).
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

const BASE_URL = process.env.GRIDFORGE_URL || 'http://localhost:5173';
const ROOM_CODE = 'TEST' + Math.floor(Math.random() * 9000 + 1000);
const HEADLESS = process.env.HEADLESS !== 'false';

// ─── Role configuration (derived from WaitingRoom.jsx and ROLES) ───────────
const ROLES = [
    { name: 'NESO_Op', roleLabel: 'System Operator', isHost: true, needsAsset: false, assetType: null },
    { name: 'Elexon_Op', roleLabel: 'Elexon', isHost: false, needsAsset: false, assetType: null },
    { name: 'GenCo', roleLabel: 'Generator', isHost: false, needsAsset: true, assetType: 'OCGT' },
    { name: 'PowerSupply', roleLabel: 'Supplier', isHost: false, needsAsset: true, assetType: 'BRITISH_GAS' },
    { name: 'TraderJoe', roleLabel: 'Trader', isHost: false, needsAsset: false, assetType: null },
    { name: 'DSR_Agg', roleLabel: 'DSR', isHost: false, needsAsset: true, assetType: 'DSR' },
    { name: 'IC_Link', roleLabel: 'Interconnector', isHost: false, needsAsset: true, assetType: 'IC_IFA' },
    { name: 'BatteryCo', roleLabel: 'BESS', isHost: false, needsAsset: true, assetType: 'BESS_M' },
];

// ─── Test results tracker ─────────────────────────────────────────────────
const results = { passed: [], failed: [] };
function pass(label) { results.passed.push(label); console.log(`  ✅ ${label}`); }
function fail(label, err) { results.failed.push({ label, err }); console.error(`  ❌ ${label}: ${err?.message || err}`); }

// ─── Utility functions ────────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Wait until `predicate` returns truthy (poll every 300ms). */
async function waitFor(page, predicate, timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const result = await page.evaluate(predicate);
            if (result) return result;
        } catch { /* page may still be loading */ }
        await sleep(300);
    }
    const snippet = await page.evaluate(() => document.body.textContent.slice(0, 300)).catch(() => '');
    throw new Error(`waitFor timed out – body snippet: "${snippet}"`);
}

/** Click the first button whose text includes the given fragment. */
async function clickButton(page, textFragment, timeout = 8000) {
    const btn = await page.waitForFunction(
        t => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(t)),
        { timeout },
        textFragment
    );
    await btn.click();
}

/** Type into an input field identified by its placeholder. */
async function typeInto(page, placeholder, value) {
    const input = await page.waitForFunction(
        ph => Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.includes(ph)),
        { timeout: 8000 },
        placeholder
    );
    await input.click({ clickCount: 3 });
    await input.type(value);
}

/** Fill a numeric input by its index (0‑based). */
async function fillNumber(page, index, value) {
    const inputs = await page.$$('input[type="number"]');
    if (!inputs[index]) throw new Error(`No numeric input at index ${index}`);
    
    // Click to focus
    await inputs[index].click({ clickCount: 3 });
    
    // Type the value
    await inputs[index].type(value.toString());
    
    // Wait for DOM to reflect change (React batches state updates)
    // This ensures the input value has propagated through React's onChange handler
    await sleep(100);
    
    // Verify the value was actually set in the DOM
    const actualValue = await page.evaluate(idx => {
        const inputs = document.querySelectorAll('input[type="number"]');
        return inputs[idx]?.value;
    }, index);
    
    if (actualValue !== value.toString()) {
        console.warn(`⚠️  fillNumber: Expected value "${value}", but got "${actualValue}"`);
    }
}

/**
 * Wait for a button to become enabled (not disabled attribute).
 * This is useful after filling form inputs to ensure React has processed state updates.
 */
async function waitForButtonEnabled(page, textFragment, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const isEnabled = await page.evaluate(t => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(t));
            return btn && !btn.disabled;
        }, textFragment);
        
        if (isEnabled) return true;
        await sleep(100);
    }
    
    throw new Error(`Button "${textFragment}" did not become enabled within ${timeout}ms`);
}

/** Switch to a tab by its label (e.g. 'DAY-AHEAD', 'INTRADAY'). */
async function selectTab(page, tabLabel) {
    await page.evaluate(label => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(label));
        if (btn) btn.click();
    }, tabLabel);
    await sleep(400);
}

// ─── Join flow (exactly as in WaitingRoom.jsx) ─────────────────────────────
async function joinGame(page, cfg) {
    const { name, roleLabel, isHost, needsAsset, assetType } = cfg;
    console.log(`\n[${name}] Joining as ${roleLabel}…`);

    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Fill name
    await typeInto(page, 'e.g. Alice', name);

    // Fill room code (clear first)
    await page.evaluate(() => {
        const el = document.querySelector('input[placeholder="e.g. ALPHA"]');
        if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await typeInto(page, 'e.g. ALPHA', ROOM_CODE);

    // Enter waiting room
    await clickButton(page, 'JOIN WAITING ROOM');

    // Wait for role buttons to appear
    await waitFor(page, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Generator')));

    // Select role
    await clickButton(page, roleLabel);
    await sleep(300);

    // Proceed button text depends on host / asset requirement
    const proceedText = isHost ? 'START GAME →'
        : needsAsset ? 'SELECT ASSET →'
            : 'JOIN GAME →';
    await clickButton(page, proceedText);

    // Asset selection (if needed)
    if (needsAsset) {
        await waitFor(page, () => document.body.textContent.includes("choose the asset you'll operate"));
        if (assetType) {
            await page.evaluate(aType => {
                const cards = Array.from(document.querySelectorAll('[style*="cursor: pointer"]'));
                const card = cards.find(c => c.textContent.includes(aType));
                if (card) card.click();
            }, assetType);
        } else {
            const card = await page.waitForFunction(() => document.querySelector('[style*="cursor: pointer"]'), { timeout: 8000 });
            await card.click();
        }
        await sleep(400);
        await clickButton(page, 'CONFIRM & JOIN SIMULATION →');
    }

    // Wait for main game UI (SP indicator)
    await waitFor(page, () => document.body.textContent.includes('/48'), 18000);
    console.log(`[${name}] ✓ Game UI loaded`);
}

// ─── NESO actions ─────────────────────────────────────────────────────────
async function nesoPublishForecast(page) {
    await clickButton(page, 'View Forecast');
    await waitFor(page, () => document.body.textContent.includes('Forecast'));
    await clickButton(page, 'PUBLISH FORECAST');
}

async function nesoAdvanceToPhase(page, phaseText) {
    await clickButton(page, 'ADVANCE PHASE');
    await waitFor(page, () => document.body.textContent.includes(phaseText), 12000);
}

// ─── Role‑specific submission functions ────────────────────────────────────
// Each function assumes the page is already on the correct tab.

// Generator
async function genSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await clickButton(page, 'SELL'); await fillNumber(page, 0, 50); await fillNumber(page, 1, 45); await clickButton(page, 'SUBMIT DA OFFER'); }
async function genSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'SELL'); await fillNumber(page, 0, 20); await fillNumber(page, 1, 55); await clickButton(page, 'SUBMIT ID ORDER'); }
async function genSubmitBM(page) { await fillNumber(page, 0, 60); await fillNumber(page, 1, 70); await waitForButtonEnabled(page, 'SUBMIT'); await clickButton(page, 'SUBMIT'); }

// Supplier
async function supSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await fillNumber(page, 0, 80); await fillNumber(page, 1, 48); await clickButton(page, 'SUBMIT DA PURCHASE'); }
async function supSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'BUY MORE'); await fillNumber(page, 0, 10); await fillNumber(page, 1, 53); await clickButton(page, 'SUBMIT ID ORDER'); }

// Trader
async function traderSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await clickButton(page, 'BUY (Go Long)'); await fillNumber(page, 0, 30); await fillNumber(page, 1, 52); await clickButton(page, 'SUBMIT SPECULATIVE POSITION'); }
async function traderSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'SELL POSITION'); await fillNumber(page, 0, 15); await fillNumber(page, 1, 58); await clickButton(page, 'SUBMIT TO ORDERBOOK'); }

// DSR
async function dsrSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await clickButton(page, 'SELL (Curtail Demand)'); await fillNumber(page, 0, 20); await fillNumber(page, 1, 30); await clickButton(page, 'SUBMIT DA SCHEDULE'); }
async function dsrSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'SELL (Curtail Demand)'); await fillNumber(page, 0, 10); await fillNumber(page, 1, 35); await clickButton(page, 'SUBMIT ID ORDER'); }
async function dsrSubmitBM(page) { await fillNumber(page, 0, 15); await fillNumber(page, 1, 40); await waitForButtonEnabled(page, 'SUBMIT'); await clickButton(page, 'SUBMIT'); }

// Interconnector (only BM)
async function icSubmitBM(page) { await fillNumber(page, 0, 100); await fillNumber(page, 1, 80); await waitForButtonEnabled(page, 'SUBMIT'); await clickButton(page, 'SUBMIT'); }

// BESS
async function bessSubmitDA(page) { await selectTab(page, 'DAY-AHEAD'); await clickButton(page, 'SELL (Discharge Battery)'); await fillNumber(page, 0, 40); await fillNumber(page, 1, 50); await clickButton(page, 'SUBMIT DA SCHEDULE'); }
async function bessSubmitID(page) { await selectTab(page, 'INTRADAY'); await clickButton(page, 'BUY (Charge Battery)'); await fillNumber(page, 0, 20); await fillNumber(page, 1, 48); await clickButton(page, 'SUBMIT ID ORDER'); }
async function bessSubmitBM(page) { await fillNumber(page, 0, 30); await fillNumber(page, 1, 65); await waitForButtonEnabled(page, 'SUBMIT'); await clickButton(page, 'SUBMIT'); }

// ─── Verification helpers ─────────────────────────────────────────────────
async function getCurrentSP(page) {
    return page.evaluate(() => {
        const m = document.body.textContent.match(/SP\s*(\d+)\s*\/\s*48/);
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
    console.log('  GRIDFORGE – Full Multiplayer E2E Test (8 roles)');
    console.log(`  Room: ${ROOM_CODE}  |  Server: ${BASE_URL}`);
    console.log('══════════════════════════════════════════════════════════\n');

    const browsers = [];
    const pages = [];

    try {
        // ── Launch one browser per role ─────────────────────────────────
        for (const cfg of ROLES) {
            const browser = await puppeteer.launch({ headless: HEADLESS ? 'new' : false, args: ['--no-sandbox'] });
            browsers.push(browser);
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            pages.push(page);
        }

        // ── Join all players ────────────────────────────────────────────
        console.log('\n─── Phase 0: Join All Players ───────────────────────');
        for (let i = 0; i < ROLES.length; i++) {
            try {
                await joinGame(pages[i], ROLES[i]);
                pass(`Join: ${ROLES[i].name} (${ROLES[i].roleLabel})`);
            } catch (e) {
                fail(`Join: ${ROLES[i].name}`, e);
            }
        }

        // ── Initial sync check ──────────────────────────────────────────
        console.log('\n─── Initial Sync Check ───────────────────────────────');
        const sps = await Promise.all(pages.map(getCurrentSP));
        if (sps.every(sp => sp !== null)) pass('All players have SP indicator');
        else fail('SP indicator check', new Error(`SPs: ${sps}`));

        // ── NESO publishes forecast ─────────────────────────────────────
        console.log('\n─── NESO Publishes Forecast ──────────────────────────');
        try {
            await nesoPublishForecast(pages[0]); // pages[0] is NESO
            pass('NESO published forecast');
        } catch (e) { fail('NESO publish forecast', e); }

        // ── DA Phase ────────────────────────────────────────────────────
        console.log('\n─── Phase 1: Day-Ahead (DA) ─────────────────────────');
        try {
            await nesoAdvanceToPhase(pages[0], 'DAY-AHEAD');
            pass('DA phase reached');
        } catch (e) { fail('DA phase reached', e); }

        // Submit DA bids
        try { await genSubmitDA(pages[2]); pass('Generator DA'); } catch (e) { fail('Generator DA', e); }
        try { await supSubmitDA(pages[3]); pass('Supplier DA'); } catch (e) { fail('Supplier DA', e); }
        try { await traderSubmitDA(pages[4]); pass('Trader DA'); } catch (e) { fail('Trader DA', e); }
        try { await dsrSubmitDA(pages[5]); pass('DSR DA'); } catch (e) { fail('DSR DA', e); }
        try { await bessSubmitDA(pages[7]); pass('BESS DA'); } catch (e) { fail('BESS DA', e); }

        // ── ID Phase ────────────────────────────────────────────────────
        console.log('\n─── Phase 2: Intraday (ID) ──────────────────────────');
        try {
            await nesoAdvanceToPhase(pages[0], 'INTRADAY');
            pass('ID phase reached');
        } catch (e) { fail('ID phase reached', e); }

        try { await genSubmitID(pages[2]); pass('Generator ID'); } catch (e) { fail('Generator ID', e); }
        try { await supSubmitID(pages[3]); pass('Supplier ID'); } catch (e) { fail('Supplier ID', e); }
        try { await traderSubmitID(pages[4]); pass('Trader ID'); } catch (e) { fail('Trader ID', e); }
        try { await dsrSubmitID(pages[5]); pass('DSR ID'); } catch (e) { fail('DSR ID', e); }
        try { await bessSubmitID(pages[7]); pass('BESS ID'); } catch (e) { fail('BESS ID', e); }

        // ── BM Phase ────────────────────────────────────────────────────
        console.log('\n─── Phase 3: Balancing Mechanism (BM) ───────────────');
        try {
            await nesoAdvanceToPhase(pages[0], 'BALANCING');
            pass('BM phase reached');
        } catch (e) { fail('BM phase reached', e); }

        try { await genSubmitBM(pages[2]); pass('Generator BM'); } catch (e) { fail('Generator BM', e); }
        try { await dsrSubmitBM(pages[5]); pass('DSR BM'); } catch (e) { fail('DSR BM', e); }
        try { await icSubmitBM(pages[6]); pass('Interconnector BM'); } catch (e) { fail('Interconnector BM', e); }
        try { await bessSubmitBM(pages[7]); pass('BESS BM'); } catch (e) { fail('BESS BM', e); }

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

        // 2. Phase sync
        const finalPhases = await Promise.all(pages.map(getCurrentPhase));
        const finalSPs = await Promise.all(pages.map(getCurrentSP));
        if (finalPhases.every(p => p === finalPhases[0]))
            pass(`All players on same phase: ${finalPhases[0]}`);
        else fail('Phase sync', new Error(`Phases: ${finalPhases}`));
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

        // 4. Role‑specific KPI labels (from ScoringEngine primary names)
        const kpiChecks = [
            { idx: 2, name: 'Generator', kpi: 'Profit/MW' },
            { idx: 4, name: 'Trader', kpi: 'Risk-Adjusted Return' },
            { idx: 7, name: 'BESS', kpi: '£/MWh Shifted' },
            { idx: 3, name: 'Supplier', kpi: 'Cost/MWh' },
            { idx: 5, name: 'DSR', kpi: 'Reliability-Adj Rev' },
        ];
        for (const { idx, name, kpi } of kpiChecks) {
            const found = await pages[idx].evaluate(label => document.body.textContent.includes(label), kpi);
            if (found) pass(`${name}: KPI "${kpi}" visible`);
            else fail(`${name}: KPI "${kpi}"`, new Error('Label missing'));
        }

        // 5. BESS SoC indicator
        try {
            const socVisible = await pages[7].evaluate(() =>
                document.body.textContent.includes('SoC') || document.body.textContent.includes('State of Charge')
            );
            if (socVisible) pass('BESS: SoC indicator visible');
            else fail('BESS SoC', new Error('SoC not found'));
        } catch (e) { fail('BESS SoC check', e); }

        // 6. Market Dictionary toggle
        try {
            const page = pages[2]; // any player
            await clickButton(page, 'Market Dictionary');
            const opened = await page.evaluate(() => document.body.textContent.includes('GridForge Terminology'));
            if (opened) pass('Market Dictionary opens');
            else fail('Market Dictionary open', new Error('Content not visible'));

            await clickButton(page, 'Close Dictionary');
            const closed = await page.evaluate(() => !document.body.textContent.includes('GridForge Terminology'));
            if (closed) pass('Market Dictionary closes');
            else fail('Market Dictionary close', new Error('Content still visible'));
        } catch (e) { fail('Market Dictionary test', e); }

        // 7. Tooltip hover (basic)
        try {
            const page = pages[2];
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
    }

    process.exit(results.failed.length > 0 ? 1 : 0);
})();