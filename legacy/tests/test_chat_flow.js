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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setCookie(...COOKIES);

    await page.goto('https://app.chitchat.gg/text', { waitUntil: 'load', timeout: 30000 });
    
    // Wait until document.body contains something
    console.log('Current URL after load:', page.url());
    
    for (let i = 0; i < 15; i++) {
      const text = await page.evaluate(() => document.body ? document.body.innerText : '');
      const btn = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('Start'));
        return b ? { text: b.innerText, className: b.className } : null;
      });
      console.log(`Second ${i+1}: Button:`, btn ? btn.text.replace(/\n/g, ' ') : 'None', 'URL:', page.url());
      if (btn) {
        console.log('Found Start button! Clicking...');
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('Start'));
          if (b) b.click();
        });
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('Waiting 6s after click...');
    await new Promise(r => setTimeout(r, 6000));
    console.log('URL now:', page.url());

    const status = await page.evaluate(() => {
      const allText = document.body.innerText;
      const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).map(e => ({
        tag: e.tagName,
        placeholder: e.placeholder,
        className: e.className
      }));
      const buttons = Array.from(document.querySelectorAll('button')).map(e => e.innerText.trim()).filter(Boolean);
      return { allText: allText.slice(0, 1000), inputs, buttons };
    });

    console.log('Status after start click:', status);
    await page.screenshot({ path: './after_start.png' });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
