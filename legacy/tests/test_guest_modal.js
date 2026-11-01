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
  await startBtn.click();
  await new Promise(r => setTimeout(r, 1500));

  console.log('Checking modal buttons...');
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim(),
      aria: b.getAttribute('aria-label')
    })).filter(b => b.text || b.aria);
  });
  console.log('Buttons:', buttons);

  // If "Male" is an option or button
  const maleOption = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button, div, label, span')).find(e => e.innerText && e.innerText.trim() === 'Male');
    if (el) { el.click(); return true; }
    return false;
  });
  console.log('Clicked Male:', maleOption);
  await new Promise(r => setTimeout(r, 1000));

  const guestBtn = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button')).find(e => e.innerText && e.innerText.includes('Continue as guest'));
    if (el) { el.click(); return true; }
    return false;
  });
  console.log('Clicked Continue as guest:', guestBtn);
  await new Promise(r => setTimeout(r, 3000));

  const afterState = await page.evaluate(() => {
    return {
      snippet: document.body.innerText.slice(0, 300).replace(/\n+/g, ' '),
      hasTextarea: !!document.querySelector('textarea')
    };
  });
  console.log('After state:', afterState);

  await browser.close();
})();
