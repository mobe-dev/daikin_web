# Daikin Web Bluetooth Controller

Static Svelte 5 app to control Daikin Bluetooth AC controllers from the browser using Web Bluetooth.

## Features

- **Svelte 5 + TypeScript** frontend (no server-side logic).
- **Static build** (`adapter-static`) for GitHub Pages.
- **shadcn-svelte** UI components.
- **Web Bluetooth** picker with `acceptAllDevices: true` (no device restriction).
- **Persistent local user/device data** with `svelte-persisted-store` and `localStorage`.
- Control surface for known controller properties:
  - Power, mode, temperature, fan speed, swing
  - Econo, Powerful, Quiet, Comfort, Streamer
  - Holiday, Mold proof, Weekly timer, Child lock, Beep toggle
  - On/Off timer times
- **Deep debug tooling**:
  - exhaustive browser console debug logs for connection, discovery, writes and notifications
  - in-app Debug tab for protocol mode and writable characteristic routing
  - TX/RX payload visibility (text + hex)

## Development

```bash
npm install
npm run dev
```

## Build (static)

```bash
npm run build
```

Optionally set a base path for project pages:

```bash
BASE_PATH=/your-repo-name npm run build
```

## GitHub Pages deployment

A workflow is included at `.github/workflows/deploy.yml`.

- It builds with `BASE_PATH=/<repo>` automatically when deployed from a repository project page.
- It deploys build artifacts to GitHub Pages using official actions.

## Protocol/debug notes

Daikin BLE profiles vary by model and region. To make debugging practical across unknown variants, this app now:

- Enumerates primary services + characteristics.
- Subscribes to notifications where supported.
- Finds writable characteristics and allows picking a preferred target.
- Sends commands using selectable wire formats (`json-patch`, `json-state`, `kv`).
- Logs each TX/RX payload to `console.debug` with timestamps and hex dumps.

Use browser DevTools Console while changing settings to inspect exact packets and tune your preferred characteristic/protocol route.

## Svelte MCP

Local Svelte MCP server dependency is included via `@sveltejs/mcp`.
You can wire it into your editor using `.vscode/mcp.json`.
