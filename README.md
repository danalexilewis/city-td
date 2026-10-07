# City TD

Location-based city tower defence POC for the Wellington commuter belt.

## Repo layout

| Path | Package / role |
| --- | --- |
| `apps/mobile` | `@city-td/mobile` — Expo Router app (MapLibre, EAS) |
| `packages/game-core` | `@city-td/game-core` — pure TS grid / balance maths (sibling agent) |
| `tools/site-gen` | `@city-td/site-gen` — Overpass + Metlink GTFS → sites / plots / stocks |
| `supabase/` | Config, migrations, RPCs (sibling agent) |

## Prerequisites

- Node 20+
- [pnpm](https://pnpm.io) 9+ (repo pins `packageManager`)
- Expo account + [EAS CLI](https://docs.expo.dev/eas/) for device builds
- Paid Apple Developer account for iOS internal distribution
- Android device or emulator for Android builds

MapLibre React Native is **not** in Expo Go. You need a development build.

The app uses **Expo SDK 57** (New Architecture is always on; MapLibre RN v11 requires it).

## Install

```bash
pnpm install
```

`.npmrc` sets `node-linker=hoisted` so Expo works with pnpm.

## Run the mobile app

```bash
# JS bundler (needs a matching native dev client already installed)
pnpm mobile

# Or from the app package
pnpm --filter @city-td/mobile start
```

### First-time native / EAS setup

1. Log in and create an EAS project (writes `extra.eas.projectId` into `app.json`):

   ```bash
   cd apps/mobile
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

2. Register tester iPhones (Apple Developer required):

   ```bash
   npx eas-cli@latest device:create
   ```

3. Build a development client:

   ```bash
   # Physical devices (internal distribution)
   npx eas-cli@latest build --profile development --platform ios
   npx eas-cli@latest build --profile development --platform android

   # iOS Simulator
   npx eas-cli@latest build --profile development-simulator --platform ios
   ```

4. Install the build on the device, then start Metro:

   ```bash
   pnpm mobile
   ```

Internal (non-dev-client) tester builds use the `internal` profile in `apps/mobile/eas.json`.

Full walk / commute / drive / two-phone checklist, EAS command list, credential blockers, and post-walk tuning knobs: [`docs/walk-tests.md`](docs/walk-tests.md).

### Local prebuild (optional)

```bash
pnpm mobile:prebuild
```

Prefer EAS for team installs. Local `ios/` / `android/` folders are gitignored (CNG).

## Scripts (root)

| Script | What it does |
| --- | --- |
| `pnpm mobile` | Start Expo with the dev client |
| `pnpm mobile:ios` / `mobile:android` | Start targeting a platform |
| `pnpm mobile:prebuild` | Generate native projects via Expo |
| `pnpm test:game-core` | Vitest for `@city-td/game-core` |
| `pnpm --filter @city-td/mobile typecheck` | TypeScript check for the mobile app |
| `pnpm site-gen -- --dry-run` | Overpass + Metlink → site counts (no DB write) |
| `pnpm typecheck:site-gen` | TypeScript check for `@city-td/site-gen` |

Site generator details: [`tools/site-gen/README.md`](tools/site-gen/README.md). Live upserts need `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `tools/site-gen/.env`.

## Mobile env

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase API URL (cloud or `http://127.0.0.1:54321`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon / publishable key only — never the service role |

Auth is email one-time code (OTP). Configure custom SMTP and a `{{ .Token }}` email template in Supabase (see `supabase/README.md`).

## Licensing and attribution

Sources stay separate so OpenStreetMap’s ODbL share-alike does not pull Metlink or player data under it:

- **No cross-source de-duplication.** Intersections/landmarks come only from OSM; stops/stations only from Metlink; own sites only from players/team. Never merge or fill gaps across sources. A cell may hold sites from several sources; the map can still draw one icon.
- **At launch:** publish the generator script and the OSM-derived layer (ODbL §4.6). Get a proper licence review before going public.
- **In-app credits:** Settings → About lists © OpenStreetMap, OpenFreeMap, OpenMapTiles, and Metlink / Greater Wellington Regional Council (CC BY 4.0). The map HUD should also show “© OpenStreetMap contributors” plus OpenFreeMap / OpenMapTiles when the map lands.

## Notes for other packages

- Mobile entry is `apps/mobile/index.ts` → `polyfills.ts` (`fast-text-encoding` for `h3-js` on Hermes, URL polyfill for Supabase) → `expo-router/entry`.
- Brand / cartoon UI tokens live in `apps/mobile/theme.ts` (no UI kit).
- Auth lives in `apps/mobile/lib/auth` with Expo Router `Stack.Protected` gates (`sign-in` → `profile-setup` → `(app)`).
- When `packages/game-core` exists, add it as a workspace dependency of `@city-td/mobile` (e.g. `"@city-td/game-core": "workspace:*"`).
- Keep Node-only tooling (`tools/site-gen`, service-role keys, `fs`) out of the mobile app.
