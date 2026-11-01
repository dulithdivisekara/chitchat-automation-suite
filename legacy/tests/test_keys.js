const puppeteer = require('puppeteer-core');

const COOKIES = [
  {
    name: '__Secure-text-session',
    value: 'hpwva5Ba0UyLQOqJD34zAlXv2nBbY8VV.3279J9v6Al0pFa%2FJw300PyOeDU7KzgJp006giM0aZcQ%3D',
    domain: '.chitchat.gg',
    path: '/',
    secure: true,
    httpOnly: true,
  },
  {
    name: 'token',
    value: 'SAMPLE_TOKEN_REPLACED_FOR_SECURITY',
    domain: '.chitchat.gg',
    path: '/',
    secure: true,
    httpOnly: false,
  },
  {
    name: 'cf_clearance',
    value: 'CoBCpxacabYoi0hvMXUvOreceVVQ_fgQZOqDrsOANWOPhw4LVTLwQ7r_stQLWwfRNJS65yrSsjV7YjiDc7hI31uPkVuKPDQ08152IlZRhZSfvahmIsdFaVEPuwvvOqN4NGXxG-mW7qe_zetHvBDSXXk_k6n4CphlK8wDU2qlTfBCduxsSYDl_hAROFBFMwD94rPWojmlK8ndEl7hJvyeaBfBrSUPrwVPkv8gZDvxXTDYfvjivMkM1-Lxr0yGCYHj1-mUZ9yMskivUloYBbzBX06B3S9QNShY9x6nROtCR7OyjGXY50B2OeA1Hn948OgMAHB7sBt8MIjw',
    domain: '.chitchat.gg',
    path: '/',
    secure: true,
    httpOnly: true,
  }
];

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setCookie(...COOKIES);
    await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Start chat if on lobby
    const startBtn = await page.$('.search-action-button');
    if (startBtn) await startBtn.click();
    await new Promise(r => setTimeout(r, 3000));

    console.log('Testing Escape key to skip...');
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));
    let cycleText = await page.evaluate(() => {
      const btn = document.querySelector('.t-match-cycle-button');
      return btn ? btn.innerText : null;
    });
    console.log('After 1st Escape, cycle button text:', cycleText);

    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    cycleText = await page.evaluate(() => {
      const btn = document.querySelector('.t-match-cycle-button');
      return btn ? btn.innerText : null;
    });
    console.log('After 2nd Escape, cycle button text:', cycleText);

    // Also check quick skip button click
    const quickSkip = await page.$('button[aria-label="Quick skip"]');
    if (quickSkip) {
      console.log('Quick skip exists and is clickable');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
