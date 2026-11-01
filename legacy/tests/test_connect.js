const puppeteer = require('puppeteer-core');
const path = require('path');

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
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false, // Run headful so we see how it behaves or Cloudflare doesn't trigger headless check
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
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    
    await page.setCookie(...COOKIES);

    console.log('Navigating to https://app.chitchat.gg/text ...');
    await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('Page title:', await page.title());
    console.log('Page URL:', page.url());

    // Wait 5 seconds to let UI hydrate
    await new Promise(r => setTimeout(r, 5000));

    const html = await page.content();
    console.log('HTML snippet:', html.slice(0, 500));
    
    // Check elements
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a, input, textarea')).map(el => ({
        tag: el.tagName,
        text: el.innerText || el.placeholder || el.value || el.getAttribute('aria-label'),
        className: el.className
      }));
    });
    console.log('Interactive elements found:', JSON.stringify(buttons, null, 2));

    await page.screenshot({ path: './test_screenshot.png' });
    console.log('Screenshot saved to test_screenshot.png');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
