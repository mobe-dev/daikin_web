# Daikin Web Bluetooth Controller

Static Svelte 5 app to control Daikin Bluetooth AC controllers from the browser using Web Bluetooth.

## Features

- **Svelte 5 + TypeScript** frontend (no server-side logic).
- **Static build** (`adapter-static`) for GitHub Pages.
- **shadcn-svelte** UI components.
- **Web Bluetooth** picker with `acceptAllDevices: true` (no device restriction).
- **Persistent local user/device data** with `svelte-persisted-store` and `localStorage`.
- Control surface for all known portable IR/BT controller properties used in Daikin ecosystems:
  - Power, mode, temperature, fan speed, swing
  - Econo, Powerful, Quiet, Comfort, Streamer
  - Holiday, Mold proof, Weekly timer, Child lock, Beep toggle
  - On/Off timer times

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

## Notes on protocol coverage

This repo includes a typed property model for comprehensive controller features, plus a browser-safe Bluetooth client shell.

Because Daikin Bluetooth GATT profile variants are not consistently public across models, the low-level packet protocol layer is intentionally abstracted and must be adapted with model-specific UUIDs/encoders for your hardware family.

The app architecture is ready for this with:

- `src/lib/daikin/properties.ts`: canonical capability/state model
- `src/lib/bluetooth/daikin.ts`: connection + read/write abstraction
- `src/lib/stores/persistent.ts`: persistent stores for capabilities, known devices, and last state

## Svelte MCP

Local Svelte MCP server dependency is included via `@sveltejs/mcp`.
You can wire it into your editor using `.vscode/mcp.json`.
