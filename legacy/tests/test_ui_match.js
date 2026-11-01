const puppeteer = require('puppeteer-core');
const cookies = require('../../cookies.json');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://app.chitchat.gg', { waitUntil: 'domcontentloaded' });
  await page.setCookie(...cookies);
  await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
  
  const startBtn = await page.$('.search-action-button');
  console.log('Clicking start button...');
  await startBtn.click();
  
  // Wait up to 10s for match
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      const partnerMatch = document.body.innerText.match(/chatting with @([^\.\n]+)/);
      return {
        hasTextarea: !!ta,
        partner: partnerMatch ? partnerMatch[1] : null,
        textSnippet: document.body.innerText.slice(0, 150).replace(/\n+/g, ' ')
      };
    });
    console.log(`[T+${i}s]`, JSON.stringify(status));
    if (status.partner || status.hasTextarea) break;
  }
  
  // Clean disconnect
  const cycle = await page.$('.t-match-cycle-button') || await page.$('button[aria-label="Quick skip"]');
  if (cycle) await cycle.click().catch(() => {});
  await browser.close();
})();
