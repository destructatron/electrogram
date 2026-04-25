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
- **Inline buttons** – Bot keyboards render inside messages; keyboard-navigable and only tabbable when the message is focused
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

## Packaging

Create installers and portable binaries for the current platform:

```bash
npm run dist          # Current platform
npm run dist:linux    # Linux (AppImage, deb, tar.gz)
npm run dist:win      # Windows (NSIS installer, portable)
npm run dist:mac      # macOS (DMG, zip)
```

Outputs are written to the `dist/` directory.

### Automated Releases

Push a tag like `v1.0.0` and GitHub Actions will build and upload binaries for Linux, Windows, and macOS directly to a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### macOS Notifications

macOS requires apps to be **code-signed** for desktop notifications to work reliably. Unsigned builds may not show notification banners or appear in **System Preferences → Notifications**.

If you are testing an unsigned build:
- Notifications may be silently dropped by macOS.
- The first notification from a signed build will prompt for permission automatically.

To enable notifications on your own signed build, set the `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables before packaging.

### Code Signing (optional)

- **macOS**: Set `CSC_LINK` (base64-encoded `.p12`) and `CSC_KEY_PASSWORD` environment variables.
- **Windows**: Set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` environment variables.
- **Linux**: AppImage and deb packages do not require signing.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + 1` | Focus conversation list |
| `Ctrl + 2` | Focus message list |
| `Ctrl + 3` | Focus message composer |
| `Enter` | Send message / activate item / play voice / download file / press inline button |
| `R` | Reply to focused message |
| `E` | Edit your outgoing text message |
| `C` | Copy focused message to clipboard |
| `Escape` | Cancel reply / editing / close chat |
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
