# Autoservice receptionist (demo)

## Run locally

Requires Node.js 22 or newer. Copy `.env.example` to `.env`, replace
`your_api_key_here` with your OpenAI API key. Set `GMAIL_USER` to the sending
Gmail address, `GMAIL_APP_PASSWORD` to a 16-character Google app password,
and `LEADS_TO_EMAIL` to the service inbox. Keep `.env` private. Credentials
are read by the server and must never be added to frontend code. After
changing `.env`, restart the server.

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
- The browser keeps structured service-request details about the vehicle,
  problem, and customer. The server validates them on each chat request.
  Engine, mileage, and last oil-change date are optional. After the customer
  explicitly confirms sending, the server emails the request to the service.
  Emailing the request does not reserve a time slot.
- `company.json` lists the services and the demo labor rates (850 Kč/hour,
  or 1,000 Kč/hour for customer-supplied parts). `pricing.mjs` is the single
  source for service prices. For most repairs it calculates a starting labor
  price only; parts and fluids are separate and depend on the vehicle and
  selected products. The timing-service price is for labor only;
  any water-pump replacement is a separate job and price. Fixed
  services and tire/STK variants keep their own prices. `GET /api/company`
  adds public price labels from this catalog, and the AI receives the same
  catalog. The assistant does not quote or calculate prices for parts.
- A fresh conversation offers six suggested questions. If an answer arrives
  while the visitor is reading earlier messages, a button shows the unread count
  and scrolls to the newest reply.
- The browser also remembers whether the chat is open and whether the desktop
  chat is expanded.
- The page tells visitors that chat messages are sent to OpenAI, stored in the
  browser, and that request details are emailed to the service only after
  confirmation. It asks visitors not to include other sensitive details.
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
