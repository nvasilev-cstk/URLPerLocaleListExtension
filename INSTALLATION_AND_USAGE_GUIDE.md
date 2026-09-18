# Locale URL List Monitor — Installation & Usage Guide

This guide walks through installing the **Locale URL List Monitor** app on a Contentstack
stack, using it day-to-day as a content editor, and querying the resulting data through
the Content Delivery API (CDA) once an entry is published.

For how the app works internally and a log of bugs found while building it, see
[README.md](README.md). This guide only covers the parts a stack admin or content editor
needs.

---

## Part 1 — Installation

You'll need **stack admin (or Owner) access** to complete these steps.

### Step 1: Create a Management Token

The app needs a Management Token to write to Entry Metadata.

1. In your stack, go to **Settings → Tokens**.
2. Open the **Management Tokens** tab and click **+ Add Token**.
3. Give it a name (e.g. `Locale URL List Monitor`), leave the scope as read/write for
   entries, and save.
4. Copy the token value now — Contentstack only shows it once.

> 📸 **Screenshot placeholder — Management Tokens screen**
> Capture: the Settings → Tokens → Management Tokens tab, with the "+ Add Token" button
> visible, and ideally the token-creation dialog (name field, scope checkboxes) mid-fill.
> Redact/blur the actual token value if capturing the token-created confirmation screen.

### Step 2: Create the metadata anchor extension

Entry Metadata must reference an existing Extension whose UID never changes. This
extension is never attached to any content type — it exists only as a stable anchor.

1. Go to **Settings → Extensions**.
2. Click **+ New Extension** and choose **Custom Field**.
3. Fill in any minimal configuration (name it something recognizable, e.g.
   `Locale URL Metadata Anchor`) and save. You do **not** need to add this field to any
   content type.
4. Open the extension and copy its **UID** from the URL or the extension's details panel.

> 📸 **Screenshot placeholder — Extensions list + new Custom Field dialog**
> Capture: the Settings → Extensions list showing the new "Locale URL Metadata Anchor"
> entry, and the extension's detail view with its UID visible/highlighted.

### Step 3: Install the app on your stack

1. From your organization menu, open **Developer Hub**.
2. Find **Locale URL List Monitor** in your organization's app list (or install it from
   wherever it's shared — e.g. a Marketplace listing link, if published there).
3. Click **Install**, choose the target stack, and confirm the requested permissions.

> 📸 **Screenshot placeholder — Developer Hub app install flow**
> Capture: the app's Developer Hub page with the "Install" button, and the
> stack-selection step of the install dialog.

### Step 4: Configure the app

1. In the stack, go to **Settings → Apps**, find **Locale URL List Monitor**, and click
   its **Configure** (gear) icon.
2. Fill in:
   - **Management token** — the token from Step 1.
   - **Metadata anchor extension UID** — the UID from Step 2.
   - **Field UID to aggregate** — the localizable field to read per locale (default
     `url`).
   - **Auto-republish** — turn on if you want the entry automatically republished (for
     locale/environment combinations already published) after every sync.
3. Click **Save configuration**.

> 📸 **Screenshot placeholder — App Configuration screen, filled in**
> Capture: the full Configuration screen with all fields filled (blur/redact the
> management token field), and the "Saved." confirmation message after clicking save.

Installation is complete. The app is now active for every entry of the content type(s)
it's scoped to (by default, `article`).

---

## Part 2 — Usage (for content editors)

### The sidebar widget

Open any entry of the configured content type. A **Locale URLs** panel appears in the
entry sidebar, listing every locale the entry is genuinely localized into, alongside the
value of the configured field (e.g. `url`) for that locale.

> 📸 **Screenshot placeholder — Sidebar widget with populated locale list**
> Capture: an entry editor with the "Locale URLs" sidebar panel open, showing several
> rows of `locale → url`, the "Sync now" button, and the "Last synced" timestamp at the
> bottom.

### When syncing happens

The list updates automatically:
- **When the entry is saved.**
- **When the sidebar loads** (e.g. opening the entry, or after any full page reload) —
  this is also what catches a locale being *removed* (unlocalized), since Contentstack
  has no dedicated event for that action.

You can also trigger it manually any time by clicking **Sync now** — useful right after
localizing into a new locale, or if you just want to confirm the list is current without
waiting for a save.

> 📸 **Screenshot placeholder — mid-sync state**
> Capture: the sidebar with the button showing "Syncing…" (disabled state), to illustrate
> what an in-progress sync looks like.

### Reading the panel

- Each row is `locale code → field value` for every locale where the entry is genuinely
  localized (not just inheriting the master locale's fallback content).
- **Last synced** shows when the list was last refreshed.
- If a locale's read failed for some reason, a warning appears below the table naming the
  locale and the error.
- If auto-republish is on, a line below the table reports whether the republish succeeded
  and which environments it applied to.

> 📸 **Screenshot placeholder — warnings/republish status**
> Capture: the sidebar showing a locale-fetch warning message and/or a "Republished
> (environment_name)" status line, if you can reproduce one (e.g. by temporarily breaking
> a locale's field, or toggling auto-republish on).

### What you don't need to do

You don't need to manually keep a list of locales anywhere — the app reads the full
locale list from the stack on every sync, so adding a new locale to the stack is enough
for it to start being covered automatically.

---

## Part 3 — Querying the data via CDA

Once an entry has been synced (via the sidebar) **and published** to an environment, its
full locale → URL map is retrievable in a single Content Delivery API call — the entire
point of this app.

### Endpoint

```
GET https://{cda-host}/v3/content_types/{content_type_uid}/entries/{entry_uid}
    ?environment={environment_name}
    &locale={any_locale_code}
    &include_metadata=true
```

- `{cda-host}` depends on your stack's region, e.g. `eu-cdn.contentstack.com` for AWS EU,
  `cdn.contentstack.io` for AWS NA. Check **Settings → Stack Settings** if unsure.
- `{content_type_uid}` — e.g. `article`.
- `{entry_uid}` — the entry's UID.
- `environment` — must be an environment the entry is actually published to.
- `locale` — any valid locale code; the base entry fields returned will be for that
  locale, but the `_metadata` block described below is the same regardless of which
  locale you request.
- `include_metadata=true` — **required**. Without this, `_metadata` is omitted entirely.

### Example request

```bash
curl "https://eu-cdn.contentstack.com/v3/content_types/article/entries/blt1234567890abcdef?environment=production&locale=en-us&include_metadata=true" \
  -H "api_key: <your_stack_api_key>" \
  -H "access_token: <your_delivery_token>"
```

Use a **Delivery Token** (`access_token`), created under **Settings → Tokens → Delivery
Tokens** — this is different from the Management Token used by the app itself.

### Example response

```json
{
  "entry": {
    "uid": "blt1234567890abcdef",
    "title": "My Article",
    "url": "/my-article",
    "locale": "en-us",
    "_metadata": {
      "extensions": {
        "<your_extension_uid>": [
          {
            "uid": "cs...",
            "language_urls": {
              "en-us": "/my-article",
              "de-de": "/my-artikel",
              "fr-fr": "/mon-article"
            },
            "_version": 3
          }
        ]
      }
    }
  }
}
```

The full locale → URL map is at:

```
entry._metadata.extensions["<your_extension_uid>"][0].language_urls
```

> 📸 **Screenshot placeholder — Postman/browser showing the CDA response**
> Capture: a REST client (Postman, Insomnia, or browser dev tools) showing the request
> URL/headers on one side and the JSON response with the populated `_metadata.extensions`
> block clearly visible.

### Things that will make this come back empty

- **The entry isn't published to the environment you're querying.** CDA only serves
  published content — sync the entry via the sidebar, then publish it (or enable
  auto-republish in the app config so this happens automatically after each sync, for
  environments already published).
- **Missing `include_metadata=true`.** The base entry will return fine, but `_metadata`
  won't be present at all.
- **Wrong extension UID.** Double check it against what's configured in the app's
  Configuration screen (Part 1, Step 4) — it's the object key under
  `_metadata.extensions`.

### Querying via CMA instead

The same `_metadata` block is visible pre-publish via the Content Management API (useful
for verifying a sync worked before publishing):

```bash
curl "https://eu-api.contentstack.com/v3/content_types/article/entries/blt1234567890abcdef?include_metadata=true" \
  -H "api_key: <your_stack_api_key>" \
  -H "authorization: <a_management_token>"
```

> 📸 **Screenshot placeholder — Entry JSON view in the Contentstack UI**
> Capture: the entry editor's "JSON View" panel (if your stack's UI exposes one) showing
> the entry's raw fields — note whether `_metadata` appears here directly; in this app's
> testing it sometimes required a direct CMA/CDA call with `include_metadata=true` rather
> than relying on that panel alone.
