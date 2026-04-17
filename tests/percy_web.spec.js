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

  test('amazon-home', async function ({ page }) {
    await page.goto('https://www.amazon.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'amazon-home');
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

  test('beta-openai', async function ({ page }) {
    await page.goto('https://beta.openai.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'beta-openai');
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

  test('microsoft-home', async function ({ page }) {
    await page.goto('https://www.microsoft.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'microsoft-home');
  });

  test('salesforce-home', async function ({ page }) {
    await page.goto('https://salesforce.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'salesforce-home');
  });

  test('imdb-home', async function ({ page }) {
    await page.goto('https://www.imdb.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'imdb-home');
  });

  test('gaana-home', async function ({ page }) {
    await page.goto('https://gaana.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'gaana-home');
  });

  test('soundcloud-home', async function ({ page }) {
    await page.goto('https://soundcloud.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'soundcloud-home');
  });

  test('spotify-home', async function ({ page }) {
    await page.goto('https://www.spotify.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'spotify-home');
  });

  test('spotify-playstore', async function ({ page }) {
    await page.goto('https://play.google.com/store/apps/details?id=com.spotify.music&hl=en_IN&gl=US', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'spotify-playstore');
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

  test('abc-xyz', async function ({ page }) {
    await page.goto('https://abc.xyz/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'abc-xyz');
  });

  test('tesla-home', async function ({ page }) {
    await page.goto('https://www.tesla.com/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'tesla-home');
  });

  test('tesla-no-redirect', async function ({ page }) {
    await page.goto('https://www.tesla.com/?redirect=no', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'tesla-no-redirect');
  });

  test('tesla-modelx', async function ({ page }) {
    await page.goto('https://www.tesla.com/modelx', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'tesla-modelx');
  });

  test('bmw-home', async function ({ page }) {
    await page.goto('https://www.bmw.com/en/index.html', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'bmw-home');
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

  test('forbes-gpt3-article', async function ({ page }) {
    await page.goto('https://www.forbes.com/sites/bernardmarr/2020/10/05/what-is-gpt-3-and-why-is-it-revolutionizing-artificial-intelligence/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'forbes-gpt3-article');
  });

  test('wikipedia-gpt3', async function ({ page }) {
    await page.goto('https://en.wikipedia.org/wiki/GPT-3', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'wikipedia-gpt3');
  });

  test('boringcompany-projects', async function ({ page }) {
    await page.goto('https://www.boringcompany.com/projects', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'boringcompany-projects');
  });

  test('apple-mac', async function ({ page }) {
    await page.goto('https://www.apple.com/mac/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'apple-mac');
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

  test('worldometers-covid', async function ({ page }) {
    await page.goto('https://www.worldometers.info/coronavirus/', { timeout: 90000 });
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'worldometers-covid');
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
