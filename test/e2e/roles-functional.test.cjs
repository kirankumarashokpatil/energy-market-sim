/**
 * roles-functional.test.cjs
 *
 * Gridforge – Role Functional UI Test
 * -----------------------------------
 * For each specialised role (Elexon, Trader, Interconnector, DSR, BESS):
 *  - Joins the game (single player per run, one after another).
 *  - Selects any required asset.
 *  - Verifies core, role‑specific UI elements are visible:
 *      • Elexon: "Imbalance Calculation Engine"
 *      • Trader: "TRADING DESK ANALYSIS"
 *      • Interconnector: "Price Coupling (GB vs"
 *      • DSR: "Live Operational State"
 *      • BESS: "STATE OF CHARGE (SoC)"
 *
 * Run with:
 *   node test/e2e/roles-functional.test.cjs
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const BASE_URL = process.env.GRIDFORGE_URL || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS !== 'false';

const ROLES = [
  {
    id: 'ELEXON',
    name: 'Elexon',
    roleLabel: 'Elexon',
    needsAsset: false,
    uiSnippet: 'Imbalance Calculation Engine'
  },
  {
    id: 'TRADER',
    name: 'TraderJoe',
    roleLabel: 'Trader',
    needsAsset: false,
    uiSnippet: 'TRADING DESK ANALYSIS'
  },
  // Interconnector removed – flows simulated automatically by engine
  {
    id: 'DSR',
    name: 'FlexLoad',
    roleLabel: 'Demand Controller',
    needsAsset: true,
    assetType: 'Demand Response',
    uiSnippet: 'Live Operational State'
  },
  {
    id: 'BESS',
    name: 'BatteryOp',
    roleLabel: 'Battery Storage',
    needsAsset: true,
    assetType: 'Small BESS',
    uiSnippet: 'STATE OF CHARGE (SoC)',
    // verify additional system metrics rendered on BESS screen
    extraCheck: 'SYS DMD'
  }
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(page, predicate, timeout = 30000, arg) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await page.evaluate(predicate, arg);
      if (result) return result;
    } catch {
      // ignore transient errors while loading
    }
    await sleep(500);
  }
  const snippet = await page
    .evaluate(() => document.body.textContent.slice(0, 300))
    .catch(() => '');
  throw new Error(`waitFor timed out – body snippet: "${snippet}"`);
}

async function clickButton(page, textFragment, timeout = 20000) {
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
    (ph) =>
      Array.from(document.querySelectorAll('input')).find((i) =>
        i.placeholder?.includes(ph)
      ),
    { timeout: 20000 },
    placeholder
  );
  await input.click({ clickCount: 3 });
  await input.type(value);
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

async function joinSingleRole(roleCfg) {
  const ROOM_CODE = 'FUNC' + Date.now().toString().slice(-6);
  const { name, roleLabel, needsAsset, assetType, uiSnippet, extraCheck } = roleCfg;

  console.log(
    `\n══════════════════════════════════════════════════════════`
  );
  console.log(
    `  Role Functional Test – ${roleLabel}  (Room ${ROOM_CODE})`
  );
  console.log(
    `══════════════════════════════════════════════════════════`
  );

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`[${name}] Navigating to app…`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    console.log(`[${name}] Waiting for network ready…`);
    await waitFor(
      page,
      () =>
        document.body.textContent.includes('Network Connected') ||
        document.body.textContent.includes('Join Session'),
      30000
    );

    console.log(`[${name}] Filling name and room…`);
    await typeInto(page, 'e.g. Alice', name);

    // Ensure room code input is clear, then type room
    await page.evaluate(() => {
      const el = document.querySelector('input[placeholder="e.g. ALPHA"]');
      if (el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await typeInto(page, 'e.g. ALPHA', ROOM_CODE);

    console.log(`[${name}] Joining waiting room…`);
    await clickButton(page, 'JOIN WAITING ROOM');

    console.log(`[${name}] Waiting for role cards…`);
    await waitFor(
      page,
      () =>
        Array.from(document.querySelectorAll('button')).some((b) =>
          b.textContent.includes('Generator')
        ),
      30000
    );

    console.log(`[${name}] Selecting role card: ${roleLabel}…`);
    await page.evaluate((label) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes(label));
      if (btn) btn.click();
    }, roleLabel);
    await sleep(800);

    // Proceed (JOIN GAME / SELECT ASSET / START GAME)
    console.log(`[${name}] Proceeding into game or asset screen…`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const asset = btns.find((b) => b.textContent.includes('SELECT ASSET'));
      const join = btns.find((b) => b.textContent.includes('JOIN GAME'));
      const start = btns.find((b) => b.textContent.includes('START GAME'));
      if (asset) asset.click();
      else if (join) join.click();
      else if (start) start.click();
    });

    if (needsAsset) {
      console.log(`[${name}] Selecting asset card…`);
      await waitFor(
        page,
        () =>
          document.body.textContent.includes(
            "choose the asset you'll operate"
          ),
        30000
      );
      await page.evaluate((label) => {
        const cards = Array.from(
          document.querySelectorAll('[style*="cursor: pointer"]')
        );
        const card = cards.find((c) => c.textContent.includes(label));
        if (card) card.click();
      }, assetType);
      await sleep(1000);
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find((b) =>
          b.textContent.includes('CONFIRM & JOIN')
        );
        if (btn) btn.click();
      });
    }

    console.log(`[${name}] Waiting for main game UI (SP indicator)…`);
    await waitFor(
      page,
      () => document.body.textContent.includes('/48'),
      60000
    );
    console.log(`[${name}] ✓ Game UI loaded`);

    // Give the role UI a moment to render its inner panels
    await sleep(1500);

    console.log(`[${name}] Verifying role‑specific UI snippet…`);
    await waitFor(
      page,
      (snippet) => document.body.textContent.includes(snippet),
      15000,
      uiSnippet
    );
    console.log(
      `[${name}] ✓ Found role UI text: "${uiSnippet}"`
    );
    if (extraCheck) {
      console.log(`[${name}] Verifying additional snippet "${extraCheck}"…`);
      await waitFor(
        page,
        (snippet) => document.body.textContent.includes(snippet),
        15000,
        extraCheck
      );
      console.log(`[${name}] ✓ Extra UI text present`);
    }
  } finally {
    await browser.close().catch(() => { });
  }
}

(async () => {
  console.log(
    '══════════════════════════════════════════════════════════'
  );
  console.log('  GRIDFORGE – Roles Functional UI Test');
  console.log(
    `  Server: ${BASE_URL} (HEADLESS=${HEADLESS ? 'true' : 'false'})`
  );
  console.log(
    '══════════════════════════════════════════════════════════\n'
  );

  let gunRelayProcess = null;

  try {
    gunRelayProcess = await startGunRelay();

    for (const cfg of ROLES) {
      await joinSingleRole(cfg);
    }

    console.log(
      '\nAll specialised roles rendered their core UI panels successfully.'
    );
    process.exit(0);
  } catch (err) {
    console.error(
      '\nRole functional test failed:',
      err?.message || err
    );
    process.exit(1);
  } finally {
    if (gunRelayProcess) {
      console.log('\n  [Cleanup] Shutting down Gun relay server...');
      gunRelayProcess.kill('SIGKILL');
    }
  }
})();

