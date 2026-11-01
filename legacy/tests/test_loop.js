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

async function skipStranger(page) {
  // If quick skip is present, click it
  const quickSkip = await page.$('button[aria-label="Quick skip"]');
  if (quickSkip) {
    await quickSkip.click().catch(() => {});
    await new Promise(r => setTimeout(r, 300));
  }
  // Click cycle button
  const cycleBtn = await page.$('.t-match-cycle-button');
  if (cycleBtn) {
    await cycleBtn.click().catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    // Click again if confirm state
    await cycleBtn.click().catch(() => {});
  }
  const startBtn = await page.$('.search-action-button');
  if (startBtn) {
    await startBtn.click().catch(() => {});
  }
}

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

    // Start
    const startBtn = await page.$('.search-action-button');
    if (startBtn) await startBtn.click();

    for (let round = 1; round <= 3; round++) {
      console.log(`\n--- Round ${round} ---`);
      // Wait for match or textarea
      try {
        await page.waitForSelector('textarea[placeholder*="message"]', { timeout: 8000 });
        console.log(`Matched stranger #${round}!`);
      } catch (e) {
        console.log(`Waiting for match timed out, trying skip/start...`);
        await skipStranger(page);
        continue;
      }

      // Send greeting
      const textarea = await page.$('textarea[placeholder*="message"]');
      if (textarea) {
        await textarea.type('f or m?');
        await page.keyboard.press('Enter');
        console.log('Asked "f or m?"');
      }

      // Wait 4 seconds for response
      await new Promise(r => setTimeout(r, 4000));

      const texts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.select-text')).map(e => e.innerText.trim());
      });
      console.log('Messages in chat:', texts);

      console.log('Skipping to next stranger...');
      await skipStranger(page);
      await new Promise(r => setTimeout(r, 2000));
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
