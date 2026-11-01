const puppeteer = require('puppeteer-core');
const COOKIES = require('./cookies.json');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
  await page.setCookie(...COOKIES);

  await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // If on lobby, click Start
  const startBtn = await page.$('.search-action-button');
  if (startBtn) {
    console.log('Clicking start button...');
    await startBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Waiting for textarea[name="message"]...');
  const textarea = await page.waitForSelector('textarea[name="message"]', { timeout: 10000 });
  console.log('Textarea found! Typing "f or m?"...');
  await textarea.click();
  await textarea.type('f or m?');
  await new Promise(r => setTimeout(r, 300));
  await page.keyboard.press('Enter');
  console.log('Pressed Enter!');

  // Check if message appears in the DOM
  await new Promise(r => setTimeout(r, 2000));
  const messages = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('li.select-text')).map(el => el.innerText);
  });
  console.log('Messages on page:', messages);

  await browser.close();
}

main().catch(console.error);
