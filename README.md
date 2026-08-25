# Asta WhatsApp Bot

> A feature-rich WhatsApp bot built with `@whiskeysockets/baileys`, designed for AI chat, media tools, group moderation, automation, and fast command handling.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active-0A7CFF?style=for-the-badge)

## Overview

Asta Bot is a WhatsApp assistant that connects through WhatsApp Web using Baileys. It supports normal QR login and phone-number pairing code login, making it easier to connect the bot on servers, terminals, and mobile-friendly setups.

The bot includes a command system, runtime configuration, SQLite storage, moderation utilities, AI commands, media download tools, dashboard support, logs, reminders, and owner/admin permissions.

## Highlights

- WhatsApp connection through Baileys
- QR code login when no phone number is configured
- Pairing code login when `connection.pairingPhoneNumber` is set
- AI chat and intelligent command support
- Media search, download, sticker, wallpaper, and image tools
- Group moderation tools like warn, mute, kick, ban, anti-link, and approvals
- Owner/admin permission system
- SQLite database for bot state and stats
- Runtime config command support
- Dashboard service on `http://127.0.0.1:3030`
- Auto reconnect after disconnects
- Logs, health checks, reminders, backups, and developer utilities

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure The Bot

Open `config.js` and update the important values:

```js
module.exports = {
  prefix: ".",
  owner: "your-owner-id",

  connection: {
    authDir: "./auth_info_baileys",
    pairingPhoneNumber: "",
    reconnectDelayMs: 2000,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  },
};
```

### 3. Run The Bot

```bash
npm start
```

## Login Methods

### Option 1: Pairing Code Login

If you want the bot to show a WhatsApp pairing code instead of a QR code, put your number in `config.js`.

Use digits only, including country code:

```js
connection: {
  pairingPhoneNumber: "23491564521";
}
```

When the bot starts, it will print a pairing code in the terminal.

On WhatsApp:

1. Open WhatsApp.
2. Go to Linked devices.
3. Tap Link a device.
4. Choose Link with phone number.
5. Enter the code shown by the bot.

### Option 2: QR Code Login

If `pairingPhoneNumber` is empty or invalid, the bot automatically falls back to QR code login.

```js
connection: {
  pairingPhoneNumber: "";
}
```

Then scan the terminal QR code with WhatsApp.

## Configuration

Main settings live in `config.js`.

### Bot

```js
bot: {
    name: 'Asta Bot',
    version: '1.0.0',
    timezone: 'Africa/Lagos',
    locale: 'en-US'
}
```

### Commands

```js
commands: {
    prefix: '.',
    cooldown: 3,
    maxArgsLength: 1000,
    mentionPrefixEnabled: false
}
```

### Dashboard

```js
dashboard: {
    enabled: true,
    port: 3030,
    host: '127.0.0.1'
}
```

### Connection

```js
connection: {
    authDir: './auth_info_baileys',
    pairingPhoneNumber: '',
    reconnectDelayMs: 2000,
    markOnlineOnConnect: false,
    syncFullHistory: false
}
```

### Command Images

Some showcase commands can send a photo banner with their text. Replace the default image URL with your own bot image, logo, anime banner, or TikTok promo design.

```js
assets: {
    defaultCommandImageUrl: 'https://picsum.photos/1200/630',
    commandImages: {
        help: '',
        menu: '',
        info: '',
        health: '',
        ping: '',
        stats: '',
        analytics: '',
        features: '',
        selftest: ''
    }
}
```

## Authentication Files

Baileys saves WhatsApp session files inside:

```text
auth_info_baileys/
```

Keep this folder private. Anyone with the auth files may be able to access the linked WhatsApp session.

If you need to login again from scratch, stop the bot and remove the auth folder, then restart the bot.

## Dashboard

When enabled, the dashboard runs locally:

```text
http://127.0.0.1:3030
```

Use it to inspect bot status and runtime information.

## Troubleshooting

### Pairing Code Does Not Show

Check that `pairingPhoneNumber` is digits only:

```js
pairingPhoneNumber: "23491564521";
```

Do not include `+`, spaces, or brackets.

### Bot Shows QR Instead Of Pairing Code

This means the number is empty or invalid. Update `config.js` and restart the bot.

### Bot Is Already Connected

If the session is already registered in `auth_info_baileys/`, Baileys will reuse the saved session instead of asking for a new QR or pairing code.

### Logged Out

If WhatsApp logs out the session, delete `auth_info_baileys/` and run:

```bash
npm start
```

## Safety Notes

- Do not share `auth_info_baileys/`.
- Do not upload `creds.json` publicly.
- Keep API keys and tokens private.
- Use owner/admin permissions carefully.
- Only run developer commands if you trust the chat and environment.

## Tech Stack

- Node.js
- JavaScript
- `@whiskeysockets/baileys`
- SQLite
- `qrcode-terminal`
- Axios
- Sharp

## License

ISC
