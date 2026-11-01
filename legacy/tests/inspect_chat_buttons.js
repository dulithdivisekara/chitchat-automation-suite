const puppeteer = require('puppeteer-core');
const fs = require('fs');
const RAW_COOKIES = JSON.parse(fs.readFileSync('./cookies.json', 'utf-8'));
const COOKIES = RAW_COOKIES.map(c => c.name === 'token' ? { ...c, httpOnly: false } : c);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation']
  });
  const page = await browser.newPage();
  await page.setCookie(...COOKIES);
  await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
  
  const startBtn = await page.$('.search-action-button');
  if (startBtn) await startBtn.click();
  await new Promise(r => setTimeout(r, 3000));
  
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim().replace(/\n+/g, ' '),
      aria: b.getAttribute('aria-label'),
      className: b.className
    })).filter(b => b.text || b.aria);
  });
  console.log('Active buttons during chat:', JSON.stringify(buttons, null, 2));
  
  // Clean disconnect
  const cycle = await page.$('.t-match-cycle-button') || await page.$('button[aria-label="Quick skip"]');
  if (cycle) await cycle.click().catch(() => {});
  await browser.close();
})();
