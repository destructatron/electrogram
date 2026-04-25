# Electrogram — Agent Guide

Electrogram is an accessible, keyboard-navigable Telegram client built with Electron and GramJS (the `telegram` npm package). It uses a single-page vanilla-JS renderer, communicates with Telegram via the MTProto protocol, and is heavily optimized for screen-reader and keyboard-only usage.

---

## Technology Stack

- **Runtime**: Electron 35 (Node.js ESM)
- **Telegram SDK**: GramJS (`telegram` v2.26+)
- **Build Tool**: Vite via `electron-vite` v5.0+
- **Renderer**: Vanilla JavaScript (no framework), semantic HTML, CSS custom properties
- **Language**: All source code, comments, and documentation are in English
- **Module System**: ESM (`"type": "module"` in `package.json`)
- **License**: MIT

---

## Project Structure

```
├── package.json              # Dependencies, scripts, ESM flag
├── electron.vite.config.js   # Build config: externalizes main/preload deps
├── README.md                 # Human-facing quick-start and feature list
├── AGENTS.md                 # This file
├── out/                      # electron-vite build output (gitignored)
│   ├── main/index.js
│   ├── preload/index.mjs
│   └── renderer/...
└── src/
    ├── main/
    │   ├── index.js          # Window creation, app lifecycle, preload path resolution
    │   ├── ipc.js            # ipcMain handlers that bridge renderer → TelegramManager
    │   └── telegram.js       # GramJS client wrapper, session/credential persistence
    ├── preload/
    │   └── index.js          # contextBridge exposing `window.electronAPI.tg.*`
    └── renderer/
        ├── index.html        # Single-page shell with live region and screen container
        ├── app.js            # Screen router, global shortcuts, ARIA announcements
        ├── style.css         # Dark theme, focus rings, responsive mobile layout
        └── screens/
            ├── login-api.js      # API ID/hash form + auto-connect with saved creds
            ├── login-phone.js    # Phone number entry
            ├── login-code.js     # Verification code + 2FA password
            └── main-app.js       # Conversation list + chat pane with roving tabindex
```

---

## Build and Development Commands

All commands are run from the project root.

```bash
# Install dependencies
npm install

# Development server with hot reload
npm run dev

# Development for headless / VM environments (disables GPU and sandbox)
npm run dev:safe

# Production build → outputs to `out/`
npm run build

# Preview the production build
npm start
```

`electron-vite` handles three build targets:
- **Main** (`src/main`) → `out/main/index.js`
- **Preload** (`src/preload`) → `out/preload/index.mjs`
- **Renderer** (`src/renderer`) → `out/renderer/` (Vite-bundled HTML/JS/CSS)

The preload build intentionally outputs `.mjs` because the project is ESM. The main process resolves the preload path at runtime via `path.join(__dirname, '../preload/index.mjs')`.

---

## Runtime Architecture

### Process Model
Standard Electron three-process model with **context isolation enabled** and **node integration disabled**:

1. **Main Process** (`src/main/`)
   - `index.js`: Creates a `BrowserWindow` (1200×800, min 800×600), loads `index.html`, and wires up IPC.
   - `telegram.js`: A singleton `TelegramManager` class that owns the GramJS `TelegramClient`, persists session strings and API credentials to Electron's `userData` directory, and listens for `NewMessage` events.
   - `ipc.js`: Registers `ipcMain.handle('tg:*', ...)` handlers. Each handler delegates to `telegram.*` methods.

2. **Preload** (`src/preload/index.js`)
   - Uses `contextBridge.exposeInMainWorld('electronAPI', { tg: { ... } })`.
   - Exposes async invoke wrappers for every Telegram operation and an `onUpdate(callback)` listener that wraps `ipcRenderer.on('tg:update', ...)`.

3. **Renderer** (`src/renderer/`)
   - Pure DOM-manipulation JavaScript. No virtual DOM framework.
   - `app.js` acts as a minimal router: it mounts screen elements into `#screen-container`, manages cleanup functions, and provides an `announce(msg)` utility that writes to an ARIA live region.
   - Global shortcuts (Ctrl+1, Ctrl+2, Ctrl+3, Ctrl+Enter) are bound in `app.js`.

### Data Flow for Telegram Operations
```
Renderer (screen JS)
  → window.electronAPI.tg.* (preload bridge)
    → ipcRenderer.invoke('tg:*')
      → Main process ipc.js handler
        → TelegramManager method
          → GramJS TelegramClient
```

Real-time updates flow backward:
```
GramJS NewMessage event
  → TelegramManager.pushUpdate()
    → mainWindow.webContents.send('tg:update', update)
      → ipcRenderer.on('tg:update') in preload
        → renderer callback
```

---

## Code Organization Conventions

### Screens
Each file in `src/renderer/screens/` exports a factory function (e.g., `LoginApiScreen()`) that:
1. Creates a DOM element tree.
2. Attaches event listeners.
3. Returns the root element.

Some screens also export cleanup functions (e.g., `cleanupMainApp`) that are passed to `setScreen()` in `app.js` so the router can tear down listeners when navigating away.

### Accessibility Patterns
- **ARIA live region**: `#live-region` (`aria-live="polite"`) is used for all status announcements (`announce()` in `app.js`).
- **Roving tabindex**: Lists (conversations, messages) use a single `tabindex="0"` on the active item and `-1` on siblings. Arrow keys, Home, and End move focus. See `setupRovingTabindex()` in `main-app.js`.
- **Focus management**: When a new screen mounts, `setScreen()` automatically focuses the first `[autofocus]`, `button`, `input`, `textarea`, or `[tabindex="0"]` element.
- **Focus rings**: All focusable elements get a high-contrast `3px solid var(--focus-ring)` (`#ffd700`) outline.

### Styling
- Uses CSS custom properties (variables) defined in `:root` inside `style.css`.
- Dark theme by default (`#1a1a2e` background).
- Responsive breakpoint at `640px` hides the chat pane until a conversation is selected (mobile view).

---

## Testing

There is **no test suite** currently in the project. There are no Jest, Vitest, Playwright, or other test configurations. If you add tests:

- Unit tests for renderer screen logic can be run in a DOM environment (e.g., Vitest + happy-dom) because screens are plain JS functions that return DOM nodes.
- E2E tests for the Electron shell can use Playwright or Spectron (legacy). Be aware that the app requires valid Telegram API credentials and a real phone number, making full E2E login flows difficult to automate.

---

## Security Considerations

- **Context isolation is enabled** and **node integration is disabled** in the renderer, but **sandbox is disabled** (`sandbox: false`). The preload script is the only bridge.
- **Sensitive data stored locally in plaintext**:
  - `session.txt` — GramJS session string (in `app.getPath('userData')`)
  - `credentials.json` — API ID and API hash
  Treat these files as secrets; any code running in the main process can read them.
- **No input sanitization** is applied to message text before sending to Telegram. GramJS handles protocol-level encoding, but XSS-style injection inside the renderer is mitigated by using `textContent` rather than `innerHTML` for dynamic message rendering.
- External links (e.g., `my.telegram.org/apps`) use `target="_blank" rel="noopener"`.

---

## Deployment / Packaging

`electron-builder` is configured in `electron-builder.yml` to produce:

- **Linux**: AppImage, deb, tar.gz (x64 + arm64)
- **Windows**: NSIS installer, portable (x64 + arm64)
- **macOS**: DMG, zip (x64 + arm64)

Local packaging:
```bash
npm run dist:linux
npm run dist:win
npm run dist:mac
```

GitHub Actions builds all three platforms via two separate workflows:

- **`.github/workflows/build.yml`** — runs on pushes to `main` and pull requests. Packages with `--publish=never` and uploads artifacts for CI inspection. Does **not** trigger on tags.
- **`.github/workflows/release.yml`** — runs **only** on `v*` tag pushes. Sets `package.json` version from the tag (`npm version ${TAG#v} --no-git-tag-version`) before building, then packages with `--publish=never` and uploads binaries to the GitHub Release via `softprops/action-gh-release`.

Important: `electron-builder` auto-detects git tags and tries to publish by default. Always pass `--publish=never` in CI unless the job has `contents: write` permission and is meant to create releases. The `build.yml` workflow lacks write permissions, so allowing auto-publish would cause 403 Forbidden errors.

Unsigned binaries are produced by default. To enable code signing, set the `CSC_*` and `WIN_CSC_*` environment variables before running `electron-builder`.

---

## Common Issues

- **GPU crashes in VMs / headless environments**: Use `npm run dev:safe` (passes `--disable-gpu --no-sandbox`).
- **Preload path errors**: The main process resolves `preloadPath` relative to `__dirname` at runtime. If the build output is moved, this path breaks.
- **`window.electronAPI` undefined**: Usually means the preload script failed to load (check main-process logs) or the renderer was opened in a browser outside Electron.

---

## Key Dependencies

| Package        | Purpose                                   |
|----------------|-------------------------------------------|
| `electron`     | Desktop runtime                           |
| `telegram`     | GramJS — MTProto client SDK               |
| `electron-vite`| Vite wrapper for Electron main/preload/renderer |
| `vite`         | Underlying bundler for the renderer       |
