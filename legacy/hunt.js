const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

// Load cookies
const cookiesPath = path.join(__dirname, 'cookies.json');
const COOKIES = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));

// Audio & Notification helpers
function playAlertSound() {
  exec('canberra-gtk-play -i message || pw-play /usr/share/sounds/freedesktop/stereo/complete.oga || printf "\\a"', (err) => {
    if (err) process.stdout.write('\x07');
  });
}

function sendDesktopNotification(title, message) {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeMsg = message.replace(/"/g, '\\"');
  exec(`notify-send -u critical -t 15000 "${safeTitle}" "${safeMsg}"`, () => {});
}

// Gender classifier
function classifyGender(text) {
  const lower = text.toLowerCase().trim();

  // Negative checks: "not a girl", "im not female"
  if (/not\s+(a\s+)?(girl|female|woman|f\b)/.test(lower)) {
    return 'male';
  }
  if (/not\s+(a\s+)?(boy|guy|man|male|m\b)/.test(lower)) {
    return 'female';
  }

  // Female checks
  const femaleExact = /^(f|fem|female|girl|gurl|woman|gril)$/i;
  const femaleAge = /\b(\d{1,2}\s*f|f\s*\d{1,2})\b/i;
  const femalePhrase = /\b(i'm|im|i\s*am)\s+(a\s+)?(girl|female|woman|fem|f)\b/i;
  const femaleWord = /\b(female|girl|woman|gurl)\b/i;

  if (femaleExact.test(lower) || femaleAge.test(lower) || femalePhrase.test(lower) || femaleWord.test(lower)) {
    return 'female';
  }

  // Male checks
  const maleExact = /^(m|male|boy|guy|dude|bro|man|cock|dick)$/i;
  const maleAge = /\b(\d{1,2}\s*m|m\s*\d{1,2})\b/i;
  const malePhrase = /\b(i'm|im|i\s*am)\s+(a\s+)?(boy|guy|man|male|dude|m)\b/i;
  const maleWord = /\b(male|boy|guy|dude|bro|man)\b/i;

  if (maleExact.test(lower) || maleAge.test(lower) || malePhrase.test(lower) || maleWord.test(lower)) {
    return 'male';
  }

  // Counter question check (stranger asks back)
  if (/\b(u\?|you\?|wbu|what\s+about\s+you|f\s+or\s+m|m\s+or\s+f)\b/i.test(lower)) {
    return 'counter_question';
  }

  return 'unknown';
}

class ChitchatHunter {
  constructor() {
    this.browser = null;
    this.page = null;
    this.myUsername = '';
    this.lastPartner = '';
    this.globalSeenMessageIds = new Set();
    this.stats = {
      checked: 0,
      males: 0,
      females: 0,
      timeouts: 0,
      disconnects: 0
    };
    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async init() {
    console.clear();
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           CHITCHAT AUTOMATED GIRL HUNTER / FILTER        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    console.log('[*] Launching Chrome browser with your session cookies...');

    this.browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false,
      defaultViewport: { width: 1100, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1100,800',
        '--window-position=50,50'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await this.page.setCookie(...COOKIES);

    console.log('[*] Connecting to Chitchat...');
    await this.page.goto('https://app.chitchat.gg/text', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Detect username
    this.myUsername = await this.page.evaluate(() => {
      const profileBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Open profile for'));
      if (profileBtn) {
        const parts = profileBtn.innerText.split('\n');
        return parts[1]?.trim() || '';
      }
      return '';
    });

    if (!this.myUsername) this.myUsername = 'anti-american clang';
    console.log(`[*] Logged in as: "${this.myUsername}"`);
    console.log('[*] Initializing matching...\n');
  }

  async getPartnerName() {
    return await this.page.evaluate(() => {
      const match = document.body.innerText.match(/You are now chatting with @([^\.\n]+)/);
      if (match) return match[1].trim();

      const profileBtns = Array.from(document.querySelectorAll('button[aria-label*="View @"]'));
      for (const btn of profileBtns) {
        const m = btn.getAttribute('aria-label').match(/View @(.*) profile/);
        if (m) return m[1].trim();
      }

      return '';
    });
  }

  async skipStranger() {
    const prevPartner = this.lastPartner;
    try {
      // 1. Try Quick Skip button
      const quickSkip = await this.page.$('button[aria-label="Quick skip"]');
      if (quickSkip) {
        await quickSkip.click().catch(() => {});
        await new Promise(r => setTimeout(r, 200));
      }

      // 2. Click match cycle button twice (skip + confirm)
      const cycleBtn = await this.page.$('.t-match-cycle-button');
      if (cycleBtn) {
        await cycleBtn.click().catch(() => {});
        await new Promise(r => setTimeout(r, 250));
        await cycleBtn.click().catch(() => {});
      }

      // 3. If on lobby, click Start
      const startBtn = await this.page.$('.search-action-button');
      if (startBtn) {
        await startBtn.click().catch(() => {});
      }
    } catch (e) {}

    // Wait for transition away from prevPartner
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300));
      const current = await this.getPartnerName();
      if (current && current !== prevPartner) {
        this.lastPartner = current;
        break;
      }
      // If cycle button or lobby button needs a nudge
      const startBtn = await this.page.$('.search-action-button');
      if (startBtn) {
        await startBtn.click().catch(() => {});
      }
    }
  }

  async sendMessage(text) {
    try {
      const textarea = await this.page.$('textarea[name="message"]');
      if (textarea) {
        await textarea.click();
        await textarea.type(text);
        await this.page.keyboard.press('Enter');
        return true;
      }
    } catch (e) {}
    return false;
  }

  async getMessages() {
    return await this.page.evaluate((myUsername) => {
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
          isMe: author === myUsername,
          isSystem,
          text
        });
      }

      const bodyText = document.body.innerText;
      const isDisconnected = bodyText.includes('Stranger has disconnected') ||
                             bodyText.includes('Conversation ended') ||
                             bodyText.includes('might have gone offline');

      const isLobby = !!document.querySelector('.search-action-button');

      return { messages, isDisconnected, isLobby };
    }, this.myUsername);
  }

  printStats() {
    process.stdout.write(`\r[Stats] Checked: ${this.stats.checked} | Males: ${this.stats.males} | Girls Found: ${this.stats.females} | Timeouts/Left: ${this.stats.timeouts + this.stats.disconnects}  \n`);
  }

  async handleGirlFound(strangerMsg, strangerAuthor) {
    this.stats.females++;
    playAlertSound();
    sendDesktopNotification('💖 GIRL FOUND ON CHITCHAT!', `Stranger (${strangerAuthor}): "${strangerMsg}"\nTake over the chat now!`);
    await this.page.bringToFront();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║            🎉 MATCH FOUND - GIRL DETECTED!                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Stranger (${strangerAuthor || 'Stranger'}): "${strangerMsg}"\n`);
    console.log('👉 Automation is now PAUSED so you can chat!');
    console.log('👉 The Chrome window is open on your screen: you can chat directly there.');
    console.log('👉 Or type messages right here in this terminal and press Enter to send.');
    console.log('👉 When you want to hunt for the NEXT girl, type "next" or press Enter on empty line.\n');

    const currentPartner = strangerAuthor;

    return new Promise((resolve) => {
      let isDone = false;

      // Monitor browser for disconnect or manual skip in Chrome
      const chatInterval = setInterval(async () => {
        if (isDone) return;
        try {
          const { messages, isDisconnected } = await this.getMessages();
          const activePartner = await this.getPartnerName();

          // Print new incoming messages in terminal
          for (const msg of messages) {
            if (!msg.isMe && !msg.isSystem && !this.globalSeenMessageIds.has(msg.id)) {
              this.globalSeenMessageIds.add(msg.id);
              console.log(`[${msg.author || 'Stranger'}]: "${msg.text}"`);
              playAlertSound();
            }
          }

          // If partner changed or disconnected
          if (isDisconnected || (activePartner && activePartner !== currentPartner)) {
            console.log('\n[!] Chat with girl ended (disconnected or skipped in browser).');
            cleanup();
            resolve('ended');
          }
        } catch (e) {}
      }, 1500);

      const onLine = async (line) => {
        if (isDone) return;
        const input = line.trim();
        if (input === '' || input.toLowerCase() === 'next' || input.toLowerCase() === 'skip') {
          console.log('[*] Skipping to next stranger, resuming hunt...\n');
          cleanup();
          await this.skipStranger();
          resolve('next');
        } else if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          cleanup();
          this.running = false;
          resolve('exit');
        } else {
          // Send message into chat
          await this.sendMessage(input);
          console.log(`[You]: ${input}`);
        }
      };

      const cleanup = () => {
        isDone = true;
        clearInterval(chatInterval);
        this.rl.removeListener('line', onLine);
      };

      this.rl.on('line', onLine);
    });
  }

  async run() {
    await this.init();

    while (this.running) {
      this.stats.checked++;
      console.log(`\n================== [ Hunt #${this.stats.checked} ] ==================`);

      // Ensure we are in a fresh match
      let inMatch = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const textarea = await this.page.$('textarea[name="message"]');
        const partner = await this.getPartnerName();

        if (textarea && partner && partner !== this.lastPartner) {
          this.lastPartner = partner;
          inMatch = true;
          break;
        } else if (textarea && partner) {
          this.lastPartner = partner;
          inMatch = true;
          break;
        }

        await this.skipStranger();
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!inMatch) {
        console.log('[!] Matching in progress, retrying...');
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      console.log(`[*] Chatting with @${this.lastPartner || 'Stranger'}! Sending question: "f or m?"`);
      await this.sendMessage('f or m?');

      // Wait for response (up to 12 seconds)
      const startTime = Date.now();
      let answered = false;
      let handledCounter = false;

      while (Date.now() - startTime < 12000 && this.running) {
        await new Promise(r => setTimeout(r, 700));

        const state = await this.getMessages();
        if (state.isDisconnected) {
          console.log('[x] Stranger disconnected.');
          this.stats.disconnects++;
          answered = true;
          break;
        }

        // Only process new messages from the stranger
        const strangerMessages = state.messages.filter(m => !m.isMe && !m.isSystem && !this.globalSeenMessageIds.has(m.id));

        for (const msg of strangerMessages) {
          this.globalSeenMessageIds.add(msg.id);
          const text = msg.text;
          console.log(`[Stranger]: "${text}"`);

          const gender = classifyGender(text);

          if (gender === 'female') {
            answered = true;
            await this.handleGirlFound(text, msg.author || this.lastPartner);
            break;
          } else if (gender === 'male') {
            console.log(`[SKIP] Male detected ("${text}"). Skipping...`);
            this.stats.males++;
            answered = true;
            await this.skipStranger();
            await new Promise(r => setTimeout(r, 800));
            break;
          } else if (gender === 'counter_question' && !handledCounter) {
            handledCounter = true;
            console.log('[?] Stranger asked back, replying: "f or m first? :)"');
            await this.sendMessage('f or m first? :)');
          } else {
            console.log(`[?] Ambiguous response ("${text}")...`);
          }
        }

        if (answered) break;
      }

      if (!answered && this.running) {
        console.log('[⏱] Timeout (no response). Skipping...');
        this.stats.timeouts++;
        await this.skipStranger();
        await new Promise(r => setTimeout(r, 800));
      }

      this.printStats();
    }

    console.log('\n[*] Stopping hunter. Closing browser...');
    await this.browser.close();
    this.rl.close();
  }
}

const hunter = new ChitchatHunter();
hunter.run().catch(console.error);
