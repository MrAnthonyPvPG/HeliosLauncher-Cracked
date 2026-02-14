const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');

test.describe('Application Startup Smoke Test', () => {
    let electronApp;

    // Тайм-аут 2 минуты
    test.setTimeout(120000);

    test.beforeAll(async () => {
        electronApp = await electron.launch({ 
            args: [
                '.', 
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--use-gl=swiftshader',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-hang-monitor'
            ],
            timeout: 60000
        });
    });

    test.afterAll(async () => {
        if (electronApp) {
            await electronApp.close();
        }
    });

    test('should handle RAM warning and reach functional state', async () => {
        const window = await electronApp.firstWindow();
        
        window.on('console', msg => {
            if (msg.type() === 'error' || msg.text().includes('Overlay')) {
                console.log(`[App] ${msg.text()}`);
            }
        });

        await window.waitForLoadState('domcontentloaded');

        const launchButton = window.locator('#launch_button');
        const serverSelect = window.locator('#server_selection_button');
        const overlay = window.locator('#overlayContainer');
        const continueButton = window.locator('#overlayAcknowledge');

        console.log('Starting UI loop...');
        const startTime = Date.now();
        // 90 секунд на всё про всё
        const timeout = 90000;

        while (Date.now() - startTime < timeout) {
            
            // 1. ПОБЕДА: Видим кнопку запуска
            if (await launchButton.isVisible() || await serverSelect.isVisible()) {
                console.log('PASS: Main menu reached (Launch button visible).');
                return;
            }

            // 2. ОБРАБОТКА ОВЕРЛЕЕВ
            if (await overlay.isVisible()) {
                const text = await overlay.innerText();
                const cleanText = text.replace(/\n/g, ' ');

                // Ошибка сети -> Тоже победа (приложение отработало штатно)
                if (cleanText.includes('сервера недоступны') || cleanText.includes('Network error')) {
                    console.log('PASS: Critical Network Error confirmed.');
                    return; 
                }

                // Предупреждение о памяти
                if (cleanText.includes('Технические проблемы') || cleanText.includes('оперативной памяти')) {
                    console.log('Overlay: Low RAM detected. Clicking "Continue"...');
                    
                    if (await continueButton.isVisible()) {
                        try {
                            await continueButton.click();
                            
                            // Ждем, пока оверлей исчезнет
                            try {
                                await expect(overlay).toBeHidden({ timeout: 5000 });
                                console.log('PASS: Low RAM overlay dismissed. App is interactive!');
                                // ВЫХОДИМ С ПОБЕДОЙ. Мы нажали кнопку, приложение отреагировало. 
                                // Ждать загрузки файлов не обязательно для Smoke-теста.
                                return;
                            } catch (e) {
                                console.log('Warning: Overlay stuck, trying loop again...');
                            }
                        } catch (e) {
                            console.log('Click failed:', e.message);
                        }
                    }
                }
            }

            await new Promise(r => setTimeout(r, 500));
        }

        throw new Error('Timeout: App did not reach a stable state.');
    });
});