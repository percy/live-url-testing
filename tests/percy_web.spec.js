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

  test('amazon-home', async function ({ page }) {
    await page.goto('https://www.amazon.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'amazon-home');
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

  test('figma-home', async function ({ page }) {
    await page.goto('https://www.figma.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'figma-home');
  });

  test('browserstack-home', async function ({ page }) {
    await page.goto('https://www.browserstack.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'browserstack-home');
  });

  test('salesforce-home', async function ({ page }) {
    await page.goto('https://salesforce.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'salesforce-home');
  });

  test('google-play', async function ({ page }) {
    await page.goto('https://play.google.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'google-play');
  });

  test('apple-home', async function ({ page }) {
    await page.goto('https://www.apple.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'apple-home');
  });

  test('apple-mac', async function ({ page }) {
    await page.goto('https://www.apple.com/mac/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'apple-mac');
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

  test('audi-global', async function ({ page }) {
    await page.goto('https://www.audi.com/en.html', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'audi-global');
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
