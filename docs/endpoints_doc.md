# Complete Chitchat.gg Backend Architecture & API Map

This document completely reverse-engineers the entire backend of Chitchat.gg, allowing you to trigger any feature directly via REST API or WebSocket without using any browser or frontend.

---

## 1. Quick Architecture Summary

* **Base URL:** `https://api.chitchat.gg`
* **Real-Time WebSocket:** `wss://api.chitchat.gg/socket.io/?EIO=4&transport=websocket`
* **Protocol:** Socket.IO v4 over Engine.IO 4
* **Authentication:** Cookie headers (`token`, `__Secure-text-session`, `cf_clearance`)

All HTTP requests must include these standard headers:
```http
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36
Origin: https://app.chitchat.gg
Referer: https://app.chitchat.gg/
Cookie: __Secure-text-session=<session>; token=<jwt_token>; cf_clearance=<clearance>
```

---

## 2. All REST API Endpoints

### A. Matchmaking & Queue

#### 1. Enter Match Queue (Find Stranger)
* **Method:** `POST`
* **Path:** `/match`
* **Payload:** `{"withInterests": false}`
* **Response:** `201 Created` $\rightarrow$ `{"matched": false}` (in queue) or `{"matched": true}`
* **Curl Example:**
  ```bash
  curl -X POST "https://api.chitchat.gg/match" \
    -H "Content-Type: application/json" \
    -H "Cookie: $(python3 -c 'import json; print("; ".join([f"{c[\"name\"]}={c[\"value\"]}" for c in json.load(open("cookies.json"))]))')" \
    -H "Origin: https://app.chitchat.gg" \
    -H "Referer: https://app.chitchat.gg/" \
    -d '{"withInterests": false}'
  ```

#### 2. Check Active Match Status
* **Method:** `GET`
* **Path:** `/match/active`
* **Response:**
  * If idle: `{"inQueue": false}`
  * If matched:
    ```json
    {
      "match": {
        "id": "6ae4e8de9f2325d2e65cd57a",
        "conversation": {
          "id": "6ae4e8de9f2325d2e65cd57a",
          "participants": [
            { "profile": { "id": "...", "username": "anti-american clang" } },
            { "profile": { "id": "...", "username": "seasonal relativist" } }
          ]
        }
      },
      "inQueue": false
    }
    ```

#### 3. Disconnect / Skip Current Match
* **Method:** `PATCH`
* **Path:** `/match/disconnect`
* **Payload:** `{"next": false}` (disconnect only) or `{"next": true}` (disconnect and find next)
* **Response:** `200 OK`
* **Curl Example:**
  ```bash
  curl -X PATCH "https://api.chitchat.gg/match/disconnect" \
    -H "Content-Type: application/json" \
    -H "Cookie: $(python3 -c 'import json; print("; ".join([f"{c[\"name\"]}={c[\"value\"]}" for c in json.load(open("cookies.json"))]))')" \
    -H "Origin: https://app.chitchat.gg" \
    -H "Referer: https://app.chitchat.gg/" \
    -d '{"next": false}'
  ```

---

### B. Chat & Messaging

#### 1. Send Text Message
* **Method:** `POST`
* **Path:** `/users/me/conversations/:conversationId/messages`
* **Content-Type:** `multipart/form-data`
* **Fields:**
  * `content`: string (e.g. `"f or m?"` or `"nice, whats ur insta?"`)
  * `nonce`: string (UUID v4)
* **Response:** `201 Created` / `204 No Content`
* **Curl Example:**
  ```bash
  curl -X POST "https://api.chitchat.gg/users/me/conversations/<CONVERSATION_ID>/messages" \
    -H "Cookie: $(python3 -c 'import json; print("; ".join([f"{c[\"name\"]}={c[\"value\"]}" for c in json.load(open("cookies.json"))]))')" \
    -H "Origin: https://app.chitchat.gg" \
    -H "Referer: https://app.chitchat.gg/" \
    -F "content=heyy, where u from?" \
    -F "nonce=$(uuidgen)"
  ```

#### 2. Send Typing Indicator
* **Method:** `POST`
* **Path:** `/users/me/conversations/:conversationId/typing`
* **Payload:** `{}`
* **Response:** `204 No Content`

#### 3. Fetch Message History
* **Method:** `GET`
* **Path:** `/users/me/conversations/:conversationId/messages?limit=50&offset=0`
* **Response:** `200 OK` (JSON array of message objects)

#### 4. Mark Conversation as Read
* **Method:** `PATCH`
* **Path:** `/users/me/conversations/:conversationId/read`
* **Payload:** `{}`
* **Response:** `204 No Content`

---

### C. Account & Moderation

#### 1. Get Profile (`/users/me`)
* **Method:** `GET`
* **Path:** `/users/me`
* **Response:** Returns your user ID, username, avatar, preferences, and verified status.

#### 2. Check Moderation & Standing
* **Method:** `GET`
* **Path:** `/moderation/standing`
* **Response:**
  * If clean: `{"standing": "good", "limitedFeatures": [], "pendingWarnings": [], "activeViolations": []}`
  * If suspended: `{"standing": "banned", "activeViolations": [...]}`

#### 3. Check Active Ban Details
* **Method:** `GET`
* **Path:** `/moderation/ban`
* **Response:** `200 OK` (ban details) or `404 Not Found` (no ban).

---

## 3. Real-Time WebSocket Events (`socket.io`)

**Endpoint:** `wss://api.chitchat.gg/socket.io/?EIO=4&transport=websocket`

### Events Emitted by Server:

1. **`matchUpdate`**
   ```json
   42["matchUpdate", {
     "match": {
       "id": "6ae4e8de9f2325d2e65cd57a",
       "conversation": {
         "id": "6ae4e8de9f2325d2e65cd57a",
         "participants": [...]
       }
     }
   }]
   ```
2. **`chatMessage`**
   ```json
   42["chatMessage", {
     "message": {
       "id": "6ae4e8ee9f2325d2e65cd64c",
       "conversationId": "6ae4e8de9f2325d2e65cd57a",
       "author": { "username": "...", "id": "..." },
       "content": "19f",
       "createdAt": "..."
     }
   }]
   ```
3. **`typing`**
   ```json
   42["typing", { "userId": "...", "conversationId": "..." }]
   ```

---

## 4. Python Backend Trigger Functions

In [`chitchat_api.py`](./chitchat_api.py), every endpoint is wrapped in simple Python functions:

```python
client = ChitchatClient()

# 1. Match a stranger
client.search_match()

# 2. Check active match
match = client.get_active_match()

# 3. Send message
client.send_message(conversation_id, "whats ur insta?")

# 4. Skip stranger
client.disconnect_match(next_match=False)
```
