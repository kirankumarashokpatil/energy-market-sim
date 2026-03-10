// Utility helpers for puppeteer tests (selectors by data-testid)

async function clickByTestId(page, id, timeout = 20000) {
    const selector = `[data-testid="${id}"]`;
    await page.waitForSelector(selector, { timeout });
    await page.click(selector);
    // allow React a moment to process
    await page.waitForTimeout(150);
}

async function typeByTestId(page, id, value, timeout = 20000) {
    const selector = `[data-testid="${id}"]`;
    await page.waitForSelector(selector, { timeout });
    await page.focus(selector);
    await page.evaluate((sel, val) => {
        const input = document.querySelector(sel);
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, selector, value.toString());
}

async function fillNumberByIndex(page, index, value) {
    // same as original fillNumber but exported
    const script = (idx, val) => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]:not([disabled])'));
        if (!inputs[idx]) return false;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(inputs[idx], val);
        inputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    };
    await page.waitForFunction(script, { timeout: 20000 }, index, value.toString());
}

module.exports = {
    clickByTestId,
    typeByTestId,
    fillNumberByIndex,
};
