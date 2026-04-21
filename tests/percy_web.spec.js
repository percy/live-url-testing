const percySnapshot = require('@percy/playwright');
const { test } = require('@playwright/test');

test.describe('Live URL Visual Testing', function () {
  test.setTimeout(120000);

  test.beforeEach(async function ({ page }) {
    page.setDefaultTimeout(90000);
  });

  test('wikipedia-help-testing', async function ({ page }) {
    await page.goto('https://en.wikipedia.org/wiki/Help:Testing', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-help-testing');
  });

  test('wikipedia-einstein', async function ({ page }) {
    await page.goto('https://en.wikipedia.org/wiki/Albert_Einstein', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-einstein');
  });

  test('wikipedia-arabic-article', async function ({ page }) {
    await page.goto('https://ar.wikipedia.org/wiki/%D9%85%D8%AD%D9%85%D8%AF', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-arabic-article');
  });

  test('wikipedia-japanese-article', async function ({ page }) {
    await page.goto('https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-japanese-article');
  });

  test('mdn-css-grid', async function ({ page }) {
    await page.goto('https://developer.mozilla.org/en-US/docs/Web/CSS/grid', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'mdn-css-grid');
  });

  test('w3c-css', async function ({ page }) {
    await page.goto('https://www.w3.org/Style/CSS/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'w3c-css');
  });

  test('httpbin-html', async function ({ page }) {
    await page.goto('https://httpbin.org/html', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'httpbin-html');
  });

  // Replaces amazon-home (10.72% diff on #127 — dynamic deals/personalized widgets).
  // github-home: stable marketing landing, dark/light mode, CSS grid/flex, octocat imagery.
  test('github-home', async function ({ page }) {
    await page.goto('https://github.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'github-home');
  });

  test('imdb-home', async function ({ page }) {
    await page.goto('https://www.imdb.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'imdb-home');
  });

  test('openai-home', async function ({ page }) {
    await page.goto('https://openai.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'openai-home');
  });

  test('stripe-home', async function ({ page }) {
    await page.goto('https://stripe.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'stripe-home');
  });

  test('vercel-home', async function ({ page }) {
    await page.goto('https://vercel.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'vercel-home');
  });

  test('linear-home', async function ({ page }) {
    await page.goto('https://linear.app/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'linear-home');
  });

  // Replaces figma-home (hung Percy renderer at 375px Safari on #128 — WebGL
  // canvas demos + login dialogs caused asset-load timeouts). Percy error:
  // "1 snapshots in this build took too long to render even after multiple retries".
  // nodejs-home: static marketing landing, minimal JS, stable across widths.
  test('nodejs-home', async function ({ page }) {
    await page.goto('https://nodejs.org/en', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'nodejs-home');
  });

  test('browserstack-home', async function ({ page }) {
    await page.goto('https://www.browserstack.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'browserstack-home');
  });

  test('browserstack-percy', async function ({ page }) {
    await page.goto('https://www.browserstack.com/percy', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'browserstack-percy');
  });

  test('browserstack-pricing', async function ({ page }) {
    await page.goto('https://www.browserstack.com/pricing', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'browserstack-pricing');
  });

  test('salesforce-home', async function ({ page }) {
    await page.goto('https://salesforce.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'salesforce-home');
  });

  // Replaces google-play (20.32% diff on #127 — featured apps shuffle, trending charts).
  // bootstrap-home: CSS framework showcase page; component grid, dark/light mode, stable.
  test('bootstrap-home', async function ({ page }) {
    await page.goto('https://getbootstrap.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'bootstrap-home');
  });

  // Replaces apple-home (12.20% / 6.48% diff on #127 — hero carousel/videos, promo banners).
  // shibhani-regions: static github.io demo page. User-vetted stable baseline.
  test('shibhani-regions', async function ({ page }) {
    await page.goto('https://shibhani-v.github.io/Shibhani-V/regions', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'shibhani-regions');
  });

  test('tesla-home', async function ({ page }) {
    await page.goto('https://www.tesla.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'tesla-home');
  });

  test('porsche-usa', async function ({ page }) {
    await page.goto('https://www.porsche.com/usa/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'porsche-usa');
  });

  test('spacex-home', async function ({ page }) {
    await page.goto('https://www.spacex.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'spacex-home');
  });

  test('nasa-home', async function ({ page }) {
    await page.goto('https://www.nasa.gov/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'nasa-home');
  });

  test('nasa-mars-facts', async function ({ page }) {
    await page.goto('https://mars.nasa.gov/all-about-mars/facts/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'nasa-mars-facts');
  });
});
