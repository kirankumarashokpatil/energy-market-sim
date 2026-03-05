/**
 * roles-smoke.test.cjs
 *
 * Gridforge – Role Smoke Test
 * ---------------------------
 * Lightweight Puppeteer script that:
 *  - Reuses the same server and waiting-room flow as the full multiplayer test.
 *  - Spawns one browser per role: Elexon, Trader, Interconnector, DSR, BESS.
 *  - Joins the same room, selects the role and (where needed) an asset.
 *  - Verifies that each role reaches its main game UI (SP indicator present).
 *
 * Run with:
 *   node test/e2e/roles-smoke.test.cjs
 */

const puppeteer = require('puppeteer');

const BASE_URL = process.env.GRIDFORGE_URL || 'http://localhost:5174';
const ROOM_CODE = 'ROLE' + Date.now().toString().slice(-6);
const HEADLESS = process.env.HEADLESS !== 'false';

const ROLES = [
  { name: 'Elexon', roleLabel: 'Elexon', needsAsset: false },
  { name: 'TraderJoe', roleLabel: 'Trader', needsAsset: false },
  { name: 'Interco', roleLabel: 'Interconnector', needsAsset: true, assetType: 'IFA' },
  { name: 'FlexLoad', roleLabel: 'Demand Controller', needsAsset: true, assetType: 'Small BESS' },
  { name: 'BatteryOp', roleLabel: 'Battery Storage', needsAsset: true, assetType: 'Grid BESS' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(page, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await page.evaluate(predicate);
      if (result) return result;
    } catch { /* page may still be loading */ }
    await sleep(500);
  }
  const snippet = await page.evaluate(() => document.body.textContent.slice(0, 300)).catch(() => '');
  throw new Error(`waitFor timed out – body snippet: "${snippet}"`);
}

async function clickButton(page, textFragment, timeout = 10000) {
  await page.waitForFunction(
    t => {
      const btn = Array.from(document.querySelectorAll('button:not([disabled])')).find(b =>
        b.textContent.toUpperCase().includes(t.toUpperCase())
      );
      if (!btn) return false;
      btn.click();
      return true;
    },
    { timeout },
    textFragment
  );
  await sleep(200);
}

async function typeInto(page, placeholder, value) {
  const input = await page.waitForFunction(
    ph => Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.includes(ph)),
    { timeout: 20000 },
    placeholder
  );
  await input.click({ clickCount: 3 });
  await input.type(value);
}

async function joinRole(page, cfg) {
  const { name, roleLabel, needsAsset, assetType } = cfg;
  console.log(`\n[${name}] Joining as ${roleLabel}…`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await waitFor(page, () => document.body.textContent.includes('Network Connected'), 30000);

  // Name
  await typeInto(page, 'e.g. Alice', name);

  // Room code
  await page.evaluate(() => {
    const el = document.querySelector('input[placeholder="e.g. ALPHA"]');
    if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await typeInto(page, 'e.g. ALPHA', ROOM_CODE);

  await clickButton(page, 'JOIN WAITING ROOM');

  // Wait for role buttons and select our role card
  await waitFor(page, () => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Generator')), 30000);
  await page.evaluate(label => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes(label));
    if (btn) btn.click();
  }, roleLabel);
  await sleep(800);

  // Proceed into game or asset selection
  const proceedKind = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const asset = btns.find(b => b.textContent.includes('SELECT ASSET'));
    const join = btns.find(b => b.textContent.includes('JOIN GAME'));
    const start = btns.find(b => b.textContent.includes('START GAME'));
    if (asset) { asset.click(); return 'ASSET'; }
    if (join) { join.click(); return 'JOIN'; }
    if (start) { start.click(); return 'START'; }
    return null;
  });

  if (needsAsset && proceedKind === 'ASSET') {
    console.log(`[${name}] Selecting asset…`);
    await waitFor(page, () => document.body.textContent.includes("choose the asset you'll operate"), 30000);
    await page.evaluate(aType => {
      const cards = Array.from(document.querySelectorAll('[style*="cursor: pointer"]'));
      const card = cards.find(c => c.textContent.includes(aType));
      if (card) card.click();
    }, assetType || '');
    await sleep(1000);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.includes('CONFIRM & JOIN'));
      if (btn) btn.click();
    });
  }

  // Wait for main game UI SP indicator
  await waitFor(page, () => document.body.textContent.includes('/48'), 60000);
  console.log(`[${name}] ✓ Game UI loaded`);
}

(async () => {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  GRIDFORGE – Role Smoke Test (Elexon, Trader, IC, DSR, BESS)');
  console.log(`  Room: ${ROOM_CODE}  |  Server: ${BASE_URL}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const browsers = [];

  try {
    for (const cfg of ROLES) {
      const browser = await puppeteer.launch({
        headless: HEADLESS ? 'new' : false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      browsers.push(browser);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      await joinRole(page, cfg);
    }

    console.log('\nAll role UIs reached successfully.');
    process.exit(0);
  } catch (err) {
    console.error('\nRole smoke test failed:', err?.message || err);
    process.exit(1);
  } finally {
    for (const b of browsers) await b.close().catch(() => { });
  }
})();

