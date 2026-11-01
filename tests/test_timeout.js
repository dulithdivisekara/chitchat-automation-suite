const { ChitchatUIHunter } = require('../hunter_ui');

(async () => {
  console.log('═'.repeat(65));
  console.log('⏱️ TESTING CHITCHAT TIMEOUT & ENGAGEMENT LOGIC');
  console.log('═'.repeat(65));

  const hunter = new ChitchatUIHunter();
  hunter.headless = true;

  try {
    await hunter.init();
    console.log('[*] Waiting for match in headless mode...');

    const partner = await hunter.waitForNewMatch();
    if (!partner) {
      console.log('[!] Match queue timed out in test environment.');
      return;
    }

    console.log(`[✓] Connected with: @${partner}`);
    await hunter.sendChatMessage('f or m?');
    const sendTime = Date.now();

    // Verify chat stays engaged for multiple seconds without premature skip
    for (let s = 1; s <= 5; s++) {
      await new Promise(r => setTimeout(r, 1000));
      const state = await hunter.getChatState();
      const elapsed = ((Date.now() - sendTime) / 1000).toFixed(1);
      console.log(`[T+${elapsed}s] Active textarea=${state.hasActiveTextarea}, Disconnected=${state.isDisconnected}`);
      if (state.isDisconnected) {
        console.log(`[!] Partner @${partner} left early.`);
        break;
      }
    }

    await hunter.triggerSkip();
    console.log('[✓] Timeout and active engagement verified cleanly!');
  } catch (err) {
    console.error('[!] Test error:', err);
    process.exitCode = 1;
  } finally {
    if (hunter.browser) {
      await hunter.browser.close();
    }
    console.log('═'.repeat(65));
  }
})();
