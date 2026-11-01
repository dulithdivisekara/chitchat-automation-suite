const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const RAW_COOKIES = JSON.parse(fs.readFileSync(path.join(__dirname, '../../cookies.json'), 'utf-8'));
const COOKIES = RAW_COOKIES.map(c => c.name === 'token' ? { ...c, httpOnly: false } : c);
const OUTPUT_DIR = path.join(__dirname, '../../assets/run_steps');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runStepByStep() {
  console.log('[*] Step 1: Launching Chrome with stealth flags...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,840'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

  // Inject updated HUD (top: 65px)
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('girl-hunter-hud')) return;
      const hud = document.createElement('div');
      hud.id = 'girl-hunter-hud';
      hud.innerHTML = `
        <style>
          #girl-hunter-hud {
            position: fixed;
            top: 65px;
            right: 24px;
            z-index: 9999999;
            background: rgba(16, 17, 24, 0.94);
            backdrop-filter: blur(14px);
            border: 1.5px solid rgba(255, 105, 180, 0.5);
            border-radius: 18px;
            padding: 12px 18px;
            color: #ffffff;
            font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            min-width: 290px;
          }
          .hud-title { font-size: 13px; font-weight: 800; color: #ff69b4; }
          .hud-status { font-size: 12px; color: #4ade80; margin: 6px 0; }
          .hud-stats { display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; }
        </style>
        <div class="hud-title">💖 CHITCHAT HUNTER HUD</div>
        <div id="hud-status" class="hud-status">Initializing...</div>
        <div class="hud-stats">
          <div>Skipped: <b id="stat-males" style="color:#f87171;">0</b></div>
          <div>Girls: <b id="stat-girls" style="color:#f472b6;">0</b></div>
        </div>
      `;
      document.body.appendChild(hud);
    });
  });

  console.log('[*] Step 2: Applying cookies and loading Chitchat text page...');
  await page.goto('https://app.chitchat.gg', { waitUntil: 'domcontentloaded' });
  await page.setCookie(...COOKIES);
  await page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
  await sleep(1500);

  const step1Path = path.join(OUTPUT_DIR, '01_initial_load.png');
  await page.screenshot({ path: step1Path });
  console.log(`[✓] Screenshot saved: ${step1Path}`);

  console.log('[*] Step 3: Starting match search...');
  await page.evaluate(() => {
    const el = document.getElementById('hud-status');
    if (el) el.innerText = 'Searching for stranger...';
  });
  const startBtn = await page.$('.search-action-button');
  if (startBtn) {
    await startBtn.click();
    console.log('[*] Clicked start button.');
  }
  await sleep(1000);

  const step2Path = path.join(OUTPUT_DIR, '02_searching.png');
  await page.screenshot({ path: step2Path });
  console.log(`[✓] Screenshot saved: ${step2Path}`);

  console.log('[*] Step 4: Waiting for active stranger match...');
  let partner = null;
  for (let i = 0; i < 20; i++) {
    await sleep(800);
    const chatState = await page.evaluate(() => {
      const match = document.body.innerText.match(/chatting with @([^\.\n]+)/);
      const ta = document.querySelector('textarea[name="message"]');
      const hasActiveTa = !!ta && !ta.disabled;
      const isEnded = document.body.innerText.includes('left the chat') || document.body.innerText.includes('Chat ended');
      return {
        partner: match ? match[1].trim() : null,
        hasActiveTa,
        isEnded
      };
    });

    if (chatState.isEnded) {
      console.log(`[!] Partner left immediately, clicking next...`);
      const cycle = await page.$('.t-match-cycle-button') || await page.$('.search-action-button');
      if (cycle) await cycle.click().catch(() => {});
      continue;
    }

    if (chatState.hasActiveTa && chatState.partner) {
      partner = chatState.partner;
      console.log(`[✓] Active match found: @${partner}!`);
      break;
    }
  }

  const step3Path = path.join(OUTPUT_DIR, '03_matched_active.png');
  await page.screenshot({ path: step3Path });
  console.log(`[✓] Screenshot saved: ${step3Path}`);

  if (partner) {
    console.log('[*] Step 5: Sending screening question "f or m?"...');
    await page.evaluate((p) => {
      const el = document.getElementById('hud-status');
      if (el) el.innerText = `Asking @${p}: "f or m?"`;
    }, partner);

    await sleep(1000); // Human pause
    const textarea = await page.$('textarea[name="message"]');
    if (textarea) {
      const isDisabled = await page.evaluate(el => el.disabled, textarea);
      if (!isDisabled) {
        await textarea.click();
        await textarea.type('f or m?', { delay: 40 });
        await sleep(200);
        await page.keyboard.press('Enter');
        console.log('[✓] Sent "f or m?" successfully!');
      }
    }

    await sleep(1200);
    const step4Path = path.join(OUTPUT_DIR, '04_screening_sent.png');
    await page.screenshot({ path: step4Path });
    console.log(`[✓] Screenshot saved: ${step4Path}`);

    console.log('[*] Step 6: Monitoring chat messages...');
    for (let s = 1; s <= 6; s++) {
      await sleep(1000);
      const msgs = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('li.select-text[data-message-id]'));
        return items.map(el => el.innerText.trim().replace(/\n+/g, ' '));
      });
      console.log(`[T+${s}s messages]:`, msgs);
      if (msgs.length > 1) break;
    }

    const step5Path = path.join(OUTPUT_DIR, '05_chat_progress.png');
    await page.screenshot({ path: step5Path });
    console.log(`[✓] Screenshot saved: ${step5Path}`);

    console.log('[*] Step 7: Performing instant skip test...');
    const quick = await page.$('button[aria-label="Quick skip"]');
    if (quick) {
      await quick.click().catch(() => {});
      console.log('[*] Clicked Quick skip!');
    } else {
      const cycle = await page.$('.t-match-cycle-button');
      if (cycle) {
        await cycle.click().catch(() => {});
        await sleep(200);
        await cycle.click().catch(() => {});
      }
    }

    await sleep(1500);
    const step6Path = path.join(OUTPUT_DIR, '06_next_match_transition.png');
    await page.screenshot({ path: step6Path });
    console.log(`[✓] Screenshot saved: ${step6Path}`);
  }

  await sleep(1000);
  await browser.close();
  console.log('\n[✓] Investigation run finished cleanly!');
}

runStepByStep().catch(err => {
  console.error('[!] Error in runStepByStep:', err);
  process.exit(1);
});
