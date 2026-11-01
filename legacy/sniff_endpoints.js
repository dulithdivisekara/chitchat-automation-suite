const puppeteer = require('puppeteer-core');
const fs = require('fs');

const COOKIES = require('./cookies.json');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: { width: 1200, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const endpointsLog = [];

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();

    // Enable Network monitoring via Chrome DevTools Protocol
    await client.send('Network.enable');

    client.on('Network.webSocketCreated', ({ requestId, url }) => {
      console.log(`\n[WebSocket Created] URL: ${url}`);
      endpointsLog.push({ type: 'WS_CONNECT', url });
    });

    client.on('Network.webSocketFrameSent', ({ requestId, response }) => {
      const payload = response.payloadData;
      console.log(`[WS Sent]:`, payload.slice(0, 300));
      endpointsLog.push({ type: 'WS_SENT', payload: payload.slice(0, 500) });
    });

    client.on('Network.webSocketFrameReceived', ({ requestId, response }) => {
      const payload = response.payloadData;
      console.log(`[WS Recv]:`, payload.slice(0, 300));
      endpointsLog.push({ type: 'WS_RECV', payload: payload.slice(0, 500) });
    });

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('chitchat.gg') && !url.match(/\.(png|jpg|svg|woff2|css)$/)) {
        console.log(`\n[HTTP ${req.method()}] ${url}`);
        const postData = req.postData();
        if (postData) console.log(`  Payload:`, postData);
        endpointsLog.push({
          type: 'HTTP_REQ',
          method: req.method(),
          url,
          headers: req.headers(),
          postData
        });
      }
    });

    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('api.chitchat.gg') || url.includes('/match') || url.includes('/skip')) {
        let body = '';
        try { body = await res.text(); } catch (e) {}
        console.log(`[HTTP Res ${res.status()}] ${url}`);
        if (body && body.length < 500) console.log(`  Body:`, body);
        endpointsLog.push({
          type: 'HTTP_RES',
          status: res.status(),
          url,
          body: body ? body.slice(0, 1000) : ''
        });
      }
    });

    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setCookie(...COOKIES);

    console.log('Navigating to app.chitchat.gg/text ...');
    await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // If on lobby, click Start
    const startBtn = await page.$('.search-action-button');
    if (startBtn) {
      console.log('Clicking Start button...');
      await startBtn.click();
    }

    // Wait 5 seconds to observe match / initial WS traffic
    await new Promise(r => setTimeout(r, 5000));

    // Try sending a message
    const textarea = await page.$('textarea[name="message"]');
    if (textarea) {
      console.log('Sending test message "hey"...');
      await textarea.type('hey');
      await page.keyboard.press('Enter');
    }

    await new Promise(r => setTimeout(r, 4000));

    // Try skipping
    console.log('Clicking skip...');
    const cycleBtn = await page.$('.t-match-cycle-button');
    if (cycleBtn) {
      await cycleBtn.click();
      await new Promise(r => setTimeout(r, 250));
      await cycleBtn.click();
    }

    await new Promise(r => setTimeout(r, 4000));

    fs.writeFileSync('./endpoints_dump.json', JSON.stringify(endpointsLog, null, 2));
    console.log('\n[Done] Wrote endpoints_dump.json');

  } catch (err) {
    console.error('Error during sniff:', err);
  } finally {
    await browser.close();
  }
}

main();
