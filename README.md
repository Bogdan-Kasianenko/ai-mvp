# Autoservice receptionist (demo)

## Run locally

Requires Node.js 22 or newer. Copy `.env.example` to `.env`, replace
`your_api_key_here` with your OpenAI API key, and keep `.env` private.
The key is read by the server and must never be added to frontend code.

In PowerShell, use `npm.cmd` if script execution blocks `npm`:

```powershell
npm.cmd install
npm.cmd start
```

Open http://127.0.0.1:3000. The server listens only on this computer.

## Current behavior

- `app.mjs` serves the demo page, validates chat messages, and exposes
  `POST /api/chat` and `GET /api/company`.
- `service.mjs` sends the current message, up to 12 previous user/assistant
  messages, and the demo data in `company.json` to the OpenAI Responses API.
  It requests `store: false`.
- The browser saves up to 50 visible messages in localStorage, so chat remains
  after a reload. After 24 hours without a new message, it clears the conversation
  on the next visit (or while the page remains open). Messages over 20,000
  characters are visibly shortened before display and storage. The app does not
  store chat history on its server.
- The browser also keeps a structured, unsent service-request draft with known
  vehicle, problem, and customer details. The server validates this draft on each
  chat request and returns updated fields and a list of missing required details.
  Engine, mileage, and last oil-change date are optional. No lead is created.
- `company.json` lists individual tasks within each service. Each task has its
  own `priceFrom` field, currently null until a real starting price is confirmed;
  the assistant must not invent an estimate or apply one task's price to another.
- A fresh conversation offers six suggested questions. If an answer arrives
  while the visitor is reading earlier messages, a button shows the unread count
  and scrolls to the newest reply.
- The browser also remembers whether the chat is open and whether the desktop
  chat is expanded.
- The page tells visitors that a phone number or email may be included in a
  draft, and that chat messages are sent to OpenAI and stored in the browser.
  It asks visitors not to include other sensitive details.
- The browser shows a typing state and a message if the AI request fails.

## Manual checks

1. Start the server and open the page on a desktop and a phone-sized viewport.
2. Open the chat: the greeting appears and the send button is unavailable
   until the greeting finishes.
3. Send a short test message: your message appears immediately, followed by
   the typing state and then the AI reply.
4. Submit an empty message: nothing is sent. Submit a message over 1000
   characters: the server rejects it.
5. Stop the server and try sending a message: the browser shows an error.
6. Reload the page: the previous conversation remains visible.
7. Leave the chat open and reload: it stays open. Expand it, close it, then
   reload and reopen: the expanded width is restored on desktop.
8. In a fresh conversation, open the suggested-question list and select one:
   it is sent immediately and the list disappears.
9. While waiting for a reply, scroll up in a long conversation: a typing notice
   becomes an unread-message button. Click it or scroll to the bottom to dismiss it.
10. After 24 hours without a new message, reload: the old conversation is gone
    and a fresh greeting and question list are shown.
