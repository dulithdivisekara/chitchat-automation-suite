const puppeteer = require('puppeteer-core');
const cookies = require('../../cookies.json');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setCookie(...cookies);
  await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Clicking start button...');
  const startBtn = await page.$('.search-action-button');
  if (startBtn) {
    await startBtn.click();
    console.log('Clicked start!');
  } else {
    console.log('Start button not found!');
  }

  // Wait 4 seconds and check state
  await new Promise(r => setTimeout(r, 4000));
  const pageInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      textareas: Array.from(document.querySelectorAll('textarea')).map(t => ({
        name: t.name,
        placeholder: t.placeholder,
        disabled: t.disabled
      })),
      buttons: Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        aria: b.getAttribute('aria-label'),
        class: b.className
      })).filter(b => b.text || b.aria),
      snippet: document.body.innerText.slice(0, 400)
    };
  });
  console.log('Page info after start:');
  console.log(JSON.stringify(pageInfo, null, 2));

  // Cleanly disconnect
  const cycleBtn = await page.$('.t-match-cycle-button') || await page.$('button[aria-label="Quick skip"]');
  if (cycleBtn) await cycleBtn.click().catch(() => {});
  await browser.close();
})();
