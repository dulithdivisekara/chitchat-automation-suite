import asyncio
import json
import uuid
import requests
import websockets
from urllib.parse import urlencode

COOKIES_FILE = "cookies.json"

class ChitchatClient:
    def __init__(self, cookies_path=COOKIES_FILE):
        with open(cookies_path, "r") as f:
            cookies_list = json.load(f)
        
        self.cookies_dict = {c["name"]: c["value"] for c in cookies_list}
        self.cookie_header = "; ".join([f"{k}={v}" for k, v in self.cookies_dict.items()])
        
        self.user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        self.base_url = "https://api.chitchat.gg"
        
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": self.user_agent,
            "Origin": "https://app.chitchat.gg",
            "Referer": "https://app.chitchat.gg/",
            "Cookie": self.cookie_header
        })

        self.ws = None
        self.ws_task = None
        self.my_user_id = None
        self.my_username = None
        self.active_match = None
        self.on_message_callback = None
        self.on_match_callback = None
        self.on_disconnect_callback = None
        self.on_typing_callback = None

    def get_me(self):
        """Fetch current user profile."""
        try:
            res = self.session.get(f"{self.base_url}/users/me", timeout=5.0)
            if res.status_code == 200:
                data = res.json()
                self.my_user_id = data.get("id")
                self.my_username = data.get("username")
                return data
        except Exception:
            pass
        return None

    def get_active_match(self):
        """Check active match status."""
        try:
            res = self.session.get(f"{self.base_url}/match/active", timeout=5.0)
            if res.status_code == 200:
                data = res.json()
                if "match" in data:
                    self.active_match = data["match"]
                    return data["match"]
        except Exception:
            pass
        self.active_match = None
        return None

    def search_match(self, with_interests=False):
        """Enter queue to search for a new stranger match."""
        try:
            res = self.session.post(
                f"{self.base_url}/match",
                json={"withInterests": with_interests},
                timeout=5.0
            )
            return res.status_code in (200, 201)
        except Exception:
            return False

    def disconnect_match(self, next_match=False):
        """Disconnect from current match."""
        try:
            res = self.session.patch(
                f"{self.base_url}/match/disconnect",
                json={"next": next_match},
                timeout=5.0
            )
            self.active_match = None
            return res.status_code in (200, 204)
        except Exception:
            self.active_match = None
            return False

    def send_message(self, conversation_id, content):
        """Send a text message to the active conversation."""
        try:
            nonce = str(uuid.uuid4())
            files = {
                "content": (None, content),
                "nonce": (None, nonce)
            }
            res = self.session.post(
                f"{self.base_url}/users/me/conversations/{conversation_id}/messages",
                files=files,
                timeout=5.0
            )
            return res.status_code in (200, 201, 204)
        except Exception:
            return False

    def send_typing(self, conversation_id):
        """Send typing indicator."""
        try:
            res = self.session.post(
                f"{self.base_url}/users/me/conversations/{conversation_id}/typing",
                json={},
                timeout=3.0
            )
            return res.status_code in (200, 201, 204)
        except Exception:
            return False

    def get_messages(self, conversation_id, limit=50):
        """Fetch message history for a conversation."""
        try:
            res = self.session.get(
                f"{self.base_url}/users/me/conversations/{conversation_id}/messages?limit={limit}&offset=0",
                timeout=5.0
            )
            if res.status_code == 200:
                return res.json()
        except Exception:
            pass
        return []

    async def connect_ws(self):
        """Connect to real-time Socket.IO WebSocket."""
        uri = f"wss://api.chitchat.gg/socket.io/?EIO=4&transport=websocket"
        headers = [
            ("Cookie", self.cookie_header),
            ("User-Agent", self.user_agent),
            ("Origin", "https://app.chitchat.gg")
        ]
        
        self.ws = await websockets.connect(uri, additional_headers=headers)
        # Receive Engine.IO handshake
        await self.ws.recv()
        # Send Socket.IO connect
        await self.ws.send("40")
        await self.ws.recv()

    async def ws_loop(self):
        """Listen to incoming real-time socket events."""
        ping_interval = 25
        last_ping = asyncio.get_event_loop().time()

        while True:
            try:
                msg = await asyncio.wait_for(self.ws.recv(), timeout=2.0)
                
                # Engine.IO ping/pong handling
                if msg == "2":
                    await self.ws.send("3")
                    continue
                elif msg == "3":
                    continue
                elif msg.startswith("2"):
                    await self.ws.send("3" + msg[1:])
                    continue
                
                # Socket.IO Event
                if msg.startswith("42"):
                    payload = json.loads(msg[2:])
                    event_name = payload[0]
                    event_data = payload[1] if len(payload) > 1 else None

                    if event_name == "matchUpdate":
                        if not event_data or not isinstance(event_data, dict):
                            continue

                        # Ignore pure queue updates (e.g. {"inQueue": true}) - NOT a match, NOT a disconnect!
                        if "inQueue" in event_data and "match" not in event_data:
                            continue

                        match_obj = event_data.get("match")
                        if match_obj and isinstance(match_obj, dict):
                            closure = match_obj.get("closure", {})
                            if closure.get("closed"):
                                # Stranger or user closed the match
                                self.active_match = None
                                if self.on_disconnect_callback:
                                    self.on_disconnect_callback()
                            else:
                                # Confirmed active match
                                self.active_match = match_obj
                                if self.on_match_callback:
                                    self.on_match_callback(match_obj)
                        else:
                            self.active_match = None
                            if self.on_disconnect_callback:
                                self.on_disconnect_callback()

                    elif event_name == "typing":
                        if event_data and isinstance(event_data, dict):
                            author_id = event_data.get("userId")
                            if author_id != self.my_user_id and self.on_typing_callback:
                                self.on_typing_callback(event_data)

                    elif event_name == "chatMessage":
                        if event_data and "message" in event_data:
                            msg_obj = event_data["message"]
                            author_id = msg_obj.get("author", {}).get("id")
                            if author_id != self.my_user_id:
                                if self.on_message_callback:
                                    self.on_message_callback(msg_obj)

            except asyncio.TimeoutError:
                continue
            except websockets.exceptions.ConnectionClosed:
                print("[WS] Connection closed, reconnecting...")
                await asyncio.sleep(1.5)
                try:
                    await self.connect_ws()
                    print("[WS] Reconnected successfully!")
                    if self.on_disconnect_callback:
                        self.on_disconnect_callback()
                except Exception as e:
                    print(f"[WS] Reconnect failed: {e}")
                    await asyncio.sleep(2)
            except Exception as e:
                # Ignore transient parsing errors
                continue
