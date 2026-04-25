# Electrogram

An accessible, keyboard-navigable Telegram client built with Electron and GramJS. Designed for screen-reader users and keyboard-only workflows.

## Features

- **Fully accessible** – semantic HTML, ARIA live regions, roving tabindex, and high-contrast focus rings
- **Keyboard navigation** – Tab/Shift+Tab between panes, arrow keys to browse lists, Home/End to jump, Enter to activate
- **Login flow** – Enter API ID/hash, phone number, verification code, and 2FA password
- **Conversations** – Browse chats with unread badges and last-message previews
- **Real-time messaging** – Send and receive text messages, with live ARIA announcements
- **File sharing** – Attach and send multiple files with optional captions; download received files via Enter
- **Voice messages** – Record and send voice notes; play incoming voice messages inline
- **Reply threads** – Press `R` on a message to reply; cancel with Escape or the × button
- **Service messages** – Join/leave/pin events rendered with resolved user names
- **Mark as read** – Automatically marks conversations read when opened
- **Notification sounds** – Sent/received sounds for active chats; background-chat alerts for non-muted conversations
- **Dark theme** – Accessible colour palette with responsive mobile layout

## Development

```bash
npm install
npm run dev
```

If you encounter GPU crashes in a headless or VM environment:

```bash
npm run dev:safe
```

## Build

```bash
npm run build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + 1` | Focus conversation list |
| `Ctrl + 2` | Focus message list |
| `Ctrl + 3` | Focus message composer |
| `Enter` | Send message / activate item / play voice / download file |
| `R` | Reply to focused message |
| `Escape` | Cancel reply / close chat |
| `↑ / ↓` | Navigate items in a list |
| `Home / End` | Jump to first/last item |

## Getting API Credentials

1. Visit [my.telegram.org/apps](https://my.telegram.org/apps)
2. Log in with your phone number
3. Create a new application
4. Copy the **API ID** and **API Hash** into Electrogram

## Tech Stack

- Electron 35
- GramJS (Telegram MTProto)
- Vite / electron-vite
- Vanilla JavaScript (renderer)

## License

MIT
