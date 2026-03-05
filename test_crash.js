import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        page.on('pageerror', err => {
            console.log('PAGE ERROR STR:', err.toString());
        });
        page.on('console', msg => {
            if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
        });

        console.log("Navigating...");
        await page.goto('http://localhost:5173');
        await page.waitForTimeout(1000);

        console.log("Clicking Interconnector...");
        const roles = await page.$$('div');
        for (const r of roles) {
            const text = await page.evaluate(el => el.textContent, r);
            if (text.includes('Interconnector') && text.includes('Cross-border')) {
                await r.click();
                break;
            }
        }
        await page.waitForTimeout(500);

        console.log("Entering name and room...");
        const inputs = await page.$$('input');
        await inputs[0].type('Puppeteer');
        await inputs[1].type('PUP');

        console.log("Clicking PICK YOUR ASSET...");
        const btns = await page.$$('button');
        for (const b of btns) {
            const text = await page.evaluate(el => el.textContent, b);
            if (text.includes('PICK YOUR ASSET')) {
                await b.click();
                break;
            }
        }
        await page.waitForTimeout(1000);

        console.log("Clicking IFA2...");
        const assets = await page.$$('div');
        for (const a of assets) {
            const text = await page.evaluate(el => el.textContent, a);
            if (text.includes('IFA2 (France)') && text.includes('1000MW')) {
                await a.click();
                break;
            }
        }

        console.log("Waiting for dashboard crash...");
        await page.waitForTimeout(2000);
        await browser.close();
        console.log("Done");
    } catch (e) {
        console.error(e);
    }
})();
