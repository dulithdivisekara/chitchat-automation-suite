const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        CHITCHAT CLEAN SESSION GENERATOR & CAPTURE        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('[*] Opening a clean Chrome window on your screen...');
  console.log('[*] Please complete the quick "Continue as guest" or "Continue with Google" login in the window.');
  console.log('[*] As soon as you are logged in, this script will automatically capture your session!\n');

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

  await page.goto('https://app.chitchat.gg/text', { waitUntil: 'load' });

  // Poll cookies every 1s until a fresh token is found
  const initialToken = 'SAMPLE_TOKEN_REPLACED_FOR_SECURITY';

  while (true) {
    await new Promise(r => setTimeout(r, 1000));
    const cookies = await page.cookies();
    const tokenCookie = cookies.find(c => c.name === 'token');

    if (tokenCookie && tokenCookie.value !== initialToken) {
      console.log('[+] Fresh session token detected!');
      const relevant = cookies.filter(c => ['token', '__Secure-text-session', 'cf_clearance'].includes(c.name));
      
      const formatted = relevant.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly
      }));

      fs.writeFileSync(path.join(__dirname, 'cookies.json'), JSON.stringify(formatted, null, 2));
      console.log('[+] Saved new fresh session to cookies.json!');
      break;
    }
  }

  await browser.close();
  console.log('[✓] Ready for backend automation!');
}

main().catch(console.error);
