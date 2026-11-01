const { ChitchatUIHunter } = require('../../hunter_ui');

(async () => {
  const hunter = new ChitchatUIHunter();
  hunter.headless = true;
  await hunter.init();
  console.log('Testing 1 match cycle in UI Hunter...');
  
  // Wait for 1 match
  const partner = await hunter.waitForNewMatch();
  console.log('Partner matched:', partner);
  
  if (partner) {
    console.log('Sending f or m? via UI...');
    await hunter.sendChatMessage('f or m?');
    console.log('Message sent successfully!');
  }
  
  console.log('Disconnecting UI test match...');
  await hunter.triggerSkip();
  await hunter.browser.close();
  console.log('UI test completed successfully!');
})();
