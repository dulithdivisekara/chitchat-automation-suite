const { ChitchatUIHunter } = require('../../hunter_ui');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '../../assets/run_steps/ui_verify');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const hunter = new ChitchatUIHunter();
  hunter.headless = false;
  await hunter.init();
  console.log('[*] Testing UI Hunter for 3 consecutive rounds to verify NO premature skips...');

  for (let round = 1; round <= 3; round++) {
    console.log(`\n═════════════════ [ UI Round ${round} ] ═════════════════`);
    
    // 1. Wait for partner
    const partner = await hunter.waitForNewMatch();
    console.log(`[Round ${round}] Matched partner: @${partner}`);
    
    const ss1 = path.join(SCREENSHOT_DIR, `round_${round}_01_matched.png`);
    await hunter.page.screenshot({ path: ss1 });
    console.log(`[✓] Screenshot saved: ${ss1}`);

    // Check chat state
    let state = await hunter.getChatState();
    console.log(`[Round ${round}] State immediately after match:`, {
      partner: state.partner,
      hasActiveTextarea: state.hasActiveTextarea,
      isDisconnected: state.isDisconnected
    });

    if (state.isDisconnected) {
      console.log(`[Round ${round}] Stranger dropped before screening. Skipping...`);
      await hunter.triggerSkip();
      continue;
    }

    // 2. Send screening question
    console.log(`[Round ${round}] Sending "f or m?"...`);
    const sent = await hunter.sendChatMessage('f or m?');
    console.log(`[Round ${round}] Message send result:`, sent);
    await sleep(800);

    const ss2 = path.join(SCREENSHOT_DIR, `round_${round}_02_sent.png`);
    await hunter.page.screenshot({ path: ss2 });
    console.log(`[✓] Screenshot saved: ${ss2}`);

    // 3. Monitor for opponent message (wait up to 10s)
    console.log(`[Round ${round}] Waiting for opponent message (10s monitor)...`);
    let replied = false;
    for (let s = 1; s <= 10; s++) {
      await sleep(1000);
      state = await hunter.getChatState();
      
      const strangerMsgs = state.messages.filter(m => !m.isMe && !m.isSystem && !hunter.seenMessageIds.has(m.id));
      if (strangerMsgs.length > 0) {
        for (const m of strangerMsgs) {
          hunter.seenMessageIds.add(m.id);
          console.log(`[Round ${round}] 🎉 OPONENT REPLIED at T+${s}s: "${m.text}"`);
        }
        replied = true;
        break;
      }

      if (state.isDisconnected) {
        console.log(`[Round ${round}] Stranger disconnected at T+${s}s.`);
        break;
      }
    }

    const ss3 = path.join(SCREENSHOT_DIR, `round_${round}_03_after_wait.png`);
    await hunter.page.screenshot({ path: ss3 });
    console.log(`[✓] Screenshot saved: ${ss3}`);

    // Cycle to next
    console.log(`[Round ${round}] Cycling to next match...`);
    await hunter.triggerSkip();
    await sleep(1500);
  }

  await hunter.browser.close();
  console.log('\n[✓] All 3 UI test rounds finished cleanly!');
})();
