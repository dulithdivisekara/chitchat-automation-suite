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

    const startBtn = await page.$('.search-action-button');
    if (startBtn) await startBtn.click();

    await new Promise(r => setTimeout(r, 2000));

    const analysis = await page.evaluate(() => {
      // Find all message containers
      const containers = Array.from(document.querySelectorAll('[data-author], [data-message-id], [class*="message"], [class*="chat-item"]')).map(el => ({
        tag: el.tagName,
        className: el.className,
        attributes: Array.from(el.attributes).map(a => `${a.name}="${a.value}"`),
        text: el.innerText.trim().slice(0, 100)
      }));

      // Check current user name from profile
      const profileBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Open profile for'));
      const myName = profileBtn ? profileBtn.innerText.split('\n')[1]?.trim() : 'anti-american clang';

      return { myName, containers: containers.slice(0, 15) };
    });

    console.log('Analysis:', JSON.stringify(analysis, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
