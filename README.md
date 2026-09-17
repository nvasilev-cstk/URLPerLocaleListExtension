# Locale URL List Monitor

A Contentstack App that runs in the entry editor sidebar. For an `article` entry, it reads
the localized `url` field across every locale configured on the stack and writes a single
`{ locale: url }` map into **Entry Metadata**, so every locale's URL can be fetched with
**one CDA call** instead of one request per locale.

This replaces an earlier Automate-based approach (webhook automations on create/update/
delete) that hit an infinite-loop problem: writing the map to a schema field re-triggered
the same automation. Moving the logic into an App running client-side in the editor avoids
that entirely — it reacts to the human save action, not to a CMA webhook.

## How it works

Locale reads go through the `@contentstack/app-sdk`'s `appSdk.stack`, which rides the
editor's own authenticated session — no token needed for those:

- `appSdk.stack.ContentType(ct).Entry(uid).language(locale).fetch()` — reads the `url`
  field for a given locale.
- `appSdk.stack.getLocales()` — the stack's full locale list, fetched fresh on every sync.
  There's no locale list to maintain in app config; adding a locale to the stack is
  enough for the next sync to start covering it.

**The metadata write is different: it calls the real CMA host directly with a management
token, bypassing the App SDK's own `appSdk.metadata` client entirely.** That client looked
like the obvious choice — no token needed, proxies through Contentstack's own bridge — but
it doesn't actually work: every `appSdk.metadata.*` call goes to
`{region}-app.contentstack.com/api/v3/metadata` (the web app's own internal domain), not
`{region}-api.contentstack.com/v3/metadata` (the real, public CMA that CDA and the entry's
own `_metadata` block actually read from). Writes through the SDK bridge return `200` and
even read back correctly through that *same* bridge, so the sidebar looked like it was
working — but the write never reached the real backend, confirmed by it never showing up
via a direct CMA fetch (`?include_metadata=true`) or CDA, no matter how the entry was
published/republished. A manual `POST` straight to `{region}-api.contentstack.com/v3/metadata`
worked immediately, no separate publish step needed, which is what led to this fix:
`src/lib/cmaClient.js` builds an authenticated axios client for the real CMA host
(`src/lib/regions.js` maps `appSdk.getCurrentRegion()`'s NA/EU/AZURE_NA/AZURE_EU to the
right base URL — auto-detected, no config needed), and `src/lib/metadata.js` uses it
directly instead of `appSdk.metadata`.

Entry Metadata is anchored to a **manually-created Extension UID** stored in app config
(`config.extensionUid`), not to any SDK-provided identifier. Two candidates that looked
like they'd let the app use its own installed identity both turned out not to work:

- `appSdk.installationUID` (the per-stack app installation UID) is rejected outright by
  the CMA ("refers to an Extension that does not exist") — it's a different ID namespace
  (Mongo ObjectId) than real Extension UIDs (`blt...`).
- `appSdk.locationUID` (this app's per-location `extension_uid`) *is* a valid, accepted
  Extension UID — but isn't stable. Confirmed against a real stack: creating a new entry
  and saving it for the first time reloads the editor page, and that reload produced a
  *different* `locationUID`, silently orphaning the metadata record written before the
  reload instead of updating it — two separate metadata records ended up on the same
  entry. A manually-created Extension's UID never changes, since nothing in the
  entry/session lifecycle can touch it, so that's what this app anchors to instead. See
  "One-time setup" below for creating it.

**App Configuration** screen (stack-level) stores: a management token (used only for the
metadata write), the metadata anchor extension UID, the field UID to read (default
`url`), and whether to auto-republish after a sync.

**Entry Sidebar** widget syncs on mount, on entry save, and via a manual "Sync now"
button. The App SDK has no dedicated event for unlocalizing a locale (only
`entrySave`/`entryChange`/`entryPublish`/`entryUnPublish` exist) — unlocalizing reloads
the entry editor, which remounts this sidebar, so syncing on mount is what catches it and
drops the removed locale from the metadata map. Each sync:
1. Reads the `url` field for every locale configured on the stack. The CMA doesn't 404
   for a locale the entry isn't localized into — it silently falls back to the master
   locale's content instead, so the response's own `locale` field is checked against the
   one requested; a mismatch means fallback content, and that locale is skipped.
2. Writes that map to Entry Metadata, anchored to the configured extension UID,
   **replacing** whatever was stored before (not merging) — since every sync re-reads
   every stack locale, the fresh map is always the complete, authoritative one. This also
   means a locale that gets unlocalized is correctly dropped on the next sync.
3. Optionally republishes the entry for locale/environment combinations that were
   **already published**, via `stack.ContentType(ct).Entry(uid).publish(...)`, to keep the
   entry's own content fresh if the `url` field itself changed. Not needed for the
   metadata to show up — the direct CMA write is visible immediately.

### Why metadata, not a schema field

Writing to a schema field via CMA bumps the entry version and fires the entry `update`
event. If anything (like the old Automate automation) listens for that event, you get a
loop. Metadata writes don't bump the version or fire that event.

### CDA read shape

Once synced, fetch the entry with (no publish/republish required beyond whatever
publish state the entry itself is already in — CDA only serves published content):

```
GET /v3/content_types/article/entries/{uid}?locale=en-us&include_metadata=true
```

The map is at `entry._metadata.extensions.{extension_uid}[0].language_urls`.

## One-time setup

### 1. Create a Management Token

Settings → Tokens → Management Tokens → create one scoped to this stack. Used only for
the metadata write (see "How it works" above) — paste it into the app's config screen in
step 4.

### 2. Create the metadata anchor extension

Entry Metadata must reference an existing Extension, with a UID that never changes.
Create one inert Custom Field extension that's never attached to a content type:

- Settings → Extensions → New → Custom Field (any minimal config is fine), **or**
- `POST /v3/extensions` via CMA.

Copy its UID — you'll also paste this into the app's config screen in step 4.

### 3. Register the App in Developer Hub

Organization → Developer Hub → Create App. Add two UI locations:

- **App Configuration** → path `/` (served by this app)
- **Entry Sidebar** → path `/` (served by this app)

`manifest.json` in this repo is a reference copy of that shape — Developer Hub assigns
the real installation UID when you install the app on a stack, so treat the file as
documentation unless you're managing the app via CLI/API.

### 3. Run locally and install

```bash
npm install
npm run dev
```

This serves the app at `http://localhost:3000`.

**Tunnel it through ngrok** (or Cloudflare Tunnel / localtunnel) rather than pointing
Developer Hub straight at `localhost`: recent Chrome/Edge versions enforce Local Network
Access restrictions that block `app.contentstack.com` (a public page) from loading an
iframe from `localhost` at all — you'll see a broken-image icon and a "connection is
blocked because it was initiated by a public page" error.

```bash
ngrok http 3000
```

Use the resulting `https://<subdomain>.ngrok-free.app` URL as the app's hosting URL in
Developer Hub instead of `localhost:3000`, then install the app on your stack. Open any
`article` entry — the sidebar widget should appear.

`vite.config.js` already allow-lists `.ngrok-free.app` in `server.allowedHosts` (Vite
otherwise rejects requests carrying an unrecognized `Host` header). A free-tier ngrok
tunnel gets a new random subdomain on every restart — update the hosting URL in Developer
Hub each time, or use a paid ngrok plan / another tunnel provider with a stable domain.

### 4. Configure

Open the app's config screen (Settings → Apps → Locale URL List Monitor → Configure) and
set the management token (from step 1), the metadata anchor extension UID (from step 2),
the field UID to aggregate (`url`), and whether to auto-republish. Save.

### 5. Deploying to Contentstack Launch

When ready to move off localhost: `npm run build`, connect this repo to a Launch project,
point the build output (`dist/`) as the deployment, and update the app's hosting URL in
Developer Hub to the Launch URL.

## Known limitations / things to verify

- **`appSdk.metadata` (the App SDK's built-in Entry Metadata client) doesn't actually
  work** — this is the big one, and it's why `src/lib/metadata.js` calls the real CMA
  directly instead (see "How it works"). Every `appSdk.metadata.*` call routes to
  `{region}-app.contentstack.com/api/v3/metadata` — the web app's own internal domain —
  not the real public CMA. Writes through it return `200`, read back correctly through
  that same bridge, and even survive a lookup-then-update cycle correctly (so the sidebar
  looks completely healthy) — but never propagate to whatever CDA and a direct CMA fetch
  actually read from. Confirmed by HAR capture (write `200`s and reads back fine via
  `eu-app.contentstack.com`) contrasted against a direct `include_metadata=true` fetch and
  CDA both showing nothing, and then a manual `POST` straight to `eu-api.contentstack.com`
  working immediately with no separate publish step. Along the way, also confirmed (now
  moot, but documented in git history in case `appSdk.metadata` is revisited): its methods
  don't unwrap the bridge's `{ data: ... }` envelope the way `appSdk.stack`'s methods do,
  so a naive `result.metadata` read silently comes back `undefined`.
- **`appSdk.stack.getLocales()` and `.Entry().fetch()` shapes** aren't pinned down in the
  public SDK types either, but empirically `.fetch()` resolves to `{ entry: {...} }`
  (confirmed — locale URLs now populate correctly after unwrapping `.entry`).
  `getLocales()`'s exact shape (`{ locales: [...] }` vs. bare array) is still an
  assumption — confirm the sidebar shows every stack locale, not just some.
- **`.publish()` payload shape** (`src/lib/aggregate.js`, `republishCurrentLocale`) is
  modeled on the standard CMA publish body (`{ entry: { environments, locales } }`) but
  isn't fully pinned down in the public SDK types either. If auto-republish errors, check
  what the parent frame actually expects and adjust.
- **Race conditions**: near-simultaneous saves both recompute and overwrite the whole
  metadata map from scratch (see "replacing, not merging" above), so the last sync to
  finish wins outright — no partial-merge corruption, but a genuinely concurrent editor
  save elsewhere could still get overwritten by a sync that started before it landed. Low
  risk for typical single-editor usage.
- **`appSdk.location.AppConfigWidget` has no `getConfig`/`setConfig` of its own**
  (`src/pages/ConfigPage.jsx`) — those only exist on the top-level `appSdk` object (used
  by the Sidebar widget to *read* config). Calling `widget.getConfig()` on the location
  object throws `TypeError: widget.getConfig is not a function` and blanks the whole
  screen (an uncaught render error with no error boundary). The Config screen's real API
  wraps everything under `installation.getInstallationData()` /
  `installation.setInstallationData({ ...data, configuration })` — non-sensitive config
  lives in the `configuration` key, which is what `appSdk.getConfig()` reads elsewhere.
- **The Config screen's iframe is sandboxed without `allow-forms`** (`src/pages/
  ConfigPage.jsx`) — a native `<form onSubmit>` submission is blocked outright by the
  browser regardless of calling `preventDefault()`, logging "Blocked form submission...
  because the form's frame is sandboxed." Fixed by dropping `<form>` for a plain `<div>`
  and a `type="button"` with an `onClick` handler instead of `type="submit"`.
- **Concurrent syncs race on create-vs-update** (`src/pages/SidebarWidget.jsx`). Two
  nearly-simultaneous `runSync()` calls — confirmed via React StrictMode double-invoking
  the mount effect and the `entry.onSave` registration in dev, but a fast double-click on
  "Sync now" could trigger the same thing in production — both check "does metadata exist
  yet?" before either has written it, and both try to `create`; the second one collides
  and fails with "Metadata already exists for the `{entity_uid}` entity UID" (confirmed
  against a real stack via HAR capture). Fixed with an in-flight guard: a trigger that
  arrives while a sync is running gets queued to run once more after, instead of starting
  a concurrent one.
- **Cleanup after the `locationUID` anchor bug**: any entry synced before the fix that
  anchors to a manually-created extension (see "How it works") may have orphaned metadata
  records under stale, one-off `locationUID` values sitting alongside the real one. They're
  inert (nothing reads them, since CDA reads scope by extension UID) but you can delete
  them via `GET /v3/metadata/?query={"entity_uid":"<uid>"}` to find them and `DELETE
  /v3/metadata/{metadata_uid}` to remove the stale ones, if you want the entry's `_metadata`
  block to stop showing duplicates.
