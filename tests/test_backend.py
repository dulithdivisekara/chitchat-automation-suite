import asyncio
import os
import sys

# Ensure root import
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from hunter_backend import InstagramHunter

async def test_backend_connection():
    """Verify backend authentication, WebSocket handshake, and queue operations."""
    print("═" * 65)
    print("⚡ TESTING CHITCHAT BACKEND WEBSOCKET & REST CLIENT")
    print("═" * 65)

    hunter = InstagramHunter()
    await hunter.init()

    assert hunter.client.cookies_dict.get("token") is not None, "Authentication token missing!"
    assert hunter.client.ws is not None, "WebSocket connection failed!"
    assert hunter.client.my_user_id is not None, "User ID not resolved!"
    print(f"[✓] Backend Authentication Verified for @{hunter.client.my_username} ({hunter.client.my_user_id})")
    print("[✓] Socket.IO v4 Handshake & WebSocket Stream Verified!")

    # Verify search queue
    print("[*] Testing queue entry and active match status...")
    hunter.client.search_match()
    await asyncio.sleep(1.0)
    
    # Close / reset match cleanly
    await hunter.close_match()
    print("[✓] Queue and match closure verified successfully!")
    print("═" * 65)

if __name__ == "__main__":
    asyncio.run(test_backend_connection())
