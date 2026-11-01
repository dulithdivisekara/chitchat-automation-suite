const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const TARGET_INSTAGRAM_COUNT = 2;
const STORAGE_FILE = path.join(__dirname, 'girls_instagram.md');
const COOKIES_PATH = path.join(__dirname, 'cookies.json');

if (!fs.existsSync(COOKIES_PATH)) {
  console.error('[!] cookies.json not found! Please create cookies.json based on cookies.example.json.');
  process.exit(1);
}

const RAW_COOKIES = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
// Ensure token can be accessed appropriately
const COOKIES = RAW_COOKIES.map(c => c.name === 'token' ? { ...c, httpOnly: false } : c);

function playAlertSound() {
  exec('canberra-gtk-play -i message || pw-play /usr/share/sounds/freedesktop/stereo/complete.oga || printf "\\a"', () => {});
}

function sendDesktopNotification(title, message) {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeMsg = message.replace(/"/g, '\\"');
  exec(`notify-send -u critical -t 15000 "${safeTitle}" "${safeMsg}"`, () => {});
}

// Robust Gender & Safety Classifier
function classifyGender(text) {
  const clean = text.toLowerCase().trim();

  // 1. Safety check: Immediately flag & skip any underage references (under 18)
  if (/(?:^|\b)(?:1[0-7]|underage|minor|child|kid)(?:f|m|\b)/i.test(clean)) {
    return 'underage_skip';
  }

  // 2. Screening questions from stranger
  if (/(^|\b)(f\s*or\s*m|m\s*or\s*f|m\/f|f\/m)($|\b)/i.test(clean)) {
    return 'counter';
  }

  // 3. Negatives
  if (/\bnot\s+(a\s+)?(girl|female|woman|f\b)/i.test(clean)) return 'male';
  if (/\bnot\s+(a\s+)?(boy|guy|man|male|m\b)/i.test(clean)) return 'female';

  // 4. Female checks (e.g. "f", "19f", "f u?", "female wbu", "girl")
  if (/(^|\b)(f|female|girl|woman|gurl|gril|fem)($|\b)/i.test(clean)) return 'female';
  if (/(^|\b)(\d{1,2}\s*f|f\s*\d{1,2}|f4m|f4a)($|\b)/i.test(clean)) return 'female';
  if (/\b(i'm|im|i\s*am)\s+(a\s+)?(girl|female|woman|fem|f)\b/i.test(clean)) return 'female';

  // 5. Male checks
  if (/(^|\b)(m|male|boy|guy|man|bro|dude|cock|dick|femboy)($|\b)/i.test(clean)) return 'male';
  if (/(^|\b)(m\d{1,2}|\d{1,2}m|m\s*\d{1,2}|\d{1,2}\s*m|m4f|m4m|m4a)/i.test(clean)) return 'male';
  if (/\b(i'm|im|i\s*am)\s+(a\s+)?(boy|guy|man|male|dude|m)\b/i.test(clean)) return 'male';

  // 6. Counter questions
  if (/(^|\b)(u\?|you\?|wbu|what\s+about\s+you|who\s+r\s+u|who\s+are\s+you)/i.test(clean)) {
    return 'counter';
  }

  // 7. Greetings
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

function extractInstagramHandle(text, askedForInsta = false) {
  const clean = text.trim();

  // Pattern 1: @username
  const atMatch = clean.match(/@([a-zA-Z0-9._]{3,30})/);
  if (atMatch) return atMatch[1].replace(/^\.+|\.+$/g, '');

  // Pattern 2: ig: / insta: / instagram: username
  const prefixMatch = clean.match(/\b(?:ig|insta|instagram)\b(?:\s*(?:is|:|is:)?\s*)(@?[a-zA-Z0-9._]{3,30})/i);
  if (prefixMatch) return prefixMatch[1].replace(/^@/, '').replace(/^\.+|\.+$/g, '');

  // Pattern 3: mine is / its / it's username
  const prefixMatch2 = clean.match(/\b(?:mine\s+is|its|it's)\s+(@?[a-zA-Z0-9._]{3,30})/i);
  if (prefixMatch2) return prefixMatch2[1].replace(/^@/, '').replace(/^\.+|\.+$/g, '');

  // Pattern 4: If we explicitly asked and she sent a single clean word
  if (askedForInsta) {
    const words = clean.split(/\s+/);
    if (words.length === 1) {
      const candidate = words[0].replace(/^@/, '').replace(/^\.+|\.+$/g, '');
      if (/^[a-zA-Z0-9._]{3,30}$/.test(candidate)) {
        const nonHandles = new Set(['no', 'nope', 'nah', 'none', 'dont', 'why', 'idk', 'nothing', 'chitchat', 'private', 'sure', 'yeah', 'yes', 'ok', 'okay', 'wait']);
        if (!nonHandles.has(candidate.toLowerCase())) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function recordInstagramToFile(handle, partner, extraInfo = '') {
  const cleanHandle = handle.replace(/^@/, '');
  const profileUrl = `https://instagram.com/${cleanHandle}`;
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let existing = '';
  if (fs.existsSync(STORAGE_FILE)) {
    existing = fs.readFileSync(STORAGE_FILE, 'utf-8');
  } else {
    existing = `# Extracted Instagram Profiles (Chitchat.gg)\n\n| # | Instagram Handle | Profile Link | Chitchat Username | Detected Info | Date & Time |\n|---|---|---|---|---|---|\n`;
    fs.writeFileSync(STORAGE_FILE, existing);
  }

  const rows = existing.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('Instagram Handle'));
  const nextNum = rows.length + 1;

  const entry = `| ${nextNum} | \`@${cleanHandle}\` | [${cleanHandle}](${profileUrl}) | @${partner} | ${extraInfo} | ${timestamp} |\n`;
  fs.appendFileSync(STORAGE_FILE, entry);

  console.log('\n' + '★'.repeat(65));
  console.log(`🎉 [INSTAGRAM CAPTURED] #${nextNum}: @${cleanHandle}`);
  console.log(`🔗 Profile: ${profileUrl}`);
  console.log(`📁 Stored in: ${STORAGE_FILE}`);
  console.log('★'.repeat(65) + '\n');

  playAlertSound();
  sendDesktopNotification(`🎉 INSTAGRAM CAPTURED: @${cleanHandle}`, `From @${partner}\nSaved to ${STORAGE_FILE}!`);

  return { handle: cleanHandle, url: profileUrl, partner, timestamp };
}

class ChitchatUIHunter {
  constructor() {
    this.browser = null;
    this.page = null;
    this.myUsername = '';
    this.stats = { checked: 0, males: 0, girls: 0, timeouts: 0, captured: 0 };
    this.savedInstagrams = [];
    this.lastPartner = '';
    this.seenMessageIds = new Set();
    this.isPaused = false;
    this.skipRequested = false;
    this.autoChatEnabled = true;
    this.headless = process.argv.includes('--headless');
  }

  async init() {
    console.clear();
    console.log('\x1b[1m\x1b[96m╔═════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1m\x1b[96m║         CHITCHAT SMART UI HUNTER - PERSONA: SAHAN           ║\x1b[0m');
    console.log('\x1b[1m\x1b[96m╚═════════════════════════════════════════════════════════════╝\x1b[0m\n');
    console.log(`\x1b[93m[*] Target:\x1b[0m Capture \x1b[1m${TARGET_INSTAGRAM_COUNT}\x1b[0m girls' Instagram IDs into \x1b[1m${STORAGE_FILE}\x1b[0m`);
    console.log(`\x1b[93m[*] Mode:\x1b[0m Visual Browser with In-Page Interactive HUD (${this.headless ? 'Headless' : 'On-Screen'})`);
    console.log(`\x1b[93m[*] Persona:\x1b[0m Sahan, 20, from Sri Lanka (friendly, polite, respectful)\n`);

    this.browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: this.headless,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,840'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

    // Expose Node helpers for the HUD buttons
    await this.page.exposeFunction('togglePauseFilter', () => {
      this.isPaused = !this.isPaused;
      console.log(`[*] UI Filter ${this.isPaused ? 'PAUSED' : 'RESUMED'} from on-screen HUD.`);
      return this.isPaused;
    });

    await this.page.exposeFunction('requestSkipFromHUD', () => {
      console.log('[*] Skip requested from on-screen HUD.');
      this.skipRequested = true;
    });

    await this.page.exposeFunction('toggleAutoChatFromHUD', () => {
      this.autoChatEnabled = !this.autoChatEnabled;
      console.log(`[*] Auto-Chat ${this.autoChatEnabled ? 'ENABLED' : 'DISABLED (Manual Takeover)'} from HUD.`);
      return this.autoChatEnabled;
    });

    // Inject HUD into DOM
    await this.page.evaluateOnNewDocument(() => {
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
              -webkit-backdrop-filter: blur(14px);
              border: 1.5px solid rgba(255, 105, 180, 0.5);
              border-radius: 18px;
              padding: 12px 18px;
              color: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 16px rgba(255, 105, 180, 0.3);
              min-width: 300px;
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
              max-width: 270px;
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
              gap: 6px;
            }
            .hud-btn {
              flex: 1;
              background: rgba(255, 255, 255, 0.12);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: #fff;
              padding: 5px 8px;
              border-radius: 9px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
              text-align: center;
            }
            .hud-btn:hover { background: rgba(255, 255, 255, 0.22); }
            .hud-btn-skip { background: #ef4444; border-color: #ef4444; }
            .hud-btn-skip:hover { background: #dc2626; }
            .hud-btn-mode { background: #8b5cf6; border-color: #8b5cf6; }
            .hud-btn-mode:hover { background: #7c3aed; }
          </style>
          <div class="hud-header">
            <div class="hud-title">💖 CHITCHAT HUNTER HUD</div>
            <span id="hud-pulse" style="width:8px;height:8px;background:#4ade80;border-radius:50%;display:inline-block;"></span>
          </div>
          <div id="hud-status" class="hud-status active">Starting auto-filter...</div>
          <div class="hud-stats">
            <div>Skipped: <b id="stat-males" style="color:#f87171;">0</b></div>
            <div>Girls: <b id="stat-girls" style="color:#f472b6;">0</b></div>
            <div>Captured: <b id="stat-captured" style="color:#4ade80;">0</b></div>
          </div>
          <div class="hud-btn-row">
            <button id="hud-toggle-btn" class="hud-btn">Pause</button>
            <button id="hud-mode-btn" class="hud-btn hud-btn-mode">Auto-Bot</button>
            <button id="hud-skip-btn" class="hud-btn hud-btn-skip">Next</button>
          </div>
        `;
        document.body.appendChild(hud);

        document.getElementById('hud-toggle-btn').onclick = async () => {
          const paused = await window.togglePauseFilter();
          document.getElementById('hud-toggle-btn').innerText = paused ? 'Resume' : 'Pause';
          document.getElementById('hud-status').innerText = paused ? 'Hunter paused by you.' : 'Hunter resumed...';
        };

        document.getElementById('hud-mode-btn').onclick = async () => {
          const isAuto = await window.toggleAutoChatFromHUD();
          document.getElementById('hud-mode-btn').innerText = isAuto ? 'Auto-Bot' : 'Manual';
          document.getElementById('hud-status').innerText = isAuto ? 'Bot will chat automatically.' : 'Manual takeover active!';
        };

        document.getElementById('hud-skip-btn').onclick = () => {
          window.requestSkipFromHUD();
        };
      });
    });

    console.log('[*] Setting authentication cookies...');
    await this.page.goto('https://app.chitchat.gg', { waitUntil: 'domcontentloaded' });
    await this.page.setCookie(...COOKIES);
    console.log('[*] Navigating to https://app.chitchat.gg/text ...');
    await this.page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Resolve username
    this.myUsername = await this.page.evaluate(() => {
      const match = document.body.innerText.match(/Signed in as\s+([^\n]+)/);
      if (match) return match[1].trim();
      return 'SandunLK';
    });
    console.log(`\x1b[92m[✓] Authenticated on UI as:\x1b[0m \x1b[1m${this.myUsername}\x1b[0m\n`);
  }

  async updateHUD(statusText, isFound = false) {
    try {
      await this.page.evaluate((text, found, stats) => {
        const hud = document.getElementById('girl-hunter-hud');
        const st = document.getElementById('hud-status');
        const m = document.getElementById('stat-males');
        const g = document.getElementById('stat-girls');
        const c = document.getElementById('stat-captured');

        if (st) {
          st.innerText = text;
          st.className = found ? 'hud-status found' : 'hud-status active';
        }
        if (m) m.innerText = stats.males;
        if (g) g.innerText = stats.girls;
        if (c) c.innerText = stats.captured;
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
      // 1. Try Quick skip button first (instant 1-click skip)
      const quick = await this.page.$('button[aria-label="Quick skip"]');
      if (quick) {
        await quick.click().catch(() => {});
        await new Promise(r => setTimeout(r, 200));
      }

      // 2. Try cycle button (.t-match-cycle-button)
      const cycle = await this.page.$('.t-match-cycle-button');
      if (cycle) {
        await cycle.click().catch(() => {});
        await new Promise(r => setTimeout(r, 200));
        const cycleText = await this.page.evaluate(el => el.innerText, cycle).catch(() => '');
        if (cycleText.includes('CONFIRM') || cycleText.includes('START')) {
          await cycle.click().catch(() => {});
        }
      }

      await new Promise(r => setTimeout(r, 300));
      // 3. Start button if in lobby
      const start = await this.page.$('.search-action-button');
      if (start) await start.click().catch(() => {});
    } catch (e) {}
  }

  async sendChatMessage(text) {
    try {
      const textarea = await this.page.$('textarea[name="message"]');
      if (textarea) {
        const isDisabled = await this.page.evaluate(el => el.disabled, textarea);
        if (isDisabled) return false;

        await textarea.click();
        await textarea.type(text, { delay: 30 });
        await new Promise(r => setTimeout(r, 100));
        await this.page.keyboard.press('Enter');

        // Verify if textarea was cleared; if not, force submit via event
        await new Promise(r => setTimeout(r, 100));
        await this.page.evaluate(() => {
          const ta = document.querySelector('textarea[name="message"]');
          if (ta && ta.value.trim().length > 0) {
            ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
            const form = ta.closest('form');
            if (form) form.requestSubmit();
          }
        });

        console.log(`\x1b[96m\x1b[1m[You (Sahan)]:\x1b[0m \x1b[96m"${text}"\x1b[0m`);
        return true;
      }
    } catch (e) {}
    return false;
  }

  async getChatState() {
    return await this.page.evaluate((myUsername) => {
      const matchText = document.body.innerText.match(/chatting with @([^\.\n]+)/);
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
        const isSystem = item.innerText.includes('offline') ||
                         item.innerText.includes('Match found') ||
                         item.innerText.includes('Say hi');

        messages.push({
          id,
          author,
          isMe: author.includes(myUsername),
          isSystem,
          text
        });
      }

      const isLobby = !!document.querySelector('.search-action-button') && !hasActiveTextarea;
      const isLeft = document.body.innerText.includes('left the chat') ||
                     document.body.innerText.includes('Chat ended');
      const isDisconnected = (!hasActiveTextarea && !isLobby && !!partner) || isLeft;

      return { partner, hasActiveTextarea, messages, isLobby, isDisconnected };
    }, this.myUsername);
  }

  async waitForNewMatch() {
    await this.updateHUD('Searching for stranger...');
    const startWait = Date.now();

    while (Date.now() - startWait < 25000) {
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

  async engageGirl(initialText, partner) {
    console.log(`\n\x1b[1m\x1b[95m[💖 GIRL MATCHED: @${partner}]\x1b[0m Screening answer: "${initialText}"`);
    await this.updateHUD(`🎉 GIRL: @${partner}!`, true);
    playAlertSound();
    sendDesktopNotification(`💖 GIRL FOUND: @${partner}`, `Screening: "${initialText}"\nAuto-chatting for Instagram...`);

    let askedInsta = false;
    const startConvo = Date.now();

    // Icebreaker
    await new Promise(r => setTimeout(r, 1000));
    const locMatch = initialText.toLowerCase().match(/\b(ny|cali|california|texas|florida|uk|canada|germany|australia|india|london)\b/);
    if (locMatch) {
      await this.sendChatMessage(`heyy nice to meet u :) how's everything in ${locMatch[1].toUpperCase()}?`);
    } else {
      await this.sendChatMessage('heyy nice to meet u :) where u from?');
    }

    while (Date.now() - startConvo < 60000) {
      if (this.skipRequested) {
        console.log('[*] Skip requested by user.');
        await this.triggerSkip();
        return false;
      }

      const state = await this.getChatState();
      if (state.isDisconnected || state.partner !== partner) {
        console.log(`\x1b[93m[x] @${partner} disconnected.\x1b[0m`);
        await this.triggerSkip();
        return false;
      }

      if (!this.autoChatEnabled) {
        // User took over manual chat
        await this.updateHUD(`Manual chat with @${partner}...`, true);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const strangerMsgs = state.messages.filter(m => !m.isMe && !m.isSystem && !this.seenMessageIds.has(m.id));

      for (const msg of strangerMsgs) {
        this.seenMessageIds.add(msg.id);
        const text = msg.text;
        console.log(`\x1b[95m[@${partner}]:\x1b[0m "${text}"`);

        // Check if she provided Instagram
        const handle = extractInstagramHandle(text, askedInsta);
        if (handle) {
          const rec = recordInstagramToFile(handle, partner, initialText);
          this.savedInstagrams.push(rec);
          this.stats.captured = this.savedInstagrams.length;
          await this.updateHUD(`🎉 CAPTURED: @${handle}!`, true);

          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage('awesome, just added u! talk to u there, have a great day :)');
          await new Promise(r => setTimeout(r, 2000));
          await this.triggerSkip();
          return true;
        }

        const lower = text.toLowerCase();

        // Safety check
        if (/(?:^|\b)(?:1[0-7]|underage|minor|child|kid)(?:f|m|\b)/i.test(lower)) {
          console.log('\x1b[91m[SAFETY SKIP] Underage mention detected. Skipping match.\x1b[0m');
          await this.triggerSkip();
          return false;
        }

        // Questions about Sahan
        if (/\b(where\s+(are\s+)?(u|you)\s+from|where\s+do\s+(u|you)\s+live|ur\s+country|wbu)\b/i.test(lower)) {
          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage("i'm Sahan, from Sri Lanka! wbu?");
          continue;
        }

        if (/\b(what'?s\s+ur\s+name|who\s+are\s+u|who\s+r\s+u|ur\s+name)\b/i.test(lower)) {
          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage("i'm Sahan :) nice to meet u! what's your name?");
          continue;
        }

        if (/\b(how\s+old|ur\s+age|age\?)\b/i.test(lower)) {
          await new Promise(r => setTimeout(r, 1000));
          await this.sendChatMessage("i'm 20 :) wbu?");
          continue;
        }

        if (/\b(wyd|what\s+(are\s+)?(u|you)\s+doing)\b/i.test(lower)) {
          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage("just chilling and listening to music haha, wbu?");
          continue;
        }

        // Ask for Instagram
        if (!askedInsta) {
          await new Promise(r => setTimeout(r, 1400));
          await this.sendChatMessage("btw u seem really sweet haha, u got insta? drop ur @ so we can chat there :)");
          askedInsta = true;
        } else {
          if (lower.includes('why') || lower.includes('for what')) {
            await new Promise(r => setTimeout(r, 1200));
            await this.sendChatMessage("chitchat disconnects randomly haha, drop ur @!");
          } else if (lower.includes('wbu') || lower.includes('ur @') || lower.includes('urs')) {
            await new Promise(r => setTimeout(r, 1200));
            await this.sendChatMessage("i'll follow u right now! what's your @?");
          } else {
            await new Promise(r => setTimeout(r, 1000));
            await this.sendChatMessage("what's your @? :)");
          }
        }
      }

      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\x1b[93m[-] Conversation timed out with @${partner}. Moving to next match.\x1b[0m`);
    await this.triggerSkip();
    return false;
  }

  async run() {
    await this.init();

    while (this.savedInstagrams.length < TARGET_INSTAGRAM_COUNT) {
      if (this.isPaused) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      this.stats.checked++;
      console.log(`\n\x1b[1m────────────────── [ UI Match #${this.stats.checked} ] ──────────────────\x1b[0m`);

      // 1. Wait for partner
      const partner = await this.waitForNewMatch();
      if (!partner) {
        console.log('\x1b[93m[⏱] Match search timed out, retrying queue...\x1b[0m');
        await this.triggerSkip();
        continue;
      }

      this.lastPartner = partner;
      console.log(`\x1b[93m[*] Connected with:\x1b[0m \x1b[1m@${partner}\x1b[0m`);

      // 2. Instant username check
      if (isMaleUsername(partner)) {
        console.log(`\x1b[91m[⚡ SKIP] Male keyword in username (@${partner}). Skipping immediately!\x1b[0m`);
        this.stats.males++;
        await this.updateHUD(`Skipped male username: @${partner}`);
        await this.triggerSkip();
        continue;
      }

      // Human pause (fast enough to catch mobile users)
      await new Promise(r => setTimeout(r, 500));

      // 3. Send initial screening text
      await this.updateHUD(`Asking @${partner}: "f or m?"`);
      await this.sendChatMessage('f or m?');

      // 4. Monitor reply (up to 18 seconds)
      const startTime = Date.now();
      let handledCounter = false;
      let handledGreeting = false;
      let isAnswered = false;

      while (Date.now() - startTime < 18000) {
        await new Promise(r => setTimeout(r, 400));

        if (this.skipRequested) {
          console.log('[*] Skip requested by user.');
          isAnswered = true;
          await this.triggerSkip();
          break;
        }

        const state = await this.getChatState();
        if (state.isDisconnected || (state.partner && state.partner !== partner)) {
          console.log('\x1b[93m[x] Stranger disconnected.\x1b[0m');
          isAnswered = true;
          await this.updateHUD(`@${partner} disconnected.`);
          await this.triggerSkip();
          break;
        }

        const strangerMsgs = state.messages.filter(m => !m.isMe && !m.isSystem && !this.seenMessageIds.has(m.id));

        for (const msg of strangerMsgs) {
          this.seenMessageIds.add(msg.id);
          const text = msg.text;
          console.log(`\x1b[95m[@${partner}]:\x1b[0m "${text}"`);

          const gender = classifyGender(text);

          if (gender === 'female') {
            this.stats.girls++;
            isAnswered = true;
            await this.engageGirl(text, partner);
            break;

          } else if (gender === 'male') {
            this.stats.males++;
            isAnswered = true;
            console.log(`\x1b[91m[⚡ SKIP] Male detected ("${text}"). Skipping immediately...\x1b[0m`);
            await this.updateHUD(`Skipped male: "${text}"`);
            await this.triggerSkip();
            break;

          } else if (gender === 'underage_skip') {
            console.log(`\x1b[91m[🛡️ SAFETY SKIP] Underage detected ("${text}"). Skipping immediately!\x1b[0m`);
            isAnswered = true;
            await this.updateHUD('Safety skip (underage)');
            await this.triggerSkip();
            break;

          } else if (gender === 'counter' && !handledCounter) {
            handledCounter = true;
            await new Promise(r => setTimeout(r, 900));
            await this.sendChatMessage('m, Sahan here :) u?');

          } else if (gender === 'greeting' && !handledGreeting) {
            handledGreeting = true;
            await new Promise(r => setTimeout(r, 900));
            await this.sendChatMessage('hey! f or m? :)');
          }
        }

        if (isAnswered) break;
      }

      if (!isAnswered) {
        console.log(`\x1b[93m[⏱] No reply from @${partner}. Skipping...\x1b[0m`);
        this.stats.timeouts++;
        await this.updateHUD(`No response from @${partner}, skipping...`);
        await this.triggerSkip();
      }

      console.log(`\x1b[1m[Status] Captured: \x1b[92m${this.savedInstagrams.length}/${TARGET_INSTAGRAM_COUNT}\x1b[0m\x1b[1m | Males Skipped: ${this.stats.males} | Girls Matched: ${this.stats.girls}\x1b[0m`);
    }

    console.log('\n' + '\x1b[1m\x1b[92m' + '═'.repeat(65));
    console.log(`🎯 MISSION ACCOMPLISHED! Captured ${this.savedInstagrams.length} Instagram IDs.`);
    console.log(`📁 All profiles saved in: ${STORAGE_FILE}`);
    console.log('═'.repeat(65) + '\x1b[0m\n');

    await this.browser.close();
  }
}

if (require.main === module) {
  const hunter = new ChitchatUIHunter();
  hunter.run().catch(err => {
    console.error('[!] Fatal UI Hunter Error:', err);
    process.exit(1);
  });
}

module.exports = { ChitchatUIHunter };
