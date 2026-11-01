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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setCookie(...COOKIES);

    await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Checking current view...');
    // If not in chat yet, click Start
    const startBtn = await page.$('.search-action-button');
    if (startBtn) {
      console.log('Found start button, clicking...');
      await startBtn.click();
      await new Promise(r => setTimeout(r, 2000));
    }

    // Try typing in textarea
    console.log('Finding message textarea...');
    const textarea = await page.waitForSelector('textarea[placeholder*="message"]', { timeout: 10000 });
    console.log('Found textarea! Typing question...');
    await textarea.type('f or m?');
    await page.keyboard.press('Enter');

    console.log('Message sent! Waiting 5s to check messages...');
    await new Promise(r => setTimeout(r, 5000));

    const chatState = await page.evaluate(() => {
      // Find all message text nodes
      const elements = Array.from(document.querySelectorAll('.select-text, [class*="message-body"], [data-message-author]'));
      const messages = elements.map(e => e.innerText.trim()).filter(Boolean);
      const isDisconnected = document.body.innerText.includes('Stranger has disconnected') ||
                             document.body.innerText.includes('chat ended') ||
                             document.body.innerText.includes('Conversation ended');
      return { messages, isDisconnected };
    });
    console.log('Chat State:', chatState);

    console.log('Testing quick skip...');
    const quickSkipBtn = await page.$('button[aria-label="Quick skip"]') || await page.$('.t-match-cycle-button');
    if (quickSkipBtn) {
      console.log('Clicking quick skip...');
      await quickSkipBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      // If confirm needed, click again
      const confirmBtn = await page.$('.t-match-cycle-button');
      if (confirmBtn) {
        const text = await page.evaluate(el => el.innerText, confirmBtn);
        console.log('Cycle button text:', text);
        if (text.includes('CONFIRM') || text.includes('SKIP') || text.includes('START')) {
          await confirmBtn.click();
        }
      }
    }

    await new Promise(r => setTimeout(r, 3000));
    console.log('After skip, URL:', page.url());
    const afterSkipText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('After skip preview:', afterSkipText);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
