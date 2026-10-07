# Walk tests and ship checklist

POC validation after EAS internal builds land on tester phones. Automated checks first; physical routes below are **blocked** until devices have a working build + live Supabase.

## Done (this pass)

| Item | Status |
| --- | --- |
| Structure costs aligned | **Done** — `BALANCE` and `game_config`: wall **20** / turret **40** / garrison **60** mat; repair **0.5** mat/hp |
| WalletBar after structure spends | **Done** — `useLocationLoop.refreshWallet()` runs on structure sheet success |
| `eas.json` profiles | **Done** — `development`, `development-simulator`, `internal` |
| Automated: game-core Vitest | Run `pnpm test:game-core` (must pass before walks) |
| Automated: mobile typecheck | Run `pnpm --filter @city-td/mobile typecheck` |
| pgTAP | **Not present** — no `supabase/tests` / pgTAP suite yet; RPC rules are migration SQL only |
| Physical walk / commute / drive / two-phone | **Blocked** — needs installed builds + credentials (below) |
| Post-walk tuning of reach / zoom / gate / economy | **Blocked** — leave defaults until walks; knobs listed below |

## Automated checks

```bash
# From repo root
pnpm test:game-core
pnpm --filter @city-td/mobile typecheck
```

Optional: `pnpm typecheck:game-core`, `pnpm typecheck:site-gen`.

There are **no pgTAP** tests in this repo yet. Plan mentioned a few for DB function rules; add later under `supabase/tests` if needed.

## EAS internal builds

Profiles live in [`apps/mobile/eas.json`](../apps/mobile/eas.json):

| Profile | Use |
| --- | --- |
| `development` | Dev client, internal distribution (physical devices) |
| `development-simulator` | Dev client for iOS Simulator |
| `internal` | Non-dev-client internal tester builds (JS updates via EAS Update on channel `internal`) |

### Exact commands

```bash
cd apps/mobile

# 1. Auth + project (once)
npx eas-cli@latest login
npx eas-cli@latest init   # writes extra.eas.projectId into app.json

# 2. Register iPhone UDIDs for ad-hoc / internal (Apple Developer required)
npx eas-cli@latest device:create

# 3. Development clients (MapLibre needs a native build — not Expo Go)
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development-simulator --platform ios

# 4. Internal (store-like) tester builds
npx eas-cli@latest build --profile internal --platform ios
npx eas-cli@latest build --profile internal --platform android

# 5. After install: JS-only Metro for development profile
# (from repo root)
pnpm mobile
```

### Blockers (credentials / cloud — do not invent)

These steps need **your** accounts; this agent cannot complete them without secrets:

1. **Expo / EAS login** — `eas login` with an Expo account that owns the project.
2. **Apple Developer (paid)** — team membership for signing, devices, and provisioning.
3. **`eas device:create`** — physical iPhone UDIDs registered to the Apple team.
4. **EAS cloud builds** — Apple credentials in EAS (App Store Connect API key or distribution cert + profile) and Google Play / keystore for Android if you use store signing later; APK profile uses EAS-managed keystore by default once logged in.
5. **Supabase Sydney project** — remote URL + anon key in `apps/mobile/.env`; custom SMTP + `{{ .Token }}` OTP template so non-org testers can sign in.
6. **Site data** — run `tools/site-gen` against the project (service role) so Wellington sites/plots exist for walks.

Until those land, walk routes stay **blocked**. Document install links from the EAS build page once builds succeed.

## Physical checklist (when builds ship)

Mark each row when done. Start in **street** camera (~17.25); toggle square grid only for lab comparison.

### 1. Foot — Lambton Quay → Courtenay Place

- [ ] Cells feel ~19 m across; plots (~2 rings) readable at zoom ≥ 16.5
- [ ] Build sheet opens from zoom ≥ 17; below that, tap zooms toward 17.25
- [ ] Reach (~40 m) feels fair for place / collect / care; note GPS drift vs map
- [ ] Auto-collect when entering a site plot; cooldown ~60 min per site
- [ ] WalletBar updates after collect **and** after place / repair / load / boost / rebuild
- [ ] **Tuning note:** Pokémon GO has used ~80 m interaction radius since 2021 — if 40 m feels too tight on this walk, raise `reach.actionRadiusM` / `game_config.reach_m` together

### 2. Commute — Hutt train or bus

- [ ] Above ~10 km/h: taps lock; auto-collecting banner / read-only view
- [ ] Below ~8 km/h: unlocks (hysteresis)
- [ ] Auto-collect still works while gate is locked
- [ ] Heartbeat / presence does not spam errors in the tunnel or when GPS is poor

### 3. Drive

- [ ] Gate stays locked at car speeds
- [ ] No accidental builds; UI stays read-only aside from auto-collect

### 4. Two phones, one board

- [ ] Both signed in; same live plot / board area
- [ ] Place / care / remove on phone A appears on phone B (Realtime by `cell_r7`)
- [ ] Presence “players nearby” moves when the other phone is in the same r7 parent
- [ ] Stocks / first-come collect race feels intentional, not broken

## Defaults left alone (tune after walks)

Authoritative client copy: `packages/game-core/src/balance/config.ts` (`BALANCE`).  
Authoritative server copy: `public.game_config` (seeded in `supabase/migrations/20261008000002_schema.sql`).

**Aligned now (client display = server spend):**

| Knob | Value |
| --- | --- |
| Place wall / turret / garrison | 20 / 40 / 60 materials |
| Repair | 0.5 materials per HP |
| Rebuild | half place cost |
| Reach | 40 m |
| Speed gate | lock 10 km/h, unlock 8 km/h, ~5 s median window |
| Collect cooldown | 60 minutes |

**Still differ slightly between TS and SQL (stock economy — not structure UI).** Prefer changing both together if walks say the economy is wrong:

| Knob | `BALANCE` | `game_config` |
| --- | --- | --- |
| Collect take per visit | 10 / 10 / 10 | `collect_take_*` = 5 |
| Base refill / hour | 20 | `refill_*_per_hour` = 10 |
| Presence bonus / min | 1 | `presence_bonus_*` = 0.5 |

**Other knobs to touch after walks (keep TS + SQL in sync):**

- `reach.actionRadiusM` / `reach_m` (vs Pokémon GO ~80 m)
- Camera zooms: street 16.5–18 (default 17.25), build from 17, plots from 16.5
- `boost_power_cost` (SQL 20; client button does not show the number yet)
- Raid fraction / damage, care days (28), rubble clear days (7)

Do **not** retune for theory — change only after a concrete walk note.
