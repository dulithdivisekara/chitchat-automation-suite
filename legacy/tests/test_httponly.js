const puppeteer = require('puppeteer-core');
const cookies = require('../../cookies.json').map(c => {
  if (c.name === 'token') return { ...c, httpOnly: false };
  return c;
});

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
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Modal present?', text.includes('Let’s get started'));
  
  const startBtn = await page.$('.search-action-button');
  if (startBtn) {
    console.log('Clicking start...');
    await startBtn.click();
    await new Promise(r => setTimeout(r, 2000));
    const after = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n+/g, ' '));
    console.log('After click:', after);
  }
  await browser.close();
})();
