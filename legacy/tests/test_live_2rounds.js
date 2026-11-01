const { ChitchatUIHunter } = require('../../hunter_ui');
const path = require('path');

(async () => {
  const hunter = new ChitchatUIHunter();
  hunter.headless = false;
  await hunter.init();
  console.log('[*] Testing 2 full live match cycles in UI Hunter...');

  for (let round = 1; round <= 2; round++) {
    console.log(`\n================= Live Test Round ${round} =================`);
    await hunter.waitForNewMatch();
    const partner = hunter.lastPartner || 'Stranger';
    console.log(`[*] Matched: @${partner}`);

    // Take screenshot during match
    await new Promise(r => setTimeout(r, 600));
    const ssPath1 = path.join(__dirname, `../../assets/run_steps/live_round_${round}_matched.png`);
    await hunter.page.screenshot({ path: ssPath1 });
    console.log(`[✓] Screenshot saved: ${ssPath1}`);

    // Screening question
    await hunter.sendChatMessage('f or m?');
    await new Promise(r => setTimeout(r, 1000));
    const ssPath2 = path.join(__dirname, `../../assets/run_steps/live_round_${round}_sent.png`);
    await hunter.page.screenshot({ path: ssPath2 });
    console.log(`[✓] Screenshot saved: ${ssPath2}`);

    // Wait a brief moment to see if stranger responds
    await new Promise(r => setTimeout(r, 4000));
    const state = await hunter.getChatState();
    console.log(`[State]:`, { partner: state.partner, messages: state.messages.map(m => m.text), isDisconnected: state.isDisconnected });

    const ssPath3 = path.join(__dirname, `../../assets/run_steps/live_round_${round}_cycle.png`);
    await hunter.page.screenshot({ path: ssPath3 });
    console.log(`[✓] Screenshot saved: ${ssPath3}`);

    // Skip to next
    console.log(`[*] Triggering skip...`);
    await hunter.triggerSkip();
    await new Promise(r => setTimeout(r, 1500));
  }

  await hunter.browser.close();
  console.log('\n[✓] Both live test rounds completed successfully!');
})();
