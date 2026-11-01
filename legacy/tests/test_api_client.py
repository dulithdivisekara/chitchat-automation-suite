import asyncio
from chitchat_api import ChitchatClient

async def main():
    client = ChitchatClient()
    me = client.get_me()
    print("[*] Logged in user:", me.get("username"), f"(ID: {me.get('id')})")

    # Connect WebSocket
    print("[*] Connecting WebSocket...")
    await client.connect_ws()
    print("[*] WebSocket connected!")

    # Setup callbacks
    def on_match(match):
        participants = match.get("conversation", {}).get("participants", [])
        strangers = [p["profile"]["username"] for p in participants if p["profile"]["id"] != client.my_user_id]
        print(f"\n[+] Matched with: {', '.join(strangers)} (Conv ID: {match['id']})")
        # Send greeting
        print("[-] Sending 'f or m?'...")
        client.send_message(match['id'], "f or m?")

    def on_message(msg):
        print(f"\n[<] {msg.get('author', {}).get('username')}: {msg.get('content')}")

    def on_disconnect():
        print("\n[x] Stranger disconnected!")

    client.on_match_callback = on_match
    client.on_message_callback = on_message
    client.on_disconnect_callback = on_disconnect

    # Start WS listener in background
    ws_task = asyncio.create_task(client.ws_loop())

    # Check if there is an active match, if so disconnect
    active = client.get_active_match()
    if active:
        print("[*] Disconnecting previous match...")
        client.disconnect_match(next_match=False)
        await asyncio.sleep(1)

    print("[*] Starting match search...")
    client.search_match()

    # Listen for 15 seconds
    await asyncio.sleep(15)

    print("[*] Cleaning up, disconnecting match...")
    client.disconnect_match(next_match=False)
    ws_task.cancel()

asyncio.run(main())
