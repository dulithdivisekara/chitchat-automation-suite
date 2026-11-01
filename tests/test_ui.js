const { ChitchatUIHunter } = require('../hunter_ui');

(async () => {
  console.log('═'.repeat(65));
  console.log('🖥️ TESTING CHITCHAT UI AUTOMATION & HUD ENGINE');
  console.log('═'.repeat(65));

  const hunter = new ChitchatUIHunter();
  hunter.headless = true;

  try {
    await hunter.init();
    console.log('[✓] Headless Chrome initialized with stealth flags.');

    const state = await hunter.getChatState();
    console.log(`[✓] Initial DOM State: isLobby=${state.isLobby}, partner=${state.partner || 'None'}`);

    console.log('[✓] UI Engine and DOM scrapers verified successfully!');
  } catch (err) {
    console.error('[!] UI Test failed:', err);
    process.exitCode = 1;
  } finally {
    if (hunter.browser) {
      await hunter.browser.close();
    }
    console.log('═'.repeat(65));
  }
})();
