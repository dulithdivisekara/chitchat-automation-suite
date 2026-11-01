const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

async function refreshGuestSession() {
  console.log('[*] Creating a fresh guest session on Chitchat...');
  
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--incognito']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

    await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // If "Start Text Chat" button is there, click it
    const startBtn = await page.$('.search-action-button');
    if (startBtn) {
      console.log('Clicking Start...');
      await startBtn.click();
      await new Promise(r => setTimeout(r, 1500));
    }

    // Look for Gender selection modal
    console.log('Selecting gender...');
    await page.evaluate(() => {
      // Find "Male" button
      const buttons = Array.from(document.querySelectorAll('button'));
      const maleBtn = buttons.find(b => b.innerText.trim() === 'Male');
      if (maleBtn) maleBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));

    // Look for "Continue as guest" button
    console.log('Clicking "Continue as guest"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const guestBtn = buttons.find(b => b.innerText.includes('Continue as guest'));
      if (guestBtn) guestBtn.click();
    });

    // Wait for session cookies to be set
    await new Promise(r => setTimeout(r, 5000));

    const cookies = await page.cookies();
    const relevantCookies = cookies.filter(c => 
      c.name === 'token' || c.name === '__Secure-text-session' || c.name === 'cf_clearance'
    );

    console.log('Relevant cookies acquired:', relevantCookies.map(c => c.name));

    if (relevantCookies.some(c => c.name === 'token')) {
      const formatted = relevantCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly
      }));

      fs.writeFileSync(path.join(__dirname, 'cookies.json'), JSON.stringify(formatted, null, 2));
      console.log('[+] Saved new fresh session to cookies.json!');
      return true;
    } else {
      console.log('[-] Could not get token, cookies received:', cookies.map(c => c.name));
      return false;
    }
  } catch (err) {
    console.error('Error during refresh:', err);
    return false;
  } finally {
    await browser.close();
  }
}

refreshGuestSession().then(ok => {
  if (ok) console.log('[✓] Session refreshed successfully!');
  else process.exit(1);
});
