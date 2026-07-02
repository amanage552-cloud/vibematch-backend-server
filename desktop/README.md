# VibeMatch Desktop — Build & Packaging Guide

This `desktop/` workspace contains the Electron packaging configuration and build scripts. It is intentionally isolated from the web backend to prevent CI or cloud web deploys from installing or building native desktop artefacts.

Prerequisites
- macOS required for `.dmg` and `.icns` generation
- Node.js >= 18
- Install dependencies locally inside `desktop/` only:

```bash
cd desktop
npm ci
```

Local development (run app against local backend)

```bash
cd desktop
ELECTRON_DEV=1 npm run electron:dev
```

Generating macOS `.icns` (macOS only)

```bash
cd desktop
npm run make:icns
# This uses sips and iconutil which are available on macOS
```

Packaging distributable (macOS `.dmg`)

```bash
cd desktop
npm run dist
# Outputs are written to desktop/dist
```

Notes
- Do not run `npm install` at the repository root in CI with devDependencies enabled; Render and other web-hosting CI should use `npm ci --production` to avoid installing Electron.
- When publishing desktop builds, upload the `.dmg` and `.apk` outputs to a release pipeline or artifact storage, and then place copies into `/public/downloads/` for web delivery.
- For reproducible builds and signing on macOS, run packaging on a macOS runner with proper certificates and entitlements.

If you want, I can also add a CI workflow for creating signed desktop artifacts on a macOS runner.
