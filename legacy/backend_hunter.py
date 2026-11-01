import asyncio
import os
import re
import sys
import subprocess
from chitchat_api import ChitchatClient

def play_alert_sound():
    try:
        subprocess.Popen(
            "canberra-gtk-play -i message || pw-play /usr/share/sounds/freedesktop/stereo/complete.oga || printf '\\a'",
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception:
        sys.stdout.write('\a')
        sys.stdout.flush()

def send_desktop_notification(title, message):
    try:
        safe_title = title.replace('"', '\\"')
        safe_msg = message.replace('"', '\\"')
        subprocess.Popen(
            f'notify-send -u critical -t 15000 "{safe_title}" "{safe_msg}"',
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception:
        pass

def classify_gender(text):
    clean = text.lower().strip()

    # 1. Counter questions first
    if re.search(r"(^|\b)(u\?|you\?|wbu|what\s+about\s+you|f\s+or\s+m|m\s+or\s+f|m/f|f/m)", clean):
        return "counter"

    # 2. Negative checks
    if re.search(r"\bnot\s+(a\s+)?(girl|female|woman|f\b)", clean):
        return "male"
    if re.search(r"\bnot\s+(a\s+)?(boy|guy|man|male|m\b)", clean):
        return "female"

    # 3. Female checks
    if re.search(r"(^|\b)(f|female|girl|woman|gurl|gril|fem)($|\b)", clean):
        return "female"
    if re.search(r"(^|\b)(\d{1,2}\s*f|f\s*\d{1,2}|f4m|f4a)($|\b)", clean):
        return "female"
    if re.search(r"\b(i\x27m|im|i\s*am)\s+(a\s+)?(girl|female|woman|fem|f)\b", clean):
        return "female"

    # 4. Male checks
    if re.search(r"(^|\b)(m|male|boy|guy|man|bro|dude|cock|dick|femboy)($|\b)", clean):
        return "male"
    if re.search(r"(^|\b)(m\d{1,2}|\d{1,2}m|m\s*\d{1,2}|\d{1,2}\s*m|m4f|m4m|m4a)", clean):
        return "male"
    if re.search(r"\b(i\x27m|im|i\s*am)\s+(a\s+)?(boy|guy|man|male|dude|m)\b", clean):
        return "male"

    # 5. Greetings
    if re.fullmatch(r"(hi+|hey+|yo+|hello+|sup+|wassup|hii+|heyy+)[!?.]*", clean):
        return "greeting"

    return "unknown"

def is_male_username(username):
    lower = username.lower()
    if re.search(r"\b(m|male|boy|guy|man|bro|dude)\b", lower):
        return True
    if re.search(r"(\(m\)|\(male\)|-m-|\bm\b|\bbro\b|\bguy\b)", lower):
        return True
    return False

class AutoResponder:
    """Natural conversational persona acting as the user with casual English texting slang."""
    def __init__(self):
        self.step = 0

    def reset(self):
        self.step = 0

    def generate_reply(self, message):
        lower = message.lower().strip()
        self.step += 1

        if any(w in lower for w in ['where u from', 'where from', 'where r u from', 'location']):
            return "from sri lanka! wbu, where u from?"

        if any(w in lower for w in ['how old', 'age', 'ur age']):
            return "20, hbu?"

        if any(w in lower for w in ['wyd', 'what u doing', 'what r u doing', 'up to']):
            return "just chilling listening to music haha, wyd?"

        if any(w in lower for w in ['hyd', 'how r u', 'how are you', 'how u doing']):
            return "doing good! just bored haha. how's your night?"

        if self.step == 1:
            return "heyy, where u from?"
        elif self.step == 2:
            return "nice! what u up to tonight?"
        elif self.step == 3:
            return "haha cool. what kind of music or hobbies u into?"
        else:
            return "haha fr, that's pretty cool ngl"

class BackendHunter:
    def __init__(self):
        self.client = ChitchatClient()
        self.responder = AutoResponder()
        self.active_conv_id = None
        self.partner_username = None
        self.is_hunting = True
        self.girl_matched = False
        self.stats = {"checked": 0, "males": 0, "girls": 0, "timeouts": 0}
        self.message_queue = asyncio.Queue()
        self.state_event = asyncio.Event()

    async def init(self):
        os.system('clear' if os.name == 'posix' else 'cls')
        print("╔═════════════════════════════════════════════════════════════╗")
        print("║      CHITCHAT DIRECT BACKEND BOT & SMART GIRL FILTER        ║")
        print("╚═════════════════════════════════════════════════════════════╝\n")
        print("[*] Connecting via WebSocket & REST API (Zero browser overhead)...")
        
        me = self.client.get_me()
        if not me:
            print("[!] Authentication failed. Please check your cookies.")
            sys.exit(1)

        print(f"[*] Logged in as: {me.get('username')} (ID: {me.get('id')})")
        await self.client.connect_ws()
        print("[*] WebSocket connected!")

        self.client.on_match_callback = self.on_match
        self.client.on_message_callback = self.on_message
        self.client.on_disconnect_callback = self.on_disconnect

        asyncio.create_task(self.client.ws_loop())

        active = self.client.get_active_match()
        if active:
            print("[*] Cleaning up existing match...")
            self.client.disconnect_match(next_match=False)
            await asyncio.sleep(1)

    def on_match(self, match):
        self.active_conv_id = match.get("id")
        participants = match.get("conversation", {}).get("participants", [])
        strangers = [p["profile"]["username"] for p in participants if p["profile"]["id"] != self.client.my_user_id]
        self.partner_username = strangers[0] if strangers else "Stranger"
        self.responder.reset()
        self.state_event.set()

    def on_message(self, msg):
        asyncio.create_task(self.message_queue.put(msg))

    def on_disconnect(self):
        self.active_conv_id = None
        self.partner_username = None
        self.state_event.set()

    async def user_chat_loop(self):
        loop = asyncio.get_event_loop()
        auto_chat = False

        print("\n" + "═"*60)
        print("💬 [INTERACTIVE CHAT READY] You can chat with her right here!")
        print("👉 Just type your message and press Enter.")
        print("👉 Commands: 'next' (find next girl), 'auto' (toggle AI chat), 'exit' (quit)")
        print("═"*60 + "\n")

        while self.girl_matched and self.active_conv_id:
            try:
                msg = await asyncio.wait_for(self.message_queue.get(), timeout=0.5)
                content = msg.get("content", "")
                author = msg.get("author", {}).get("username", self.partner_username)
                print(f"\n[< {author}]: {content}")
                play_alert_sound()

                if auto_chat:
                    await asyncio.sleep(1.5)
                    reply = self.responder.generate_reply(content)
                    self.client.send_message(self.active_conv_id, reply)
                    print(f"[You (AI)]: {reply}")

            except asyncio.TimeoutError:
                pass

            try:
                line = await asyncio.wait_for(loop.run_in_executor(None, sys.stdin.readline), timeout=0.1)
                text = line.strip()
                if not text:
                    continue

                if text.lower() in ("next", "skip"):
                    print("[*] Skipping to next stranger...")
                    self.girl_matched = False
                    self.client.disconnect_match(next_match=False)
                    break
                elif text.lower() == "auto":
                    auto_chat = not auto_chat
                    print(f"[*] AI Auto-Chat: {'ENABLED' if auto_chat else 'DISABLED'}")
                elif text.lower() in ("exit", "quit"):
                    print("[*] Exiting...")
                    self.is_hunting = False
                    self.client.disconnect_match(next_match=False)
                    break
                else:
                    self.client.send_message(self.active_conv_id, text)
                    print(f"[You]: {text}")

            except asyncio.TimeoutError:
                continue

    async def hunt_single(self):
        self.stats["checked"] += 1
        print(f"\n────────────────── [ Hunt #{self.stats['checked']} ] ──────────────────")
        
        while not self.message_queue.empty():
            self.message_queue.get_nowait()

        self.state_event.clear()
        self.client.search_match()
        
        try:
            await asyncio.wait_for(self.state_event.wait(), timeout=15.0)
        except asyncio.TimeoutError:
            print("[⏱] Matching timed out, retrying...")
            return

        if not self.active_conv_id:
            return

        partner = self.partner_username or "Stranger"
        print(f"[*] Matched with: @{partner}!")

        # Instant male username check
        if is_male_username(partner):
            print(f"[SKIP] Male keyword in username (@{partner}). Skipping immediately!")
            self.stats["males"] += 1
            self.client.disconnect_match(next_match=False)
            return

        print("[-] Sending screening question: 'f or m?'")
        self.client.send_message(self.active_conv_id, "f or m?")

        start_time = asyncio.get_event_loop().time()
        answered = False
        handled_counter = False
        handled_greeting = False

        while asyncio.get_event_loop().time() - start_time < 12.0:
            try:
                msg = await asyncio.wait_for(self.message_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                if not self.active_conv_id:
                    print("[x] Stranger disconnected.")
                    answered = True
                    break
                continue

            content = msg.get("content", "").strip()
            author = msg.get("author", {}).get("username", self.partner_username)
            print(f"[Stranger]: \"{content}\"")

            gender = classify_gender(content)

            if gender == "female":
                self.stats["girls"] += 1
                answered = True
                self.girl_matched = True
                play_alert_sound()
                send_desktop_notification(
                    "💖 GIRL FOUND ON CHITCHAT!",
                    f"Stranger (@{author}): \"{content}\"\nTake over the chat now!"
                )
                print("\n" + "╔"*35)
                print(f"🎉 GIRL DETECTED! Stranger (@{author}): \"{content}\"")
                print("╚"*35)

                icebreaker = "heyy, where u from?"
                self.client.send_message(self.active_conv_id, icebreaker)
                print(f"[You (Icebreaker)]: {icebreaker}")

                await self.user_chat_loop()
                break

            elif gender == "male":
                self.stats["males"] += 1
                print(f"[SKIP] Male detected (\"{content}\"). Skipping instantly...")
                self.client.disconnect_match(next_match=False)
                answered = True
                break

            elif gender == "counter" and not handled_counter:
                handled_counter = True
                print("[?] Stranger asked back, replying: '20m u?'")
                self.client.send_message(self.active_conv_id, "20m u?")

            elif gender == "greeting" and not handled_greeting:
                handled_greeting = True
                print(f"[?] Stranger greeted (\"{content}\"), prompting: 'hey! f or m? :)'")
                self.client.send_message(self.active_conv_id, "hey! f or m? :)")

        if not answered:
            print(f"[⏱] Timeout (no response from @{partner}). Skipping...")
            self.stats["timeouts"] += 1
            self.client.disconnect_match(next_match=False)

        print(f"[Stats] Checked: {self.stats['checked']} | Males Skipped: {self.stats['males']} | Girls Matched: {self.stats['girls']} | Timeouts: {self.stats['timeouts']}")
        await asyncio.sleep(0.5)

    async def run(self):
        await self.init()
        while self.is_hunting:
            await self.hunt_single()

        print("[*] Hunter finished. Cleaning up...")
        self.client.disconnect_match(next_match=False)

if __name__ == "__main__":
    hunter = BackendHunter()
    try:
        asyncio.run(hunter.run())
    except KeyboardInterrupt:
        print("\n[*] Stopped by user.")
