'use strict';
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { chromium, devices } = require('playwright');

const port = Number(process.env.PINK_TEST_PORT || 4173);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['tests/static-server.cjs'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PINK_TEST_PORT: String(port) }
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Pink test server timeout')), 8000);
    server.stdout.on('data', chunk => {
      if (String(chunk).includes('Pink test server')) {
        clearTimeout(timer); resolve();
      }
    });
    server.once('exit', code => {
      clearTimeout(timer);
      if (code !== null && code !== 0) reject(new Error(`Pink test server exited ${code}`));
    });
  });
}

async function smoke(browser, name, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.PinkCore && window.PinkAvatar3D && window.PinkPerformance), null, { timeout: 12000 });
  await page.waitForFunction(() => Boolean(window.PinkFoundation), null, { timeout: 12000 });

  const title = await page.title();
  assert.match(title, /Pink LPS Studio/i, `${name}: title mismatch`);
  const stage = page.locator('#pinkStage');
  assert.strictEqual(await stage.count(), 1, `${name}: Pink stage missing`);
  assert.ok(await stage.isVisible(), `${name}: Pink stage not visible`);

  const foundation = await page.evaluate(() => window.PinkFoundation.health());
  assert.strictEqual(foundation.ok, true, `${name}: foundation health degraded: ${JSON.stringify(foundation)}`);
  const avatar = await page.evaluate(() => window.PinkAvatar3D.snapshot());
  assert.ok(avatar && avatar.state, `${name}: avatar snapshot unavailable`);
  const performance = await page.evaluate(() => window.PinkPerformance.snapshot());
  assert.ok(performance && performance.tier, `${name}: performance profile unavailable`);

  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
  assert.strictEqual(bodyWidth, true, `${name}: horizontal overflow detected`);

  const fatal = pageErrors.filter(message => !/ResizeObserver loop/i.test(message));
  assert.deepStrictEqual(fatal, [], `${name}: page errors: ${fatal.join(' | ')}`);
  console.log(`Browser smoke ${name}: OK (${performance.tier})`);
  await context.close();
}

(async () => {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await smoke(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
    await smoke(browser, 'mobile', { ...devices['iPhone 14'] });
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  server.kill('SIGTERM');
  console.error(error);
  process.exit(1);
});
