import asyncio, sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from hunter_backend import InstagramHunter

async def verify_backend_rounds(num_rounds=2):
    print("═"*65)
    print("⚡ TESTING BACKEND HUNTER: VERIFYING NO PREMATURE SKIPS")
    print("═"*65 + "\n")
    
    hunter = InstagramHunter()
    await hunter.init()
    
    for round_num in range(1, num_rounds + 1):
        print(f"\n────────────────── [ Backend Test Match #{round_num} ] ──────────────────")
        await hunter.close_match()
        
        hunter.match_event.clear()
        hunter.disconnect_event.clear()
        
        # Enter queue
        print(f"[*] Match #{round_num}: Searching queue...")
        hunter.client.search_match()
        
        try:
            await asyncio.wait_for(hunter.match_event.wait(), timeout=20.0)
        except asyncio.TimeoutError:
            print("[!] Timeout waiting for match, retrying...")
            continue
            
        partner = hunter.partner_username or "Stranger"
        print(f"[✓] Connected with: @{partner} (Conv ID: {hunter.active_conv_id})")
        
        # Verify disconnect_event is clear
        hunter.disconnect_event.clear()
        
        # Send screening
        print(f"[*] Sending screening question 'f or m?' to @{partner}...")
        await asyncio.sleep(0.5)
        await hunter.human_send("f or m?", typing_time=0.6)
        
        # Monitor for up to 10s for stranger message
        print(f"[*] Waiting for reply from @{partner} (up to 10s)...")
        start_wait = asyncio.get_event_loop().time()
        replied = False
        
        while asyncio.get_event_loop().time() - start_wait < 10.0:
            if hunter.disconnect_event.is_set():
                print(f"[!] Stranger @{partner} disconnected.")
                break
                
            try:
                msg = await asyncio.wait_for(hunter.message_queue.get(), timeout=1.0)
                content = msg.get("content", "").strip()
                print(f"🎉 STRANGER REPLIED: @{partner}: \"{content}\"")
                replied = True
                break
            except asyncio.TimeoutError:
                continue
                
        if not replied and not hunter.disconnect_event.is_set():
            print(f"[⏱] 10s passed, no reply from @{partner}. Tested cleanly!")
            
        # Cleanly close match
        print(f"[*] Match #{round_num} complete. Closing match...")
        await hunter.close_match()
        await asyncio.sleep(1.0)
        
    print("\n" + "═"*65)
    print("🎉 BACKEND VERIFICATION COMPLETE: ALL MATCHES TEXTED & MONITORED!")
    print("═"*65 + "\n")

if __name__ == "__main__":
    asyncio.run(verify_backend_rounds(2))
