const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const GOOGLE_COOKIES = [
  // Insert Google session cookies here
];

async function main() {
  console.log('[*] Launching browser to sign in to Chitchat with Google account...');

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

  // Set Google cookies
  console.log('[*] Setting Google session cookies...');
  await page.setCookie(...GOOGLE_COOKIES);

  // Navigate to accounts.google.com to verify login
  console.log('[*] Verifying Google session...');
  await page.goto('https://myaccount.google.com/', { waitUntil: 'networkidle2' });
  console.log('Google page title:', await page.title());

  // Navigate to Chitchat
  console.log('[*] Navigating to Chitchat...');
  await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Check if already signed in or click Start / Login
  const profile = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Open profile for'));
    return btn ? btn.innerText : null;
  });
  console.log('Chitchat profile:', profile);

  // Keep open to let Google OAuth flow complete if needed
  console.log('[*] Waiting for Chitchat token...');
  for (let i = 0; i < 30; i++) {
    const cookies = await page.cookies('https://app.chitchat.gg', 'https://api.chitchat.gg', 'https://chitchat.gg');
    const token = cookies.find(c => c.name === 'token');
    if (token) {
      console.log('[+] Chitchat token found!', token.value.slice(0, 40) + '...');
      const relevant = cookies.filter(c => ['token', '__Secure-text-session', 'cf_clearance'].includes(c.name));
      fs.writeFileSync('./cookies.json', JSON.stringify(relevant, null, 2));
      console.log('[+] Saved to cookies.json!');
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();
}

main().catch(console.error);
