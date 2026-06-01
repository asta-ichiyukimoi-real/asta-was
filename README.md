# WhatsApp Chatbot

This is a simple WhatsApp chatbot built using @whiskeysockets/baileys.

## Setup

1. Install dependencies: `npm install`
2. Run the bot: `npm start`

## How it works

- The bot connects to WhatsApp Web.
- It displays a QR code in the terminal. Scan it with WhatsApp on your phone.
- Once connected, it echoes messages back.
- Special commands:
  - "hello" -> "Hello! How can I help you?"
  - "bye" -> "Goodbye!"
  - Any other message -> "Echo: [message]"

## Notes

- Authentication data is stored in `./auth_info_baileys/`
- The bot will reconnect automatically if disconnected (except on logout).
