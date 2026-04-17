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

  test('wikipedia-gpt3', async function ({ page }) {
    await page.goto('https://en.wikipedia.org/wiki/GPT-3', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-gpt3');
  });

  test('wikipedia-einstein', async function ({ page }) {
    await page.goto('https://en.wikipedia.org/wiki/Albert_Einstein', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-einstein');
  });

  test('wikipedia-arabic', async function ({ page }) {
    await page.goto('https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D8%B5%D9%81%D8%AD%D8%A9_%D8%A7%D9%84%D8%B1%D8%A6%D9%8A%D8%B3%D9%8A%D8%A9', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-arabic');
  });

  test('wikipedia-japanese', async function ({ page }) {
    await page.goto('https://ja.wikipedia.org/wiki/%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%9A%E3%83%BC%E3%82%B8', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-japanese');
  });

  test('mdn-home', async function ({ page }) {
    await page.goto('https://developer.mozilla.org/en-US/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'mdn-home');
  });

  test('hackernews-home', async function ({ page }) {
    await page.goto('https://news.ycombinator.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'hackernews-home');
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

  test('openai-projects', async function ({ page }) {
    await page.goto('https://openai.com/projects/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'openai-projects');
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

  test('gaana-home', async function ({ page }) {
    await page.goto('https://gaana.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'gaana-home');
  });

  test('spotify-home', async function ({ page }) {
    await page.goto('https://www.spotify.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'spotify-home');
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

  test('tesla-modelx', async function ({ page }) {
    await page.goto('https://www.tesla.com/modelx', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'tesla-modelx');
  });

  test('audi-india', async function ({ page }) {
    await page.goto('https://www.audi.in/in/web/en.html', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'audi-india');
  });

  test('audi-global', async function ({ page }) {
    await page.goto('https://www.audi.com/en.html', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'audi-global');
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

  test('blueorigin-home', async function ({ page }) {
    await page.goto('https://www.blueorigin.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'blueorigin-home');
  });

  test('boringcompany-projects', async function ({ page }) {
    await page.goto('https://www.boringcompany.com/projects', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'boringcompany-projects');
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

  test('worlds-longest-website', async function ({ page }) {
    await page.goto('http://www.worldslongestwebsite.com', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'worlds-longest-website');
  });

  test('worlds-highest-website', async function ({ page }) {
    await page.goto('https://worlds-highest-website.com', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'worlds-highest-website');
  });
});
