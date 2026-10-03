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
  after a reload. The app does not store chat history on its server.
- The browser also remembers whether the chat is open and whether the desktop
  chat is expanded.
- The page tells visitors that messages are sent to OpenAI and asks them not
  to enter personal details during this demo.
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
