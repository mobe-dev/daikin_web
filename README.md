# Daikin Web Bluetooth Controller

Static Svelte 5 app to control Daikin Bluetooth AC controllers from the browser using Web Bluetooth.

## Features

- **Svelte 5 + TypeScript** frontend (no server-side logic).
- **Static build** (`adapter-static`) for GitHub Pages.
- **shadcn-svelte** UI components.
- **Web Bluetooth** picker with `acceptAllDevices: true` (no device restriction).
- **Persistent local user/device data** with `svelte-persisted-store` and `localStorage`.
- **Madoka (BRC1H) BLE protocol support** over UART-like BLE transport with chunking/reassembly.
- **Deep debug tooling**:
  - exhaustive browser console debug logs for connection, discovery, writes and notifications
  - in-app Debug tab for protocol routing and writable characteristic visibility
  - TX/RX payload visibility (text + hex)

## Implemented Madoka protocol functions

- `0x000000` GetGeneralInfo
- `0x000020` GetSettingStatus
- `0x004020` SetSettingStatus
- `0x000030` GetOperationMode
- `0x004030` SetOperationMode
- `0x000040` GetSetpoint
- `0x004040` SetSetpoint (GFLOAT / SFLOAT)
- `0x000050` GetFanSpeed
- `0x004050` SetFanSpeed
- `0x004220` DisableCleanFilterIndicator
- `0x000110` GetSensorInformation
- `0x000130` GetMaintenanceInformation
- `0x000302` GetEyeBrightness
- `0x004302` SetEyeBrightness

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

## Madoka transport notes

This implementation uses the observed UART-over-BLE framing:

- MTU payload chunks up to 20 bytes
- request fragmentation into `chunkId + payload` with first-chunk total-length byte
- response reassembly by chunk IDs
- asynchronous notification handling + synchronous request/response matching

## Svelte MCP

Local Svelte MCP server dependency is included via `@sveltejs/mcp`.
You can wire it into your editor using `.vscode/mcp.json`.
