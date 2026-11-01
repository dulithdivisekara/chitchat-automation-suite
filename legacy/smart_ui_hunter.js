const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const COOKIES = require('./cookies.json');

function playAlertSound() {
  exec('canberra-gtk-play -i message || pw-play /usr/share/sounds/freedesktop/stereo/complete.oga || printf "\\a"', () => {});
}

function sendDesktopNotification(title, message) {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeMsg = message.replace(/"/g, '\\"');
  exec(`notify-send -u critical -t 15000 "${safeTitle}" "${safeMsg}"`, () => {});
}

// 100% Robust Gender & Safety Classifier
function classifyGender(text) {
  const clean = text.toLowerCase().trim();

  // 1. Safety check: Immediately flag & skip any underage references (under 18)
  if (/\b(1[0-7]|underage|minor|child|middle school|kid)\b/i.test(clean)) {
    return 'underage_skip';
  }

  // 2. Counter questions first
  if (/(^|\b)(u\?|you\?|wbu|what\s+about\s+you|f\s+or\s+m|m\s+or\s+f|m\/f|f\/m)/i.test(clean)) {
    return 'counter';
  }

  // 3. Negative checks
  if (/\bnot\s+(a\s+)?(girl|female|woman|f\b)/i.test(clean)) return 'male';
  if (/\bnot\s+(a\s+)?(boy|guy|man|male|m\b)/i.test(clean)) return 'female';

  // 4. Female checks
  if (/(^|\b)(f|female|girl|woman|gurl|gril|fem)($|\b)/i.test(clean)) return 'female';
  if (/(^|\b)(\d{1,2}\s*f|f\s*\d{1,2}|f4m|f4a)($|\b)/i.test(clean)) return 'female';
  if (/\b(i'm|im|i\s*am)\s+(a\s+)?(girl|female|woman|fem|f)\b/i.test(clean)) return 'female';

  // 5. Male checks
  if (/(^|\b)(m|male|boy|guy|man|bro|dude|cock|dick|femboy)($|\b)/i.test(clean)) return 'male';
  if (/(^|\b)(m\d{1,2}|\d{1,2}m|m\s*\d{1,2}|\d{1,2}\s*m|m4f|m4m|m4a)/i.test(clean)) return 'male';
  if (/\b(i'm|im|i\s*am)\s+(a\s+)?(boy|guy|man|male|dude|m)\b/i.test(clean)) return 'male';

  // 6. Greetings
  if (/^(hi+|hey+|yo+|hello+|sup+|wassup|hii+|heyy+)[!?.]*$/i.test(clean)) {
    return 'greeting';
  }

  return 'unknown';
}

function isMaleUsername(username) {
  const lower = username.toLowerCase();
  if (/\b(m|male|boy|guy|man|bro|dude)\b/.test(lower)) return true;
  if (/(\(m\)|\(male\)|-m-|\bm\b|\bbro\b|\bguy\b)/.test(lower)) return true;
  return false;
}

class SmartUIHunter {
  constructor() {
    this.browser = null;
    this.page = null;
    this.myUsername = '';
    this.stats = { checked: 0, males: 0, girls: 0, timeouts: 0 };
    this.lastPartner = '';
    this.globalSeenIds = new Set();
    this.isPaused = false;
    this.skipRequested = false;
  }

  async init() {
    console.clear();
    console.log('╔═════════════════════════════════════════════════════════════╗');
    console.log('║       CHITCHAT SMART UI GIRL FILTER & AUTO-HUNTER          ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');
    console.log('[*] Launching Chrome on your display with In-Page Filter HUD...');

    this.browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await this.page.setCookie(...COOKIES);

    // Expose Node helpers for the HUD buttons
    await this.page.exposeFunction('togglePauseFilter', () => {
      this.isPaused = !this.isPaused;
      console.log(`[*] Filter ${this.isPaused ? 'PAUSED' : 'RESUMED'} from on-screen HUD.`);
      return this.isPaused;
    });

    await this.page.exposeFunction('requestSkipFromHUD', () => {
      console.log('[*] Skip requested from on-screen HUD.');
      this.skipRequested = true;
    });

    // Inject HUD CSS and HTML
    await this.page.evaluateOnNewDocument(() => {
      window.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('girl-hunter-hud')) return;

        const hud = document.createElement('div');
        hud.id = 'girl-hunter-hud';
        hud.innerHTML = `
          <style>
            #girl-hunter-hud {
              position: fixed;
              top: 14px;
              right: 20px;
              z-index: 9999999;
              background: rgba(16, 17, 24, 0.94);
              backdrop-filter: blur(14px);
              -webkit-backdrop-filter: blur(14px);
              border: 1.5px solid rgba(255, 105, 180, 0.5);
              border-radius: 18px;
              padding: 12px 18px;
              color: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 16px rgba(255, 105, 180, 0.3);
              min-width: 290px;
              pointer-events: auto;
              user-select: none;
              transition: all 0.3s ease;
            }
            #girl-hunter-hud.girl-found {
              border-color: #ff2a85 !important;
              background: rgba(38, 8, 26, 0.96) !important;
              box-shadow: 0 0 35px rgba(255, 42, 133, 0.75) !important;
              animation: hud-glow 1.2s infinite alternate;
            }
            @keyframes hud-glow {
              from { transform: scale(1); box-shadow: 0 0 20px rgba(255, 42, 133, 0.5); }
              to { transform: scale(1.02); box-shadow: 0 0 40px rgba(255, 42, 133, 0.9); }
            }
            .hud-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 6px;
            }
            .hud-title {
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 0.5px;
              color: #ff69b4;
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .hud-status {
              font-size: 12px;
              font-weight: 500;
              color: #94a3b8;
              margin-bottom: 8px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 260px;
            }
            .hud-status.active { color: #4ade80; }
            .hud-status.found { color: #f472b6; font-weight: 700; }
            .hud-stats {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: #cbd5e1;
              padding: 6px 0;
              border-top: 1px solid rgba(255,255,255,0.12);
              border-bottom: 1px solid rgba(255,255,255,0.12);
              margin-bottom: 8px;
            }
            .hud-btn-row {
              display: flex;
              gap: 8px;
            }
            .hud-btn {
              flex: 1;
              background: rgba(255, 255, 255, 0.12);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: #fff;
              padding: 5px 10px;
              border-radius: 9px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
              text-align: center;
            }
            .hud-btn:hover { background: rgba(255, 255, 255, 0.22); }
            .hud-btn-skip {
              background: #ef4444;
              border-color: #ef4444;
            }
            .hud-btn-skip:hover { background: #dc2626; }
          </style>
          <div class="hud-header">
            <div class="hud-title">💖 GIRL FILTER HUD</div>
            <span id="hud-pulse" style="width:8px;height:8px;background:#4ade80;border-radius:50%;display:inline-block;"></span>
          </div>
          <div id="hud-status" class="hud-status active">Starting auto-filter...</div>
          <div class="hud-stats">
            <div>Males Skipped: <b id="stat-males" style="color:#f87171;">0</b></div>
            <div>Girls Found: <b id="stat-girls" style="color:#f472b6;">0</b></div>
          </div>
          <div class="hud-btn-row">
            <button id="hud-toggle-btn" class="hud-btn">Pause Filter</button>
            <button id="hud-skip-btn" class="hud-btn hud-btn-skip">Skip (Next)</button>
          </div>
        `;
        document.body.appendChild(hud);

        document.getElementById('hud-toggle-btn').onclick = async () => {
          const paused = await window.togglePauseFilter();
          document.getElementById('hud-toggle-btn').innerText = paused ? 'Resume Filter' : 'Pause Filter';
          document.getElementById('hud-status').innerText = paused ? 'Filter paused by you.' : 'Filtering resumed...';
        };

        document.getElementById('hud-skip-btn').onclick = () => {
          window.requestSkipFromHUD();
        };
      });
    });

    console.log('[*] Navigating to https://app.chitchat.gg/text ...');
    await this.page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Detect user profile
    this.myUsername = await this.page.evaluate(() => {
      const profileBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Open profile for'));
      if (profileBtn) {
        const parts = profileBtn.innerText.split('\n');
        return parts[1]?.trim() || '';
      }
      return '';
    });
    if (!this.myUsername) this.myUsername = 'chronic repayment';
    console.log(`[*] Logged in as: "${this.myUsername}"`);
    console.log('[*] Filter UI active on your screen!\n');
  }

  async updateHUD(statusText, isFound = false) {
    try {
      await this.page.evaluate((text, found, stats) => {
        const hud = document.getElementById('girl-hunter-hud');
        const st = document.getElementById('hud-status');
        const m = document.getElementById('stat-males');
        const g = document.getElementById('stat-girls');

        if (st) {
          st.innerText = text;
          st.className = found ? 'hud-status found' : 'hud-status active';
        }
        if (m) m.innerText = stats.males;
        if (g) g.innerText = stats.girls;
        if (hud) {
          if (found) hud.classList.add('girl-found');
          else hud.classList.remove('girl-found');
        }
      }, statusText, isFound, this.stats);
    } catch (e) {}
  }

  async triggerSkip() {
    this.skipRequested = false;
    try {
      const cycle = await this.page.$('.t-match-cycle-button');
      if (cycle) {
        await cycle.click().catch(() => {});
        await new Promise(r => setTimeout(r, 250));
        await cycle.click().catch(() => {});
      } else {
        const quick = await this.page.$('button[aria-label="Quick skip"]');
        if (quick) await quick.click().catch(() => {});
      }

      await new Promise(r => setTimeout(r, 300));
      const start = await this.page.$('.search-action-button');
      if (start) await start.click().catch(() => {});
      
      const cycleAgain = await this.page.$('.t-match-cycle-button');
      if (cycleAgain) {
        const text = await this.page.evaluate(el => el.innerText, cycleAgain);
        if (text && text.includes('START')) {
          await cycleAgain.click().catch(() => {});
        }
      }
    } catch (e) {}
  }

  async sendChatMessage(text) {
    try {
      const textarea = await this.page.$('textarea[name="message"]');
      if (textarea) {
        await textarea.click();
        await textarea.type(text);
        await new Promise(r => setTimeout(r, 150));
        await this.page.keyboard.press('Enter');
        return true;
      }
    } catch (e) {}
    return false;
  }

  async getChatState() {
    return await this.page.evaluate((myUsername) => {
      const matchText = document.body.innerText.match(/You are now chatting with @([^\.\n]+)/);
      const partner = matchText ? matchText[1].trim() : '';

      const textarea = document.querySelector('textarea[name="message"]');
      const hasActiveTextarea = !!textarea && !textarea.disabled;

      const items = Array.from(document.querySelectorAll('li.select-text[data-message-id]'));
      const messages = [];

      for (const item of items) {
        const id = item.getAttribute('data-message-id');
        const authorBtn = item.querySelector('button[title]');
        const author = authorBtn ? authorBtn.getAttribute('title') : '';
        const textEl = item.querySelector('p[data-from], .emoji-content') || item;
        const text = textEl.innerText.trim();
        const isSystem = item.innerText.includes('might have gone offline') ||
                         item.innerText.includes('back online') ||
                         item.innerText.includes('Match found');

        messages.push({
          id,
          author,
          isMe: author.includes(myUsername),
          isSystem,
          text
        });
      }

      const isLobby = !!document.querySelector('.search-action-button');
      const isDisconnected = !hasActiveTextarea && !isLobby && !!partner;

      return { partner, hasActiveTextarea, messages, isLobby, isDisconnected };
    }, this.myUsername);
  }

  async waitForNewMatch() {
    await this.updateHUD('Searching for stranger...');
    const startWait = Date.now();

    while (Date.now() - startWait < 30000) {
      if (this.isPaused) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const state = await this.getChatState();

      if (state.isLobby) {
        const startBtn = await this.page.$('.search-action-button');
        if (startBtn) await startBtn.click().catch(() => {});
      }

      if (state.hasActiveTextarea && state.partner && state.partner !== this.lastPartner) {
        return state.partner;
      }

      await new Promise(r => setTimeout(r, 400));
    }

    return null;
  }

  async run() {
    await this.init();

    while (true) {
      if (this.isPaused) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      this.stats.checked++;
      console.log(`\n────────────────── [ Hunt #${this.stats.checked} ] ──────────────────`);

      // 1. Wait for a genuine new stranger (NEVER skip before texting!)
      const partner = await this.waitForNewMatch();
      if (!partner) {
        console.log('[!] Match search timed out, nudging queue...');
        await this.triggerSkip();
        continue;
      }

      this.lastPartner = partner;
      console.log(`[*] Matched with: @${partner}!`);

      // 2. Instant username screening for male keywords
      if (isMaleUsername(partner)) {
        console.log(`[SKIP] Male keyword detected in username (@${partner}). Skipping immediately!`);
        this.stats.males++;
        await this.updateHUD(`Skipped male username: @${partner}`);
        await this.triggerSkip();
        continue;
      }

      // Human-like pause before sending text
      await new Promise(r => setTimeout(r, 1200));

      // 3. Send initial screening text
      await this.updateHUD(`Asking @${partner}: "f or m?"`);
      console.log(`[-] Sending: "f or m?"`);
      await this.sendChatMessage('f or m?');

      // 4. Monitor responses with 12s timeout
      const startTime = Date.now();
      let handledCounter = false;
      let handledGreeting = false;
      let matchedGirl = false;
      let isAnswered = false;

      while (Date.now() - startTime < 12000) {
        await new Promise(r => setTimeout(r, 400));

        if (this.skipRequested) {
          console.log('[*] Skip requested by user.');
          break;
        }

        const state = await this.getChatState();

        if (state.isDisconnected || (state.partner && state.partner !== partner)) {
          console.log('[x] Stranger disconnected.');
          await this.updateHUD(`@${partner} disconnected.`);
          isAnswered = true;
          break;
        }

        // Check new messages from stranger
        const strangerMsgs = state.messages.filter(m => !m.isMe && !m.isSystem && !this.globalSeenIds.has(m.id));

        for (const msg of strangerMsgs) {
          this.globalSeenIds.add(msg.id);
          const text = msg.text;
          console.log(`[Stranger]: "${text}"`);

          const gender = classifyGender(text);

          if (gender === 'underage_skip') {
            console.log(`[SAFETY SKIP] Underage keyword detected ("${text}"). Skipping immediately!`);
            isAnswered = true;
            await this.updateHUD('Safety skip (underage reference)');
            await this.triggerSkip();
            break;

          } else if (gender === 'female') {
            matchedGirl = true;
            isAnswered = true;
            this.stats.girls++;
            console.log(`\n🎉 [GIRL FOUND!] @${partner}: "${text}"`);

            playAlertSound();
            sendDesktopNotification('💖 GIRL FOUND ON CHITCHAT!', `@${partner}: "${text}"\nTake over the chat now!`);
            await this.page.bringToFront();

            await this.updateHUD(`🎉 GIRL FOUND: "${text}"! You can chat now!`, true);

            // Send smooth icebreaker
            await new Promise(r => setTimeout(r, 800));
            await this.sendChatMessage('heyy, where u from?');

            console.log('👉 Automation PAUSED. Chat directly in the Chrome window!');
            console.log('👉 Click "Skip (Next)" on the on-screen HUD when you want the next person.\n');

            // Wait until user finishes conversation
            while (true) {
              await new Promise(r => setTimeout(r, 1000));
              const curState = await this.getChatState();
              if (curState.isDisconnected || curState.partner !== partner || this.skipRequested) {
                console.log('[*] Conversation ended. Resuming hunt...');
                this.skipRequested = false;
                break;
              }
            }
            break;

          } else if (gender === 'male') {
            this.stats.males++;
            isAnswered = true;
            console.log(`[SKIP] Male detected ("${text}"). Skipping instantly...`);
            await this.updateHUD(`Skipped male: "${text}"`);
            await this.triggerSkip();
            break;

          } else if (gender === 'counter' && !handledCounter) {
            handledCounter = true;
            console.log(`[?] Stranger asked back, replying: "20m u?"`);
            await this.sendChatMessage('20m u?');

          } else if (gender === 'greeting' && !handledGreeting) {
            handledGreeting = true;
            console.log(`[?] Stranger greeted ("${text}"), prompting: "hey! f or m? :)"`);
            await this.sendChatMessage('hey! f or m? :)');
          }
        }

        if (isAnswered) break;
      }

      if (!isAnswered && !matchedGirl) {
        console.log(`[⏱] Timeout (no response from @${partner}). Skipping...`);
        this.stats.timeouts++;
        await this.updateHUD(`No response from @${partner}, skipping...`);
        await this.triggerSkip();
      }

      console.log(`[Stats] Checked: ${this.stats.checked} | Males: ${this.stats.males} | Girls: ${this.stats.girls} | Timeouts: ${this.stats.timeouts}`);
    }
  }
}

const hunter = new SmartUIHunter();
hunter.run().catch(console.error);
