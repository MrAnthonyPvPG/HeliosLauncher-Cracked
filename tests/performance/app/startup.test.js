const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');

test.describe('Performance', () => {
    test('should launch the application in a reasonable amount of time', async () => {
        const electronApp = await electron.launch({ args: ['.'] });
        await electronApp.addInitScript(() => {
            window.eval = () => {
                throw new Error('This is a test');
            };
        });
        const window = await electronApp.firstWindow();
        await window.waitForSelector('#main');
        const startupTime = await window.evaluate(() => window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart);
        console.log(`Startup time: ${startupTime}ms`);
        expect(startupTime).toBeLessThan(5000); // 5 seconds
        await electronApp.close();
    });
});
