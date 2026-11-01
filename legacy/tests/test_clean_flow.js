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

  console.log('Clicking start button ONCE...');
  const startBtn = await page.waitForSelector('.search-action-button');
  await startBtn.click();

  console.log('Waiting for stranger to connect...');
  let partner = '';
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const state = await page.evaluate(() => {
      const m = document.body.innerText.match(/You are now chatting with @([^\.\n]+)/);
      const t = document.querySelector('textarea[name="message"]');
      return {
        partner: m ? m[1].trim() : '',
        hasTextarea: !!t && !t.disabled
      };
    });

    if (state.hasTextarea && state.partner) {
      partner = state.partner;
      console.log(`Matched @${partner} at second ${i+1}!`);
      break;
    } else {
      process.stdout.write(`.`);
    }
  }

  if (partner) {
    console.log(`\nTyping "f or m?" to @${partner}...`);
    const textarea = await page.$('textarea[name="message"]');
    await textarea.click();
    await textarea.type('f or m?');
    await new Promise(r => setTimeout(r, 150));
    await page.keyboard.press('Enter');
    console.log('Sent "f or m?"!');

    console.log('Waiting 6s for response...');
    await new Promise(r => setTimeout(r, 6000));

    const msgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('li.select-text')).map(el => el.innerText);
    });
    console.log('Chat messages:', msgs);
  }

  await browser.close();
}

main().catch(console.error);
