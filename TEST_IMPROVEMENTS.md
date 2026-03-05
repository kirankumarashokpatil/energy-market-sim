# Additional Test Improvements & Recommendations

## Beyond Button Timing Fixes

While the main issue (async React state updates) has been addressed, there are additional improvements that can make tests more robust and maintainable.

## 1. Form Input Validation Utility

**Current approach**: Manual input by index
```javascript
await fillNumber(page, 0, 60);  // Which input is this?
await fillNumber(page, 1, 70);  // Price? Volume? Power?
```

**Recommended approach**: Target by label/placeholder
```javascript
async function fillFormField(page, label, value) {
    const input = await page.evaluate(labelText => {
        return Array.from(document.querySelectorAll('input, label'))
            .find(el => el.textContent?.includes(labelText))
            ?.closest('div')
            ?.querySelector('input');
    }, label);
    
    if (!input) throw new Error(`Could not find field labeled "${label}"`);
    
    await page.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, input, value.toString());
    
    await sleep(100);
}

// Usage:
await fillFormField(page, 'Power (MW)', 60);
await fillFormField(page, 'Price (£)', 70);
```

**Benefits**:
- Self-documenting code
- Resistant to input reordering
- Easier debugging (labels are visible)

## 2. Button-Centric Testing

**Current approach**: Assume buttons will enable
**Recommended approach**: Verify button state before interaction

```javascript
async function isButtonEnabled(page, textFragment) {
    return page.evaluate(t => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes(t));
        return btn && !btn.disabled;
    }, textFragment);
}

async function clickEnabledButton(page, textFragment, timeout = 5000) {
    await waitForButtonEnabled(page, textFragment, timeout);
    await clickButton(page, textFragment);
}

// Usage:
if (await isButtonEnabled(page, 'SUBMIT')) {
    console.log('✓ Submit button is enabled, proceeding');
    await clickEnabledButton(page, 'SUBMIT');
}
```

## 3. Form Submission Helper

Combine filling multiple inputs + waiting for button:

```javascript
async function submitForm(page, fields, submitButtonText) {
    // Fill all fields
    for (const [label, value] of Object.entries(fields)) {
        await fillFormField(page, label, value);
    }
    
    // Wait for button to be enabled
    await waitForButtonEnabled(page, submitButtonText);
    
    // Click to submit
    await clickButton(page, submitButtonText);
    
    // Optionally wait for form to clear/change
    await sleep(500);
}

// Usage:
await submitForm(page, {
    'Power (MW)': 60,
    'Price (£)': 70
}, 'SUBMIT');
```

## 4. Phase Verification Before Actions

**Problem**: Tests don't verify phase before attempting actions
**Solution**: Add phase checks

```javascript
async function getCurrentPhase(page) {
    return page.evaluate(() => {
        const text = document.body.textContent;
        if (text.includes('DAY-AHEAD')) return 'DA';
        if (text.includes('INTRADAY')) return 'ID';
        if (text.includes('BALANCING')) return 'BM';
        if (text.includes('SETTLED')) return 'SETTLED';
        return null;
    });
}

async function submitBMBid(page, mw, price) {
    const phase = await getCurrentPhase(page);
    if (phase !== 'BM') {
        throw new Error(`Expected BM phase, but got ${phase}`);
    }
    
    await fillFormField(page, 'Power', mw);
    await fillFormField(page, 'Price', price);
    await waitForButtonEnabled(page, 'SUBMIT');
    await clickButton(page, 'SUBMIT');
}
```

## 5. Cross-Player Synchronization Checks

**Problem**: Tests don't verify players stay in sync
**Solution**: Add periodic sync checks

```javascript
async function verifySyncAcrossPlayers(pages, expectPhase, expectSP) {
    const results = await Promise.all(pages.map(async page => {
        const phase = await getCurrentPhase(page);
        const sp = await getCurrentSP(page);
        return { phase, sp };
    }));
    
    const allSameSP = results.every(r => r.sp === results[0].sp);
    const allSamePhase = results.every(r => r.phase === results[0].phase);
    
    if (!allSameSP) {
        throw new Error(`SP mismatch: ${results.map(r => r.sp).join(', ')}`);
    }
    
    if (!allSamePhase) {
        throw new Error(`Phase mismatch: ${results.map(r => r.phase).join(', ')}`);
    }
    
    if (expectPhase && results[0].phase !== expectPhase) {
        throw new Error(`Expected phase ${expectPhase}, got ${results[0].phase}`);
    }
    
    if (expectSP && results[0].sp !== expectSP) {
        throw new Error(`Expected SP ${expectSP}, got ${results[0].sp}`);
    }
    
    return true;
}

// Usage in test:
await verifySyncAcrossPlayers(pages, 'BM', null);  // Verify all in BM phase
```

## 6. Retry Logic for Flaky Operations

```javascript
async function retryOperation(operation, maxAttempts = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
            
            if (attempt < maxAttempts) {
                await sleep(delay);
            }
        }
    }
    
    throw new Error(`Operation failed after ${maxAttempts} attempts: ${lastError.message}`);
}

// Usage:
await retryOperation(() => clickButton(page, 'SUBMIT'), 3, 500);
```

## 7. Test Reporting Enhancements

```javascript
const testResults = {
    joinPhase: { passed: 0, failed: 0, duration: 0 },
    daPhase: { passed: 0, failed: 0, duration: 0 },
    idPhase: { passed: 0, failed: 0, duration: 0 },
    bmPhase: { passed: 0, failed: 0, duration: 0 },
    settlement: { passed: 0, failed: 0, duration: 0 }
};

async function trackPhaseExecution(name, fn) {
    const start = Date.now();
    try {
        await fn();
        testResults[name].passed++;
    } catch (error) {
        testResults[name].failed++;
        throw error;
    } finally {
        testResults[name].duration += Date.now() - start;
    }
}

// Usage:
await trackPhaseExecution('bmPhase', async () => {
    await nesoAdvanceToPhase(pages[0], 'BALANCING');
    await genSubmitBM(pages[2]);
    // ... more submissions
});

// Generate report
console.table(testResults);
```

## 8. Screenshot Capture on Failure

```javascript
async function captureScreenshotOnError(page, testName, error) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshots/failure-${testName}-${timestamp}.png`;
    
    try {
        await page.screenshot({ path: filename, fullPage: true });
        console.error(`📸 Screenshot saved: ${filename}`);
    } catch (screenshotError) {
        console.error(`Failed to capture screenshot: ${screenshotError.message}`);
    }
    
    throw error;
}

// Usage:
try {
    await genSubmitBM(pages[2]);
} catch (error) {
    await captureScreenshotOnError(pages[2], 'genSubmitBM', error);
}
```

## 9. Suggested Test Structure Refactor

Instead of one file with all tests, consider:

```
test/
├── e2e/
│   ├── helpers/
│   │   ├── player.js          # Player-specific helpers
│   │   ├── form.js            # Form filling utilities
│   │   ├── phase.js           # Phase management
│   │   └── sync.js            # Synchronization checks
│   ├── fixtures/
│   │   ├── test-data.js       # Input values, expectations
│   │   └── configs.js         # Role configs, URLs
│   └── specs/
│       ├── 01-setup.test.js   # Join flow
│       ├── 02-da-phase.test.js
│       ├── 03-id-phase.test.js
│       ├── 04-bm-phase.test.js
│       └── 05-settlement.test.js
```

## 10. Performance Optimization

**Current**: Sequential operations
```javascript
await genSubmitBM(pages[2]);
await dsrSubmitBM(pages[5]);
await icSubmitBM(pages[6]);
await bessSubmitBM(pages[7]);
// Total: ~2-3 seconds per phase (sequential)
```

**Recommended**: Parallel where possible
```javascript
await Promise.all([
    genSubmitBM(pages[2]),
    dsrSubmitBM(pages[5]),
    icSubmitBM(pages[6]),
    bessSubmitBM(pages[7])
]);
// Total: ~0.5-1 second per phase (parallel)
```

## Implementation Priority

1. **High Priority** (do first):
   - Form submission helper
   - Phase verification
   - Cross-player sync checks

2. **Medium Priority** (improves stability):
   - Retry logic
   - Screenshot on failure
   - Button-centric testing

3. **Nice to Have** (improves maintainability):
   - Form field by label
   - Test structure refactor
   - Performance optimization
   - Enhanced reporting

## Estimated Effort

- **High Priority**: 2-3 hours
- **Medium Priority**: 3-4 hours total
- **Nice to Have**: 4-6 hours total

**Cumulative benefit**: Read-only tests become maintainable test suite that can be updated by non-Puppeteer experts.
