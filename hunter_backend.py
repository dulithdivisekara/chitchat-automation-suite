import asyncio
import os
import re
import sys
import subprocess
from datetime import datetime
from chitchat_api import ChitchatClient

TARGET_INSTAGRAM_COUNT = 2
STORAGE_FILE = "girls_instagram.md"

# Terminal Color codes for beautiful live viewing
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

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

    # 1. Underage safety check (Critical: skip minors immediately to protect profile)
    if re.search(r'(?:^|\b)(?:1[0-7]|underage|minor|child|kid)(?:f|m|\b)', clean):
        return "underage_skip"

    # 2. Screening questions from stranger (e.g. "m or f", "f/m")
    if re.search(r'(^|\b)(f\s*or\s*m|m\s*or\s*f|m/f|f/m)($|\b)', clean):
        return "counter"

    # 3. Negatives
    if re.search(r"\bnot\s+(a\s+)?(girl|female|woman|f\b)", clean):
        return "male"
    if re.search(r"\bnot\s+(a\s+)?(boy|guy|man|male|m\b)", clean):
        return "female"

    # 4. Female checks (e.g. "f", "19f", "f u?", "female wbu", "girl")
    if re.search(r"(^|\b)(f|female|girl|woman|gurl|gril|fem)($|\b)", clean):
        return "female"
    if re.search(r"(^|\b)(\d{1,2}\s*f|f\s*\d{1,2}|f4m|f4a)($|\b)", clean):
        return "female"
    if re.search(r"\b(i\x27m|im|i\s*am)\s+(a\s+)?(girl|female|woman|fem|f)\b", clean):
        return "female"

    # 5. Male checks (e.g. "m", "22m", "m u?", "boy", "guy")
    if re.search(r"(^|\b)(m|male|boy|guy|man|bro|dude|cock|dick|femboy)($|\b)", clean):
        return "male"
    if re.search(r"(^|\b)(m\d{1,2}|\d{1,2}m|m\s*\d{1,2}|\d{1,2}\s*m|m4f|m4m|m4a)", clean):
        return "male"
    if re.search(r"\b(i\x27m|im|i\s*am)\s+(a\s+)?(boy|guy|man|male|dude|m)\b", clean):
        return "male"

    # 6. Counter questions (only if no gender was stated)
    if re.search(r"(^|\b)(u\?|you\?|wbu|what\s+about\s+you|who\s+r\s+u|who\s+are\s+you)", clean):
        return "counter"

    # 7. Greetings
    if re.fullmatch(r"(hi+|hey+|yo+|hello+|sup+|wassup|hii+|heyy+)[!?.]*", clean):
        return "greeting"

    return "unknown"

def is_male_username(username):
    lower = username.lower()
    # Strict matching only to avoid false positive skips on random adjective-noun usernames
    if re.search(r"(^|\s|\(|-)(male|boy|dude|bro|femboy|m4f|m4m)(\s|\)|-|$)", lower):
        return True
    return False

def extract_instagram_handle(text, asked_for_insta=False):
    clean = text.strip()

    # Pattern 1: @username
    at_match = re.search(r'@([a-zA-Z0-9._]{3,30})', clean)
    if at_match:
        return at_match.group(1).strip('.')

    # Pattern 2: ig: / insta: / instagram: username
    prefix_match = re.search(r'\b(?:ig|insta|instagram)\b(?:\s*(?:is|:|is:)?\s*)(@?[a-zA-Z0-9._]{3,30})', clean, re.IGNORECASE)
    if prefix_match:
        return prefix_match.group(1).lstrip('@').strip('.')

    # Pattern 3: mine is / its / it's username
    prefix_match2 = re.search(r'\b(?:mine\s+is|its|it\x27s)\s+(@?[a-zA-Z0-9._]{3,30})', clean, re.IGNORECASE)
    if prefix_match2:
        return prefix_match2.group(1).lstrip('@').strip('.')

    # Pattern 4: If we explicitly asked for Instagram and she gave a single clean username
    if asked_for_insta:
        words = clean.split()
        if len(words) == 1:
            candidate = words[0].lstrip('@').strip('.')
            if re.match(r'^[a-zA-Z0-9._]{3,30}$', candidate):
                non_handles = {'no', 'nope', 'nah', 'none', 'dont', 'why', 'idk', 'nothing', 'chitchat', 'private', 'sure', 'yeah', 'yes', 'ok', 'okay', 'wait'}
                if candidate.lower() not in non_handles:
                    return candidate

    return None

class InstagramHunter:
    def __init__(self):
        self.client = ChitchatClient()
        self.active_conv_id = None
        self.partner_username = None
        self.match_event = asyncio.Event()
        self.disconnect_event = asyncio.Event()
        self.typing_event = asyncio.Event()
        self.message_queue = asyncio.Queue()
        self.saved_instagrams = []
        self.stats = {"checked": 0, "males": 0, "girls": 0, "timeouts": 0}

    async def init(self):
        print(f"{BOLD}{CYAN}╔═════════════════════════════════════════════════════════════╗{RESET}")
        print(f"{BOLD}{CYAN}║     CHITCHAT LIVE BACKEND HUNTER - PERSONA: SAHAN          ║{RESET}")
        print(f"{BOLD}{CYAN}╚═════════════════════════════════════════════════════════════╝{RESET}\n")
        print(f"{YELLOW}[*] Goal:{RESET} Capture {BOLD}{TARGET_INSTAGRAM_COUNT}{RESET} girls' Instagram IDs into {BOLD}{STORAGE_FILE}{RESET}")
        print(f"{YELLOW}[*] Persona:{RESET} Sahan from Sri Lanka (polite, relaxed, friendly)")
        print(f"{YELLOW}[*] Mode:{RESET} 100% Backend API & Real-time WebSocket (Zero UI overhead)\n")

        me = self.client.get_me()
        if not me:
            print(f"{RED}[!] Authentication failed. Please check cookies.json.{RESET}")
            sys.exit(1)

        print(f"{GREEN}[✓] Authenticated successfully as:{RESET} {BOLD}{me.get('username')}{RESET} (ID: {me.get('id')})")
        await self.client.connect_ws()
        print(f"{GREEN}[✓] Real-time Socket.IO connected!{RESET}\n")

        self.client.on_match_callback = self.on_match
        self.client.on_message_callback = self.on_message
        self.client.on_disconnect_callback = self.on_disconnect
        self.client.on_typing_callback = self.on_typing

        asyncio.create_task(self.client.ws_loop())

        # Cleanup any lingering match
        active = self.client.get_active_match()
        if active:
            print(f"{YELLOW}[*] Disconnecting previous session...{RESET}")
            self.client.disconnect_match(next_match=False)
            await asyncio.sleep(1)

    def on_match(self, match):
        self.active_conv_id = match.get("id")
        participants = match.get("conversation", {}).get("participants", [])
        strangers = [p["profile"]["username"] for p in participants if p["profile"]["id"] != self.client.my_user_id]
        self.partner_username = strangers[0] if strangers else "Stranger"
        self.disconnect_event.clear()
        self.match_event.set()

    def on_message(self, msg):
        asyncio.create_task(self.message_queue.put(msg))

    def on_typing(self, data):
        self.typing_event.set()

    def on_disconnect(self):
        self.disconnect_event.set()

    async def close_match(self):
        """Safely disconnect and settle lingering socket packets to prevent race conditions."""
        if self.active_conv_id:
            self.client.disconnect_match(next_match=False)
        self.active_conv_id = None
        self.partner_username = None
        self.match_event.clear()
        self.disconnect_event.clear()
        self.typing_event.clear()
        # Settle delay
        await asyncio.sleep(0.8)
        while not self.message_queue.empty():
            try:
                self.message_queue.get_nowait()
            except Exception:
                break

    async def human_send(self, text, typing_time=1.4):
        """Simulate realistic typing delay before sending message."""
        if not self.active_conv_id or self.disconnect_event.is_set():
            return
        self.client.send_typing(self.active_conv_id)
        await asyncio.sleep(typing_time)
        if not self.disconnect_event.is_set() and self.active_conv_id:
            self.client.send_message(self.active_conv_id, text)
            print(f"{CYAN}{BOLD}[You (Sahan)]:{RESET} {CYAN}\"{text}\"{RESET}")

    def record_instagram(self, handle, partner, extra_info=""):
        clean_handle = handle.lstrip('@')
        profile_url = f"https://instagram.com/{clean_handle}"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

        entry = f"| {len(self.saved_instagrams) + 1} | `@{clean_handle}` | [{clean_handle}]({profile_url}) | @{partner} | {extra_info} | {timestamp} |\n"
        
        with open(STORAGE_FILE, "a") as f:
            f.write(entry)

        self.saved_instagrams.append({
            "handle": clean_handle,
            "url": profile_url,
            "partner": partner,
            "time": timestamp
        })

        print("\n" + f"{BOLD}{GREEN}" + "★"*65)
        print(f"🎉 INSTAGRAM COLLECTED #{len(self.saved_instagrams)}: @{clean_handle}")
        print(f"🔗 Profile: {profile_url}")
        print(f"📁 Stored in: {STORAGE_FILE}")
        print("★"*65 + f"{RESET}\n")

        play_alert_sound()
        send_desktop_notification(
            f"🎉 INSTAGRAM CAPTURED: @{clean_handle}",
            f"From @{partner}\nSaved to {STORAGE_FILE}!"
        )

    async def engage_girl_for_instagram(self, initial_text, partner):
        """Converses naturally and politely as Sahan to acquire Instagram handle."""
        print(f"\n{BOLD}{MAGENTA}[💖 CHATTING WITH @{partner}]{RESET} Girl confirmed ({initial_text})")

        # Step 1: Smooth icebreaker
        await asyncio.sleep(0.8)
        # If she already mentioned where she is from (e.g., "19f ny", "f usa")
        loc_match = re.search(r'\b(ny|cali|california|texas|florida|uk|canada|germany|australia|india|london)\b', initial_text.lower())
        if loc_match:
            loc = loc_match.group(1).title()
            await self.human_send(f"heyy nice to meet u :) how's everything in {loc}?", typing_time=1.5)
        else:
            await self.human_send("heyy nice to meet u :) where u from?", typing_time=1.5)

        asked_insta = False
        convo_start = asyncio.get_event_loop().time()

        while asyncio.get_event_loop().time() - convo_start < 60.0:
            if self.disconnect_event.is_set():
                print(f"{YELLOW}[x] @{partner} disconnected.{RESET}")
                await self.close_match()
                return False

            if self.typing_event.is_set():
                self.typing_event.clear()
                convo_start = asyncio.get_event_loop().time()

            try:
                msg = await asyncio.wait_for(self.message_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            # Reset conversation timer on message receipt
            convo_start = asyncio.get_event_loop().time()

            content = msg.get("content", "").strip()
            print(f"{MAGENTA}[@{partner}]:{RESET} \"{content}\"")

            # Check if she shared Instagram
            handle = extract_instagram_handle(content, asked_for_insta=asked_insta)
            if handle:
                self.record_instagram(handle, partner, extra_info=initial_text)
                await self.human_send("awesome, just added u! talk to u there, have a great day :)", typing_time=1.2)
                await asyncio.sleep(2.0)
                await self.close_match()
                return True

            lower = content.lower()

            # Underage safety check during chat
            if re.search(r'(?:^|\b)(?:1[0-7]|underage|minor|child|kid)(?:f|m|\b)', lower):
                print(f"{RED}[SAFETY SKIP] Underage mention detected in conversation. Ending match.{RESET}")
                await self.close_match()
                return False

            # Questions she might ask about Sahan
            if re.search(r"\b(where\s+(are\s+)?(u|you)\s+from|where\s+do\s+(u|you)\s+live|ur\s+country|wbu|what\s+about\s+you)\b", lower):
                await self.human_send("i'm Sahan, from Sri Lanka! wbu?", typing_time=1.5)
                continue

            if re.search(r"\b(what\x27?s\s+ur\s+name|who\s+are\s+u|who\s+r\s+u|ur\s+name)\b", lower):
                await self.human_send("i'm Sahan :) nice to meet u! what's your name?", typing_time=1.4)
                continue

            if re.search(r"\b(how\s+old|ur\s+age|age\?)\b", lower):
                await self.human_send("i'm 20 :) wbu?", typing_time=1.2)
                continue

            if re.search(r"\b(wyd|what\s+(are\s+)?(u|you)\s+doing)\b", lower):
                await self.human_send("just chilling and listening to music haha, wbu?", typing_time=1.5)
                continue

            # Asking for Instagram
            if not asked_insta:
                await asyncio.sleep(1.0)
                await self.human_send("btw u seem really sweet haha, u got insta? drop ur @ so we can chat there :)", typing_time=1.8)
                asked_insta = True
            else:
                # If she asked back about insta
                if any(w in lower for w in ['why', 'for what']):
                    await self.human_send("chitchat disconnects randomly haha, drop ur @!", typing_time=1.4)
                elif any(w in lower for w in ['wbu', 'what about u', 'ur @', 'urs', 'what is yours']):
                    await self.human_send("i'll follow u right now! what's your @?", typing_time=1.3)
                else:
                    await self.human_send("what's your @? :)", typing_time=1.0)

        print(f"{YELLOW}[-] Conversation timed out with @{partner}. Moving to next match.{RESET}")
        await self.close_match()
        return False

    async def hunt_single(self):
        self.stats["checked"] += 1
        print(f"\n{BOLD}────────────────── [ Match #{self.stats['checked']} ] ──────────────────{RESET}")

        # Ensure clean state before queuing
        await self.close_match()

        self.match_event.clear()
        self.disconnect_event.clear()

        # Enter matching queue
        queued = self.client.search_match()
        if not queued:
            print(f"{YELLOW}[⏱] Queue busy or rate-limited, retrying shortly...{RESET}")
            await asyncio.sleep(1.0)
            return

        try:
            await asyncio.wait_for(self.match_event.wait(), timeout=20.0)
        except asyncio.TimeoutError:
            print(f"{YELLOW}[⏱] Match queue timed out, retrying...{RESET}")
            await self.close_match()
            return

        if not self.active_conv_id:
            await self.close_match()
            return

        # Clear any residual disconnect flag for this fresh match
        self.disconnect_event.clear()

        partner = self.partner_username or "Stranger"
        print(f"{YELLOW}[*] Connected with:{RESET} {BOLD}@{partner}{RESET}")

        # 1. Instant username check
        if is_male_username(partner):
            print(f"{RED}[⚡ SKIP] Male keyword in username (@{partner}). Skipping immediately!{RESET}")
            self.stats["males"] += 1
            await self.close_match()
            return

        # Fast human pause to ensure text is sent before quick-skippers leave
        await asyncio.sleep(0.5)

        # 2. Screening Question
        await self.human_send("f or m?", typing_time=0.6)

        # 3. Monitor screening reply (up to 18s for slow mobile typers)
        start_time = asyncio.get_event_loop().time()
        handled_counter = False
        handled_greeting = False
        asked_if_girl = False
        is_answered = False

        while asyncio.get_event_loop().time() - start_time < 18.0:
            if self.disconnect_event.is_set():
                print(f"{YELLOW}[x] Stranger disconnected.{RESET}")
                is_answered = True
                break

            if self.typing_event.is_set():
                self.typing_event.clear()
                print(f"{CYAN}[*] @{partner} is typing... (extending timeout){RESET}")
                start_time = asyncio.get_event_loop().time()

            try:
                msg = await asyncio.wait_for(self.message_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            content = msg.get("content", "").strip()
            print(f"{MAGENTA}[@{partner}]:{RESET} \"{content}\"")

            gender = classify_gender(content)

            if gender == "female":
                self.stats["girls"] += 1
                is_answered = True
                await self.engage_girl_for_instagram(content, partner)
                break

            elif gender == "male":
                self.stats["males"] += 1
                is_answered = True
                print(f"{RED}[⚡ SKIP] Male detected (\"{content}\"). Skipping immediately...{RESET}")
                await self.close_match()
                break

            elif gender == "underage_skip":
                print(f"{RED}[🛡️ SAFETY SKIP] Underage detected (\"{content}\"). Skipping immediately!{RESET}")
                is_answered = True
                await self.close_match()
                break

            elif asked_if_girl and re.search(r"^(yes|yeah|yep|yea|mhm|ya|yup)$", content.lower().strip()):
                self.stats["girls"] += 1
                is_answered = True
                await self.engage_girl_for_instagram("girl", partner)
                break

            elif re.search(r"\b(pic|photo|avatar|pfp|profile)\b", content.lower()) and not asked_if_girl:
                asked_if_girl = True
                await self.human_send("haha it won't load for me! u a girl? :)", typing_time=1.0)

            elif re.search(r"^(1[89]|[2-9][0-9])$", content.strip()) and not asked_if_girl:
                asked_if_girl = True
                await self.human_send("nice! u a girl? :)", typing_time=0.9)

            elif gender == "counter" and not handled_counter:
                handled_counter = True
                await self.human_send("m, Sahan here :) u?", typing_time=1.0)

            elif gender == "greeting" and not handled_greeting:
                handled_greeting = True
                await self.human_send("hey! f or m? :)", typing_time=0.9)

        if not is_answered:
            print(f"{YELLOW}[⏱] No reply from @{partner}. Skipping...{RESET}")
            self.stats["timeouts"] += 1
            await self.close_match()

        print(f"{BOLD}[Status] Captured: {GREEN}{len(self.saved_instagrams)}/{TARGET_INSTAGRAM_COUNT}{RESET}{BOLD} | Males Skipped: {self.stats['males']} | Girls Matched: {self.stats['girls']}{RESET}")

    async def run(self):
        await self.init()
        while len(self.saved_instagrams) < TARGET_INSTAGRAM_COUNT:
            await self.hunt_single()
            await asyncio.sleep(0.8)

        print("\n" + f"{BOLD}{GREEN}" + "═"*65)
        print(f"🎯 MISSION ACCOMPLISHED! Successfully collected {len(self.saved_instagrams)} Instagram IDs.")
        print(f"📁 All profiles saved in: {STORAGE_FILE}")
        print("═"*65 + f"{RESET}\n")
        for idx, item in enumerate(self.saved_instagrams, 1):
            print(f"{idx}. {BOLD}@{item['handle']}{RESET} -> {item['url']} (From @{item['partner']})")

        self.client.disconnect_match(next_match=False)

if __name__ == "__main__":
    hunter = InstagramHunter()
    try:
        asyncio.run(hunter.run())
    except KeyboardInterrupt:
        print(f"\n{YELLOW}[*] Stopped by user.{RESET}")
