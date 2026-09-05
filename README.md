# WebPassProtect

Password-protected website blocker for Chromium browsers (Chrome, Brave, Edge, Chromium). No accounts, no cloud, no telemetry.

## Install

1. Open `chrome://extensions` (or `brave://extensions` / `edge://extensions`)
2. Enable **Developer mode** → **Load unpacked** → select this directory
3. The options page opens — set a password when prompted, add domains (e.g. `youtube.com`), click **Save Changes**

Subdomains (`www.`, `m.`, etc.) are blocked automatically.

## Usage

- **Blocked site** → lock screen asks for your password → **Unlock**
- The site stays unlocked while you use it; the timer starts **when you leave** (close tab, navigate away)
- After the duration expires, the site is blocked again
- **Settings:** extension icon → Options (requires current password)
- **Duration:** presets (5m, 15m, 30m, 1h) or custom minutes

## Security

- Password stored as PBKDF2-SHA256 hash (600k iterations) — never plaintext
- This is a **productivity aid**, not security software: it can be removed from `chrome://extensions`, and storage can be edited with filesystem access

> **Status:** uninstall protection (enterprise force-install policy) is in progress and will be worked on after publishing to the Chrome Web Store.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Blocked domains, password hash, unlock state |
| `webNavigation` | Intercept navigation to blocked domains |
| `<all_urls>` | Check any domain for blocking |

## License

MIT
