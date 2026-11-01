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

# ─────────────────────────────────────────────────────────────
# 1. Demographic & Gender Classifiers
# ─────────────────────────────────────────────────────────────

MALE_KEYWORDS = {
    "guy", "dude", "bro", "boy", "boyz", "man", "men", "male", "fella", "dawg",
    "gentleman", "chad", "lad", "mr", "sir", "king", "prince", "lord", "daddy",
    "dad", "father", "son", "femboy", "m4f", "m4m", "m4a", "broy", "subdude", "cock", "dick"
}

COMMON_MALE_NAMES = {
    "alex", "adam", "andrew", "anthony", "ben", "brandon", "brian", "chris",
    "christian", "cody", "daniel", "david", "dylan", "eric", "ethan", "george",
    "jack", "jackson", "jacob", "james", "jason", "john", "johnny", "jordan",
    "josh", "joshua", "justin", "kevin", "kyle", "lucas", "luke", "mark",
    "matt", "matthew", "max", "michael", "mikey", "nathan", "nick", "noah",
    "omar", "patrick", "paul", "peter", "ryan", "sam", "sean", "stephen",
    "thomas", "tyler", "william", "zach", "zack", "ali", "ahmed", "mohamed",
    "baker", "srijal", "dadbod", "steve", "tom", "tim", "robert", "richard"
}

FEMALE_KEYWORDS = {
    "girl", "girlz", "girly", "female", "woman", "women", "lady", "queen",
    "princess", "miss", "ms", "mrs", "chick", "babe", "shawty", "f4m", "f4a",
    "femme", "she", "her"
}

COMMON_FEMALE_NAMES = {
    "emma", "olivia", "ava", "isabella", "sophia", "mia", "charlotte", "amelia",
    "harper", "evelyn", "abigail", "emily", "elizabeth", "mila", "ella", "avery",
    "sofia", "camila", "aria", "scarlett", "victoria", "madison", "luna", "grace",
    "chloe", "penelope", "layla", "riley", "zoey", "nora", "lily", "eleanor",
    "hannah", "lillian", "addison", "aubrey", "ellie", "stella", "natalie", "zoe",
    "leah", "hazel", "violet", "aurora", "savannah", "audrey", "brooklyn", "bella",
    "claire", "skylar", "sarah", "lucy", "anna", "maya", "sara", "elena", "alice"
}

COUNTRIES_AND_PLACES = {
    "usa": "USA", "us": "USA", "america": "USA", "united states": "USA",
    "cali": "California, USA", "california": "California, USA", "ny": "New York, USA",
    "new york": "New York, USA", "texas": "Texas, USA", "florida": "Florida, USA",
    "uk": "United Kingdom", "london": "London, UK", "england": "England, UK",
    "canada": "Canada", "toronto": "Toronto, Canada", "vancouver": "Vancouver, Canada",
    "australia": "Australia", "sydney": "Sydney, Australia", "melbourne": "Melbourne, Australia",
    "germany": "Germany", "berlin": "Berlin, Germany", "france": "France", "paris": "Paris, France",
    "india": "India", "delhi": "Delhi, India", "mumbai": "Mumbai, India",
    "sri lanka": "Sri Lanka", "colombo": "Colombo, Sri Lanka",
    "italy": "Italy", "spain": "Spain", "netherlands": "Netherlands",
    "philippines": "Philippines", "brazil": "Brazil", "japan": "Japan",
    "sweden": "Sweden", "norway": "Norway", "new zealand": "New Zealand"
}

def is_male_username(username):
    raw = username.strip()
    clean = re.sub(r'[^\w\s]', ' ', raw)
    tokens = [t.lower() for t in clean.split() if t]

    for t in tokens:
        if t in MALE_KEYWORDS or t in COMMON_MALE_NAMES:
            return True
        if re.fullmatch(r'm\d{1,2}|\d{1,2}m|m', t):
            return True

    lower = raw.lower()
    if re.search(r'\b(m|male)\b', lower):
        return True
    if re.search(r'(guy|dude|boy|dawg|femboy|dadbod)', lower):
        return True
    if re.search(r'[a-z]Man\b', raw) or (re.search(r'\bman\b', lower) and not re.search(r'\b(woman|human|german)\b', lower)):
        return True

    return False

def is_female_username(username):
    raw = username.strip()
    clean = re.sub(r'[^\w\s]', ' ', raw)
    tokens = [t.lower() for t in clean.split() if t]

    for t in tokens:
        if t in FEMALE_KEYWORDS or t in COMMON_FEMALE_NAMES:
            return True
        if re.fullmatch(r'f\d{1,2}|\d{1,2}f|f', t):
            return True

    lower = raw.lower()
    if re.search(r'\b(female|girl|girly|queen|princess|lady)\b', lower):
        return True
    return False

def classify_gender(text):
    clean = text.lower().strip()

    # 1. Underage safety check (Immediate termination)
    if re.search(r'(?:^|\b)(?:1[0-7]|underage|minor|child|kid)(?:f|m|\b)', clean):
        return "underage_skip"

    # 2. Counter screening questions from stranger
    if re.search(r'(^|\b)(f\s*or\s*m|m\s*or\s*f|m/f|f/m)($|\b)', clean):
        return "counter"

    # 3. Negatives
    if re.search(r"\bnot\s+(a\s+)?(girl|female|woman|f\b)", clean):
        return "male"
    if re.search(r"\bnot\s+(a\s+)?(boy|guy|man|male|m\b)", clean):
        return "female"

    # 4. Female checks
    if re.search(r"(^|\b)(f|female|girl|woman|gurl|gril|fem)($|\b)", clean):
        return "female"
    if re.search(r"(^|\b)(\d{1,2}\s*f|f\s*\d{1,2}|f4m|f4a)($|\b)", clean):
        return "female"
    if re.search(r"\b(i\x27m|im|i\s*am)\s+(a\s+)?(girl|female|woman|fem|f)\b", clean):
        return "female"

    # 5. Male checks
    if re.search(r"(^|\b)(m|male|boy|guy|man|bro|dude|cock|dick|femboy)($|\b)", clean):
        return "male"
    if re.search(r"(^|\b)(m\d{1,2}|\d{1,2}m|m\s*\d{1,2}|\d{1,2}\s*m|m4f|m4m|m4a)", clean):
        return "male"
    if re.search(r"\b(i\x27m|im|i\s*am)\s+(a\s+)?(boy|guy|man|male|dude|m)\b", clean):
        return "male"

    # 6. Counter questions
    if re.search(r"(^|\b)(u\?|you\?|wbu|what\s+about\s+you|who\s+r\s+u|who\s+are\s+you)", clean):
        return "counter"

    # 7. Greetings
    if re.fullmatch(r"(hi+|hey+|yo+|hello+|sup+|wassup|hii+|heyy+)[!?.]*", clean):
        return "greeting"

    return "unknown"

def extract_metadata_from_convo(messages):
    data = {
        "age": "N/A",
        "location": "N/A",
        "interests": "Casual Chat",
        "notes": "Pleasant conversation"
    }

    full_text = " ".join(messages).lower()

    # 1. Age extraction
    age_match = re.search(r'\b(1[89]|[2-5][0-9])\s*(?:yo|y/o|years?\s*old|f\b|\b)', full_text)
    if age_match:
        data["age"] = age_match.group(1)

    # 2. Location extraction
    for place_key, place_name in COUNTRIES_AND_PLACES.items():
        if re.search(r'\b' + re.escape(place_key) + r'\b', full_text):
            data["location"] = place_name
            break

    # 3. Interests extraction
    interest_map = {
        "Music": ["song", "music", "listen", "band", "spotify", "taylor", "pop", "indie", "rock", "hip hop"],
        "Student": ["study", "studying", "college", "uni", "university", "school", "exam", "class"],
        "Gaming": ["game", "gaming", "valorant", "minecraft", "roblox", "fortnite", "playstation", "xbox"],
        "Art": ["art", "draw", "drawing", "paint", "painting", "design"],
        "Fitness": ["gym", "workout", "fitness", "training", "run", "running"],
        "Reading": ["read", "reading", "book", "books", "novel"],
        "Movies & Shows": ["netflix", "movie", "movies", "show", "anime", "watch"]
    }

    found = []
    for category, kw_list in interest_map.items():
        if any(re.search(r'\b' + kw + r'\b', full_text) for kw in kw_list):
            found.append(category)

    if found:
        data["interests"] = ", ".join(found)

    return data

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


# ─────────────────────────────────────────────────────────────
# 2. Instagram Hunter Engine
# ─────────────────────────────────────────────────────────────

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
        print(f"{YELLOW}[*] Persona:{RESET} Sahan from Sri Lanka (friendly, polite, respectful)")
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

    def on_match(self, match):
        conv = match.get("conversation", {})
        self.active_conv_id = conv.get("id")
        participants = conv.get("participants", [])

        self.partner_username = None
        for p in participants:
            prof = p.get("profile", {})
            if prof.get("id") != self.client.my_user_id:
                self.partner_username = prof.get("username")
                break

        self.match_event.set()

    def on_message(self, msg):
        asyncio.create_task(self.message_queue.put(msg))

    def on_typing(self, data):
        self.typing_event.set()

    def on_disconnect(self):
        self.disconnect_event.set()

    async def close_match(self):
        self.client.disconnect_match()
        self.active_conv_id = None
        self.partner_username = None
        self.match_event.clear()
        self.disconnect_event.clear()
        self.typing_event.clear()
        await asyncio.sleep(0.6)
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

    def record_instagram(self, handle, partner, convo_history, initial_text=""):
        clean_handle = handle.lstrip('@')
        profile_url = f"https://instagram.com/{clean_handle}"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

        metadata = extract_metadata_from_convo(convo_history)
        age = metadata["age"]
        location = metadata["location"]
        interests = metadata["interests"]
        notes = f"Initial: {initial_text}" if initial_text else "Natural conversation"

        entry = f"| {len(self.saved_instagrams) + 1} | `@{clean_handle}` | [{clean_handle}]({profile_url}) | @{partner} | {age} | {location} | {interests} | {notes} | {timestamp} |\n"

        with open(STORAGE_FILE, "a") as f:
            f.write(entry)

        self.saved_instagrams.append({
            "handle": clean_handle,
            "url": profile_url,
            "partner": partner,
            "age": age,
            "location": location,
            "interests": interests,
            "time": timestamp
        })

        print("\n" + f"{BOLD}{GREEN}" + "★" * 65)
        print(f"🎉 INSTAGRAM COLLECTED #{len(self.saved_instagrams)}: @{clean_handle}")
        print(f"🔗 Profile: {profile_url}")
        print(f"📍 Location: {location} | Age: {age} | Interests: {interests}")
        print(f"📁 Stored in: {STORAGE_FILE}")
        print("★" * 65 + f"{RESET}\n")

        play_alert_sound()
        send_desktop_notification(
            f"🎉 INSTAGRAM CAPTURED: @{clean_handle}",
            f"From @{partner} ({location})\nSaved to {STORAGE_FILE}!"
        )

    async def engage_girl_for_instagram(self, initial_text, partner):
        """Converses naturally, empathetically, and politely as Sahan to acquire Instagram handle."""
        print(f"\n{BOLD}{MAGENTA}[💖 CHATTING WITH @{partner}]{RESET} Girl confirmed ({initial_text})")

        convo_history = [initial_text]
        asked_insta = False
        convo_stage = 1  # 1: Origin/location, 2: Activity/hobbies, 3: Instagram ask
        convo_start = asyncio.get_event_loop().time()

        # Step 1: Smooth, casual icebreaker
        await asyncio.sleep(0.8)
        loc_match = re.search(r'\b(ny|cali|california|texas|florida|uk|canada|germany|australia|india|london)\b', initial_text.lower())
        if loc_match:
            loc = loc_match.group(1).title()
            await self.human_send(f"heyy nice to meet u :) how's everything over in {loc}?", typing_time=1.4)
            convo_stage = 2
        else:
            await self.human_send("heyy nice to meet u :) where are u from?", typing_time=1.4)

        while asyncio.get_event_loop().time() - convo_start < 70.0:
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

            convo_start = asyncio.get_event_loop().time()
            content = msg.get("content", "").strip()
            convo_history.append(content)
            print(f"{MAGENTA}[@{partner}]:{RESET} \"{content}\"")

            # Check if she provided Instagram handle
            handle = extract_instagram_handle(content, asked_for_insta=asked_insta)
            if handle:
                self.record_instagram(handle, partner, convo_history, initial_text=initial_text)
                await self.human_send("awesome, just added u! talk to u there, have a wonderful day :)", typing_time=1.2)
                await asyncio.sleep(2.0)
                await self.close_match()
                return True

            lower = content.lower()

            # Safety check
            if re.search(r'(?:^|\b)(?:1[0-7]|underage|minor|child|kid)(?:f|m|\b)', lower):
                print(f"{RED}[SAFETY SKIP] Underage mention detected in conversation. Ending match.{RESET}")
                await self.close_match()
                return False

            # Inquiries about Sahan
            if re.search(r"\b(where\s+(are\s+)?(u|you)\s+from|where\s+do\s+(u|you)\s+live|ur\s+country|wbu|what\s+about\s+you)\b", lower):
                await self.human_send("i'm Sahan, from Sri Lanka! wbu?", typing_time=1.3)
                continue

            if re.search(r"\b(what\x27?s\s+ur\s+name|who\s+are\s+u|who\s+r\s+u|ur\s+name)\b", lower):
                await self.human_send("i'm Sahan :) what's your name?", typing_time=1.2)
                continue

            if re.search(r"\b(how\s+old|ur\s+age|age\?)\b", lower):
                await self.human_send("i'm 20 :) wbu?", typing_time=1.1)
                continue

            if re.search(r"\b(wyd|what\s+(are\s+)?(u|you)\s+doing)\b", lower):
                await self.human_send("just chilling and listening to music haha, wbu?", typing_time=1.3)
                continue

            # Stage-based organic progression
            if convo_stage == 1:
                # She answered where she is from
                await asyncio.sleep(0.8)
                await self.human_send("oh that's really cool! what are u up to today? studying, working or just chilling haha", typing_time=1.6)
                convo_stage = 2

            elif convo_stage == 2:
                # She answered about her day
                await asyncio.sleep(1.0)
                # Gentle, respectful Instagram bridge
                await self.human_send("haha you're really fun to talk to, honestly chitchat always disconnects people randomly lol. do u have an insta so we don't lose touch? only if u're comfortable of course :)", typing_time=2.0)
                asked_insta = True
                convo_stage = 3

            elif convo_stage == 3:
                # Handling reactions to the Instagram ask
                if any(w in lower for w in ['why', 'for what', 'reason']):
                    await self.human_send("chitchat drops connection randomly haha, just thought you had great vibes! what's ur @? i'll just say hi :)", typing_time=1.5)
                elif any(w in lower for w in ['wbu', 'what about u', 'ur @', 'urs', 'what is yours']):
                    await self.human_send("i'll follow u right now! what's your @? :)", typing_time=1.3)
                elif any(w in lower for w in ['no', 'nah', 'dont have', 'don\x27t have', 'private', 'idk']):
                    await self.human_send("haha no worries at all, totally respect that! hope you have a great day :)", typing_time=1.2)
                    await asyncio.sleep(1.5)
                    await self.close_match()
                    return False
                else:
                    await self.human_send("what's your @? :)", typing_time=1.0)

        print(f"{YELLOW}[-] Conversation timed out with @{partner}. Moving to next match.{RESET}")
        await self.close_match()
        return False

    async def hunt_single(self):
        self.stats["checked"] += 1
        print(f"\n{BOLD}────────────────── [ Match #{self.stats['checked']} ] ──────────────────{RESET}")

        await self.close_match()
        self.match_event.clear()
        self.disconnect_event.clear()

        # Enter matching queue
        queued = self.client.search_match()
        if not queued:
            print(f"{YELLOW}[⏱] Queue busy, retrying shortly...{RESET}")
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

        self.disconnect_event.clear()
        partner = self.partner_username or "Stranger"
        print(f"{YELLOW}[*] Connected with:{RESET} {BOLD}@{partner}{RESET}")

        # 1. Instant username check (Male)
        if is_male_username(partner):
            print(f"{RED}[⚡ SKIP] Male indicator in username (@{partner}). Skipping immediately!{RESET}")
            self.stats["males"] += 1
            await self.close_match()
            return

        # 2. Instant username check (Female)
        if is_female_username(partner):
            print(f"{MAGENTA}[💖 FEMALE USERNAME DETECTED: @{partner}]{RESET}")
            self.stats["girls"] += 1
            await self.engage_girl_for_instagram(f"username: @{partner}", partner)
            return

        # 3. Neutral Username: Friendly, organic opening greeting
        await asyncio.sleep(0.5)
        await self.human_send("heyy :) how's your day going?", typing_time=0.8)

        # 4. Monitor reply (up to 18s, dynamically extended on typing)
        start_time = asyncio.get_event_loop().time()
        handled_greeting = False
        handled_counter = False
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

            elif gender == "counter" and not handled_counter:
                handled_counter = True
                await self.human_send("i'm a guy, Sahan :) what about u?", typing_time=1.0)

            elif (gender == "greeting" or any(w in content.lower() for w in ['good', 'fine', 'ok', 'chilling', 'bored', 'well', 'nothing'])) and not handled_greeting:
                handled_greeting = True
                await self.human_send("pretty good! i'm Sahan btw :) r u a boy or a girl? don't wanna assume haha", typing_time=1.2)

            elif re.search(r"\b(girl|female|woman)\b", content.lower()):
                self.stats["girls"] += 1
                is_answered = True
                await self.engage_girl_for_instagram(content, partner)
                break

            elif re.search(r"\b(boy|guy|man|male)\b", content.lower()):
                self.stats["males"] += 1
                is_answered = True
                print(f"{RED}[⚡ SKIP] Male detected (\"{content}\"). Skipping immediately...{RESET}")
                await self.close_match()
                break

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

        print("\n" + f"{BOLD}{GREEN}" + "═" * 65)
        print(f"🎉 GOAL ACHIEVED: {len(self.saved_instagrams)}/{TARGET_INSTAGRAM_COUNT} INSTAGRAM PROFILES CAPTURED!")
        print(f"📁 Check {STORAGE_FILE} for full details and links.")
        print("═" * 65 + f"{RESET}\n")

if __name__ == "__main__":
    hunter = InstagramHunter()
    try:
        asyncio.run(hunter.run())
    except KeyboardInterrupt:
        print(f"\n{YELLOW}[*] Stopped by user.{RESET}")
        sys.exit(0)
