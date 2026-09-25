# Autoservice receptionist

## Run locally
Requires Node.js 22 or newer. In PowerShell, use `npm.cmd` if script execution blocks `npm`.

```sh
npm install
npm start
```

Open http://127.0.0.1:3000. The server listens only on this computer.
Optional: copy `.env.example` to `.env` to change PORT. Never commit secrets.

## Current scope
The Czech test page sends a message to POST /api/chat. Express validates it and returns a fixed test reply. The browser displays the reply or a connection error. Messages are not stored. AI is not connected yet.

- app.mjs: Express server and test chat endpoint
- public/: browser files
- service.mjs: legacy learning example; unused by this application

## Manual checks
1. Start the server and open the page.
2. Send a short test message: both your message and the server's test reply appear.
3. Submit an empty message: nothing is sent.
4. Stop the server and send a message: an error appears and the message remains in the input.
5. Restart the server and retry: the message sends successfully.
