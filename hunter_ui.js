const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const TARGET_INSTAGRAM_COUNT = 2;
const STORAGE_FILE = path.join(__dirname, 'girls_instagram.md');
const LOG_FILE = path.join(__dirname, 'hunter.log');
const COOKIES_PATH = path.join(__dirname, 'cookies.json');

function logEvent(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const cleanMsg = message.replace(/\x1b\[[0-9;]*m/g, '');
  try {
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${cleanMsg}\n`, 'utf-8');
  } catch (e) {}
}

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

  // 2. Vulgar / male slang / looking for females
  if (/\b(horny|dihhh|cock|dick|straight|looking for f|horny f)\b/i.test(clean)) {
    return 'male';
  }

  // 3. Guys asking if WE are female (e.g. "f?", "are u f?", "u f?", "any f")
  if (/(^|\b)(f\?+|f\s*\?+|are\s+(u|you)\s+f\??|u\s+f\??|any\s+f\??)($|\b)/i.test(clean)) {
    return 'male';
  }

  // 4. Negatives
  if (/\bnot\s+(a\s+)?(girl|female|woman|f\b)/i.test(clean)) return 'male';
  if (/\bnot\s+(a\s+)?(boy|guy|man|male|m\b)/i.test(clean)) return 'female';

  // 5. Declarative female checks (avoiding question marks)
  if (/(^|\b)(female|girl|woman|gurl|gril|fem)($|\b)/i.test(clean) && !clean.includes('?')) return 'female';
  if (/(^|\b)(\d{1,2}\s*f|f\s*\d{1,2}|f4m|f4a)($|\b)/i.test(clean)) return 'female';
  if (/\b(i'm|im|i\s*am)\s+(a\s+)?(girl|female|woman|fem)\b/i.test(clean)) return 'female';
  if (/^f[.!]*$/i.test(clean)) return 'female';
  if (/^f\b.*(wbu|u\?|you\?|here|cali|ny|usa)/i.test(clean)) return 'female';

  // 6. Male checks
  if (/(^|\b)(m|male|boy|guy|man|bro|dude|femboy)($|\b)/i.test(clean)) return 'male';
  if (/(^|\b)(m\d{1,2}|\d{1,2}m|m\s*\d{1,2}|\d{1,2}\s*m|m4f|m4m|m4a)/i.test(clean)) return 'male';
  if (/\b(i'm|im|i\s*am)\s+(a\s+)?(boy|guy|man|male|dude|m)\b/i.test(clean)) return 'male';

  return 'unknown';
}

function detectNameGender(text) {
  const clean = text.replace(/[^a-zA-Z\s]/g, ' ').toLowerCase();
  const words = clean.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (COMMON_FEMALE_NAMES.has(w)) return 'female';
    if (COMMON_MALE_NAMES.has(w)) return 'male';
  }
  return null;
}

// Demographic & Keyword Sets
const MALE_KEYWORDS = new Set([
  'guy', 'dude', 'bro', 'boy', 'boyz', 'man', 'men', 'male', 'fella', 'dawg',
  'gentleman', 'chad', 'lad', 'mr', 'sir', 'king', 'prince', 'lord', 'daddy',
  'dad', 'father', 'son', 'femboy', 'm4f', 'm4m', 'm4a', 'broy', 'subdude', 'cock', 'dick'
]);

const COMMON_MALE_NAMES = new Set([
  'alex', 'adam', 'andrew', 'anthony', 'ben', 'brandon', 'brian', 'chris',
  'christian', 'cody', 'daniel', 'david', 'dylan', 'eric', 'ethan', 'george',
  'jack', 'jackson', 'jacob', 'james', 'jason', 'john', 'johnny', 'jordan',
  'josh', 'joshua', 'justin', 'kevin', 'kyle', 'lucas', 'luke', 'mark',
  'matt', 'matthew', 'max', 'michael', 'mikey', 'nathan', 'nick', 'noah',
  'omar', 'patrick', 'paul', 'peter', 'ryan', 'sam', 'sean', 'stephen',
  'thomas', 'tyler', 'william', 'zach', 'zack', 'ali', 'ahmed', 'mohamed',
  'baker', 'srijal', 'dadbod', 'steve', 'tom', 'tim', 'robert', 'richard'
]);

const FEMALE_KEYWORDS = new Set([
  'girl', 'girlz', 'girly', 'female', 'woman', 'women', 'lady', 'queen',
  'princess', 'miss', 'ms', 'mrs', 'chick', 'babe', 'shawty', 'f4m', 'f4a',
  'femme', 'she', 'her'
]);

const COMMON_FEMALE_NAMES = new Set([
  'emma', 'olivia', 'ava', 'isabella', 'sophia', 'mia', 'charlotte', 'amelia',
  'harper', 'evelyn', 'abigail', 'emily', 'elizabeth', 'mila', 'ella', 'avery',
  'sofia', 'camila', 'aria', 'scarlett', 'victoria', 'madison', 'luna', 'grace',
  'chloe', 'penelope', 'layla', 'riley', 'zoey', 'nora', 'lily', 'eleanor',
  'hannah', 'lillian', 'addison', 'aubrey', 'ellie', 'stella', 'natalie', 'zoe',
  'leah', 'hazel', 'violet', 'aurora', 'savannah', 'audrey', 'brooklyn', 'bella',
  'claire', 'skylar', 'sarah', 'lucy', 'anna', 'maya', 'sara', 'elena', 'alice'
]);

const COUNTRIES_AND_PLACES = {
  usa: 'USA', us: 'USA', america: 'USA', 'united states': 'USA',
  cali: 'California, USA', california: 'California, USA', ny: 'New York, USA',
  'new york': 'New York, USA', texas: 'Texas, USA', florida: 'Florida, USA',
  uk: 'United Kingdom', london: 'London, UK', england: 'England, UK',
  canada: 'Canada', toronto: 'Toronto, Canada', vancouver: 'Vancouver, Canada',
  australia: 'Australia', sydney: 'Sydney, Australia', melbourne: 'Melbourne, Australia',
  germany: 'Germany', berlin: 'Berlin, Germany', france: 'France', paris: 'Paris, France',
  india: 'India', delhi: 'Delhi, India', mumbai: 'Mumbai, India',
  'sri lanka': 'Sri Lanka', colombo: 'Colombo, Sri Lanka',
  italy: 'Italy', spain: 'Spain', netherlands: 'Netherlands',
  philippines: 'Philippines', brazil: 'Brazil', japan: 'Japan'
};

function isMaleUsername(username) {
  const raw = username.trim();
  const clean = raw.replace(/[^\w\s]/g, ' ');
  const tokens = clean.split(/\s+/).filter(Boolean).map(t => t.toLowerCase());

  for (const t of tokens) {
    if (MALE_KEYWORDS.has(t) || COMMON_MALE_NAMES.has(t)) return true;
    if (/^m\d{1,2}$|^\d{1,2}m$|^m$/.test(t)) return true;
  }

  const lower = raw.toLowerCase();
  if (/\b(m|male)\b/.test(lower)) return true;
  if (/(guy|dude|boy|dawg|femboy|dadbod)/i.test(lower)) return true;
  if (/[a-z]Man\b/.test(raw) || (/\bman\b/.test(lower) && !/\b(woman|human|german)\b/.test(lower))) {
    return true;
  }

  return false;
}

function isFemaleUsername(username) {
  const raw = username.trim();
  const clean = raw.replace(/[^\w\s]/g, ' ');
  const tokens = clean.split(/\s+/).filter(Boolean).map(t => t.toLowerCase());

  for (const t of tokens) {
    if (FEMALE_KEYWORDS.has(t) || COMMON_FEMALE_NAMES.has(t)) return true;
    if (/^f\d{1,2}$|^\d{1,2}f$|^f$/.test(t)) return true;
  }

  const lower = raw.toLowerCase();
  if (/\b(female|girl|girly|queen|princess|lady)\b/.test(lower)) return true;
  return false;
}

function extractMetadataFromConvo(messages) {
  const fullText = messages.join(' ').toLowerCase();
  const data = {
    age: 'N/A',
    location: 'N/A',
    interests: 'Casual Chat',
    notes: 'Pleasant conversation'
  };

  const ageMatch = fullText.match(/\b(1[89]|[2-5][0-9])\s*(?:yo|y\/o|years?\s*old|f\b|\b)/);
  if (ageMatch) data.age = ageMatch[1];

  for (const [key, name] of Object.entries(COUNTRIES_AND_PLACES)) {
    const rx = new RegExp(`\\b${key}\\b`, 'i');
    if (rx.test(fullText)) {
      data.location = name;
      break;
    }
  }

  const interestMap = {
    Music: ['song', 'music', 'listen', 'band', 'spotify', 'taylor', 'pop', 'indie', 'rock'],
    Student: ['study', 'studying', 'college', 'uni', 'university', 'school', 'exam', 'class'],
    Gaming: ['game', 'gaming', 'valorant', 'minecraft', 'roblox', 'fortnite'],
    Art: ['art', 'draw', 'drawing', 'paint', 'painting', 'design'],
    Fitness: ['gym', 'workout', 'fitness', 'training', 'run', 'running'],
    'Movies & Shows': ['netflix', 'movie', 'movies', 'show', 'anime', 'watch']
  };

  const found = [];
  for (const [cat, words] of Object.entries(interestMap)) {
    if (words.some(w => new RegExp(`\\b${w}\\b`, 'i').test(fullText))) {
      found.push(cat);
    }
  }
  if (found.length) data.interests = found.join(', ');

  return data;
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

function recordInstagramToFile(handle, partner, convoHistory = [], extraInfo = '') {
  const cleanHandle = handle.replace(/^@/, '');
  const profileUrl = `https://instagram.com/${cleanHandle}`;
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const metadata = extractMetadataFromConvo(convoHistory);
  const notes = extraInfo ? `Initial: ${extraInfo}` : 'Natural conversation';

  let existing = '';
  if (fs.existsSync(STORAGE_FILE)) {
    existing = fs.readFileSync(STORAGE_FILE, 'utf-8');
  } else {
    existing = `# 💖 Extracted Profiles & Contact Directory (Chitchat.gg)\n\n| # | Instagram Handle | Profile Link | Chitchat Username | Age | Location / Country | Interests & Highlights | Chat Notes | Date & Time |\n|:---:|---|---|---|:---:|---|---|---|---|\n`;
    fs.writeFileSync(STORAGE_FILE, existing);
  }

  const rows = existing.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('Instagram Handle'));
  const nextNum = rows.length + 1;

  const entry = `| ${nextNum} | \`@${cleanHandle}\` | [${cleanHandle}](${profileUrl}) | @${partner} | ${metadata.age} | ${metadata.location} | ${metadata.interests} | ${notes} | ${timestamp} |\n`;
  fs.appendFileSync(STORAGE_FILE, entry);

  console.log('\n' + '★'.repeat(65));
  console.log(`🎉 [INSTAGRAM CAPTURED] #${nextNum}: @${cleanHandle}`);
  console.log(`🔗 Profile: ${profileUrl}`);
  console.log(`📍 Location: ${metadata.location} | Age: ${metadata.age} | Interests: ${metadata.interests}`);
  console.log(`📁 Stored in: ${STORAGE_FILE}`);
  console.log('★'.repeat(65) + '\n');

  logEvent(`INSTA_CAPTURED: @${cleanHandle} from @${partner} | Age: ${metadata.age} | Location: ${metadata.location} | Interests: ${metadata.interests}`);
  playAlertSound();
  sendDesktopNotification(`🎉 INSTAGRAM CAPTURED: @${cleanHandle}`, `From @${partner} (${metadata.location})\nSaved to ${STORAGE_FILE}!`);

  return { handle: cleanHandle, url: profileUrl, partner, age: metadata.age, location: metadata.location, timestamp };
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
        logEvent(`OUTBOUND: [You (Sahan)]: "${text}"`);
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
      
      // CRITICAL FIX: Only check for disconnect if the textarea is actually disabled.
      // Never check document.body.innerText as it contains the left sidebar's previous chat history!
      const main = document.querySelector('main');
      const mainText = main ? main.innerText : '';
      const cycleBtn = document.querySelector('.t-match-cycle-button');
      const cycleText = cycleBtn ? cycleBtn.innerText.trim() : '';

      const isEnded = !hasActiveTextarea && (
        mainText.includes('left the chat') ||
        mainText.includes('Chat ended') ||
        cycleText === 'START'
      );

      const isTyping = !!(main && (
        main.querySelector('.typing-indicator, [data-typing], .typing-dots') ||
        main.innerText.includes('is typing') ||
        main.innerText.includes('typing...')
      ));

      const isDisconnected = (!hasActiveTextarea && !isLobby && !!partner) || isEnded;

      return { partner, hasActiveTextarea, messages, isLobby, isDisconnected, isTyping };
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

      // If button inside main says START, click it to search
      const cycle = await this.page.$('.t-match-cycle-button');
      if (cycle) {
        const text = await this.page.evaluate(el => el.innerText, cycle).catch(() => '');
        if (text.includes('START')) {
          await cycle.click().catch(() => {});
        }
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
    logEvent(`CONFIRMED_GIRL: @${partner} (${initialText})`);
    playAlertSound();
    sendDesktopNotification(`💖 GIRL FOUND: @${partner}`, `Screening: "${initialText}"\nAuto-chatting for Instagram...`);

    const convoHistory = [initialText];
    let askedInsta = false;
    let convoStage = 1; // 1: Origin/location, 2: Daily vibe, 3: Warm banter, 4: Instagram ask
    let startConvo = Date.now();

    // Icebreaker
    await new Promise(r => setTimeout(r, 1000));
    const locMatch = initialText.toLowerCase().match(/\b(ny|cali|california|texas|florida|uk|canada|germany|australia|india|london|sri lanka|italy|spain)\b/);
    if (locMatch) {
      await this.sendChatMessage(`heyy nice to meet u :) how's everything over in ${locMatch[1].toUpperCase()}?`);
      convoStage = 2;
    } else {
      await this.sendChatMessage('heyy nice to meet u :) where are u from?');
    }

    while (Date.now() - startConvo < 120000) {
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

      if (state.isTyping) {
        startConvo = Date.now();
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
        convoHistory.push(text);
        startConvo = Date.now();
        console.log(`\x1b[95m[@${partner}]:\x1b[0m "${text}"`);

        // Check if she provided Instagram
        const handle = extractInstagramHandle(text, askedInsta);
        if (handle) {
          const rec = recordInstagramToFile(handle, partner, convoHistory, initialText);
          this.savedInstagrams.push(rec);
          this.stats.captured = this.savedInstagrams.length;
          await this.updateHUD(`🎉 CAPTURED: @${handle}!`, true);

          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage('awesome, just added u! talk to u there, have a wonderful day :)');
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
        if (/\b(where\s+(are\s+)?(u|you)\s+from|where\s+do\s+(u|you)\s+live|ur\s+country|wbu|what\s+about\s+you)\b/i.test(lower)) {
          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage("i'm Sahan, from Sri Lanka! wbu?");
          continue;
        }

        if (/\b(what'?s\s+ur\s+name|who\s+are\s+u|who\s+r\s+u|ur\s+name)\b/i.test(lower)) {
          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage("i'm Sahan :) what's your name?");
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

        // Stage-based conversational flow
        if (convoStage === 1) {
          await new Promise(r => setTimeout(r, 1200));
          await this.sendChatMessage("oh that's really cool! what are u up to today? studying, working or just chilling haha");
          convoStage = 2;
        } else if (convoStage === 2) {
          await new Promise(r => setTimeout(r, 1200));
          if (/study|exam|class|uni|college/i.test(lower)) {
            await this.sendChatMessage("haha i feel that, studying gets so exhausting lol! make sure u get some rest :)");
          } else if (/music|song|spotify|movie|netflix/i.test(lower)) {
            await this.sendChatMessage("nice! honestly same here, was just listening to some music and chilling haha");
          } else {
            await this.sendChatMessage("haha nice! honestly you have such a chill and sweet vibe :)");
          }
          convoStage = 3;
        } else if (convoStage === 3) {
          await new Promise(r => setTimeout(r, 1400));
          await this.sendChatMessage("haha you're really fun to talk to, honestly chitchat always disconnects people randomly lol. do u have an insta so we don't lose touch? only if u're comfortable of course :)");
          askedInsta = true;
          convoStage = 4;
        } else if (convoStage === 4) {
          if (lower.includes('why') || lower.includes('for what')) {
            await new Promise(r => setTimeout(r, 1200));
            await this.sendChatMessage("chitchat drops connection randomly haha, just thought you had great vibes! what's ur @? i'll just say hi :)");
          } else if (lower.includes('wbu') || lower.includes('ur @') || lower.includes('urs')) {
            await new Promise(r => setTimeout(r, 1200));
            await this.sendChatMessage("i'll follow u right now! what's your @? :)");
          } else if (lower.includes('no') || lower.includes('nah') || lower.includes('dont have') || lower.includes("don't have")) {
            await new Promise(r => setTimeout(r, 1000));
            await this.sendChatMessage("haha no worries at all, totally respect that! hope you have a great day :)");
            await new Promise(r => setTimeout(r, 1500));
            await this.triggerSkip();
            return false;
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
      logEvent(`MATCH_START: @${partner}`);

      // 2. Instant username check (Male)
      if (isMaleUsername(partner)) {
        console.log(`\x1b[91m[⚡ SKIP] Male indicator in username (@${partner}). Skipping immediately!\x1b[0m`);
        logEvent(`SKIP_USERNAME: @${partner} (Male indicator in username)`);
        this.stats.males++;
        await this.updateHUD(`Skipped male: @${partner}`);
        await this.triggerSkip();
        continue;
      }

      // 3. Instant username check (Female)
      if (isFemaleUsername(partner)) {
        console.log(`\x1b[95m[💖 FEMALE USERNAME DETECTED: @${partner}]\x1b[0m`);
        logEvent(`FEMALE_USERNAME_DETECTED: @${partner}`);
        this.stats.girls++;
        await this.engageGirl(`username: @${partner}`, partner);
        continue;
      }

      // 4. Neutral Username: Friendly, organic greeting
      await new Promise(r => setTimeout(r, 500));
      await this.updateHUD(`Saying hi to @${partner}...`);
      await this.sendChatMessage("heyy :) how's your day going?");

      // 5. Monitor reply (up to 25 seconds, dynamically extended on typing or message)
      let startTime = Date.now();
      let askedGender = false;
      let isAnswered = false;

      while (Date.now() - startTime < 25000) {
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

        if (state.isTyping) {
          console.log(`\x1b[96m[*] @${partner} is typing... (extending timeout)\x1b[0m`);
          startTime = Date.now();
        }

        const strangerMsgs = state.messages.filter(m => !m.isMe && !m.isSystem && !this.seenMessageIds.has(m.id));

        for (const msg of strangerMsgs) {
          this.seenMessageIds.add(msg.id);
          startTime = Date.now();
          const text = msg.text;
          console.log(`\x1b[95m[@${partner}]:\x1b[0m "${text}"`);
          logEvent(`INBOUND: [@${partner}]: "${text}"`);
          const lower = text.toLowerCase().trim();

          // A. Underage safety check
          if (/(?:^|\b)(?:1[0-7]|underage|minor|child|kid)(?:f|m|\b)/i.test(lower)) {
            console.log('\x1b[91m[🛡️ SAFETY SKIP] Underage detected. Skipping immediately!\x1b[0m');
            logEvent(`SAFETY_SKIP_UNDERAGE: @${partner} ("${text}")`);
            isAnswered = true;
            await this.updateHUD('Safety skip (underage)');
            await this.triggerSkip();
            break;
          }

          // B. Check male indicators
          const gender = classifyGender(text);
          const nameGender = detectNameGender(text);

          if (gender === 'male' || nameGender === 'male') {
            this.stats.males++;
            isAnswered = true;
            console.log(`\x1b[91m[⚡ SKIP] Male detected ("${text}"). Skipping immediately...\x1b[0m`);
            logEvent(`SKIP_MALE_CHAT: @${partner} ("${text}")`);
            await this.updateHUD(`Skipped male: "${text}"`);
            await this.triggerSkip();
            break;
          }

          // C. Check female indicators
          if (gender === 'female' || nameGender === 'female') {
            this.stats.girls++;
            isAnswered = true;
            await this.engageGirl(text, partner);
            break;
          }

          // D. Stranger asks if WE are a boy or girl, or counter questions
          if (/(f\s*or\s*m|m\s*or\s*f|m\/f|f\/m|are\s+u\s+(a\s+)?(boy|girl)|boy\s+or\s+girl)/i.test(lower)) {
            await new Promise(r => setTimeout(r, 900));
            await this.sendChatMessage("i'm a guy, Sahan :) what about u?");
            askedGender = true;
            continue;
          }

          // E. Stranger asks "wbu", "what about you", "and you", "how about u"
          if (/\b(wbu|what\s+about\s+(u|you)|how\s+about\s+(u|you)|and\s+(u|you)|yours)\b/i.test(lower)) {
            if (!askedGender) {
              await new Promise(r => setTimeout(r, 1200));
              await this.sendChatMessage("pretty good! just listening to some music :) i'm Sahan btw, r u a boy or a girl? don't wanna assume haha");
              askedGender = true;
            } else {
              await new Promise(r => setTimeout(r, 900));
              await this.sendChatMessage("i'm a guy, Sahan :) what about u?");
            }
            continue;
          }

          // F. Stranger expresses feeling bad or rough
          if (/bad|sad|tired|rough|exhausted|sick/i.test(lower)) {
            await new Promise(r => setTimeout(r, 1200));
            await this.sendChatMessage("oh no, hope your day gets better! i'm Sahan btw :) r u a boy or a girl? don't wanna assume haha");
            askedGender = true;
            continue;
          }

          // G. Stranger replies with standard greeting/status
          if (!askedGender) {
            await new Promise(r => setTimeout(r, 1100));
            await this.sendChatMessage("pretty good! i'm Sahan btw :) r u a boy or a girl? don't wanna assume haha");
            askedGender = true;
            continue;
          } else {
            await new Promise(r => setTimeout(r, 900));
            await this.sendChatMessage("haha nice! are u a guy or a girl btw? don't wanna assume haha");
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
