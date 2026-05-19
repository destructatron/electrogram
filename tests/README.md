# Electrogram Test Suite

## Overview

This directory contains unit and integration tests for the Electrogram application. The test framework is [Vitest](https://vitest.dev/) with [happy-dom](https://github.com/capricorn86/happy-dom) for DOM testing.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch
```

## Structure

```
tests/
├── app.test.js              # Tests for app.js (announce, setScreen, enableShortcuts)
├── telegram-manager.test.js # Unit tests for TelegramManager helper methods
├── screens/
│   └── login-api.test.js    # Tests for LoginApiScreen
└── README.md                # This file
```

## What's Tested

### `app.test.js`
- `announce()`: ARIA live region updates with screen reader compatible timing
- `setScreen()`: Screen routing, cleanup handling, and focus management
- `enableShortcuts()`: Keyboard shortcut toggle

### `telegram-manager.test.js`
- `getDisplayName()`: User/chat display name resolution
- `getVoiceInfo()`: Voice message detection and duration extraction
- `getPhotoInfo()`: Photo detection and largest dimension selection
- `getReplyPreview()`: Reply preview text generation for various message types
- `getFileInfo()`: Document metadata extraction (excludes voice/video)
- `getInlineButtons()`: Inline keyboard button extraction with row/col indexing

### `screens/login-api.test.js`
- Screen structure and ARIA attributes
- Form element presence and types
- Auto-connect credential validation
- Error handling

## Limitations

- **Main process tests**: `TelegramManager` requires a live `electron` process for file/credential storage. Its helper methods are tested in isolation; full integration tests require mocking the GramJS client.
- **Renderer integration**: Full end-to-end renderer tests need a DOM environment (handled by happy-dom).
- **E2E**: Full login flow tests require valid Telegram API credentials and are not included.

## Adding Tests

- Place screen-specific tests in `tests/screens/`
- Place main process or shared logic tests in `tests/`
- Use `describe`/`it` blocks following the Vitest convention
- Mock external dependencies (`electron`, `telegram` client) before importing modules