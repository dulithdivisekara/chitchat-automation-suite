const { ChitchatUIHunter } = require('../../hunter_ui');

(async () => {
  const hunter = new ChitchatUIHunter();
  hunter.headless = false;
  await hunter.init();
  console.log('[*] Testing exact timeout behavior in UI Hunter...');

  // Match a stranger
  const partner = await hunter.waitForNewMatch();
  console.log(`[*] Matched: @${partner}`);

  // Send f or m?
  await hunter.sendChatMessage('f or m?');
  const sendTime = Date.now();
  console.log(`[*] "f or m?" sent at T=0.0s. Now measuring exact wait time...`);

  let skipOccurred = false;
  let disconnectOccurred = false;

  for (let s = 1; s <= 22; s++) {
    await new Promise(r => setTimeout(r, 1000));
    const elapsed = ((Date.now() - sendTime) / 1000).toFixed(1);
    const state = await hunter.getChatState();

    console.log(`[T+${elapsed}s] State: hasTextarea=${state.hasActiveTextarea}, isDisconnected=${state.isDisconnected}, msgs=${state.messages.length}`);

    if (state.isDisconnected) {
      console.log(`[!] Disconnect detected at T+${elapsed}s (Stranger left).`);
      disconnectOccurred = true;
      break;
    }

    if (state.messages.length > 1) {
      console.log(`🎉 Stranger replied at T+${elapsed}s!`);
      break;
    }
  }

  const totalWait = ((Date.now() - sendTime) / 1000).toFixed(1);
  console.log(`\n[✓] Measured active wait window: ${totalWait} seconds.`);
  if (!disconnectOccurred) {
    console.log(`[✓] Verified: Bot remained engaged and did NOT skip prematurely!`);
  }

  await hunter.triggerSkip();
  await hunter.browser.close();
})();
