import { upsertLanguageUrlsMetadata } from './metadata.js';

/**
 * Reads the configured field across all configured locales for the current entry,
 * builds a { locale: url } map, and writes it to Entry Metadata.
 *
 * Everything here goes through the App SDK (appSdk.stack / appSdk.metadata), which rides
 * the editor's own authenticated session via Contentstack's parent-frame bridge — no
 * management token or region config needed.
 *
 * Entry Metadata is anchored to a manually-created Extension UID (config.extensionUid),
 * NOT to any SDK-provided identifier. Both candidates that looked "free" turned out not
 * to work:
 *   - appSdk.installationUID (the per-stack app installation UID) is rejected outright by
 *     the CMA ("refers to an Extension that does not exist") — it's a different ID
 *     namespace (Mongo ObjectId) than real Extension UIDs (`blt...`).
 *   - appSdk.locationUID (this app's per-location `extension_uid`) IS a valid, accepted
 *     Extension UID, but isn't stable: confirmed against a real stack that creating a new
 *     entry and saving it for the first time (which reloads the editor page) produces a
 *     *different* locationUID on reload, silently orphaning the metadata record written
 *     before the reload instead of updating it. A manually-created Extension's UID never
 *     changes, since nothing in the entry/session lifecycle can touch it.
 */
export async function syncLocaleUrls({ appSdk, sidebarWidget, config }) {
  const entry = sidebarWidget.entry;
  const entryData = entry.getData();
  const stack = appSdk.stack;

  const entryUid = entryData.uid;
  const contentTypeUid = entry.content_type?.uid;
  const fieldUid = config.fieldUid || 'url';
  const currentLocale = entry.locale;
  const extensionUid = config.extensionUid;

  if (!extensionUid) {
    throw new Error('No metadata anchor extension configured. Set one in the app configuration.');
  }

  if (!contentTypeUid) {
    throw new Error('Could not determine the content type UID for this entry.');
  }

  const locales = await getStackLocaleCodes(stack);
  if (locales.length === 0) {
    throw new Error('This stack has no locales configured.');
  }

  const perLocale = {};
  const errors = [];

  for (const locale of locales) {
    try {
      const result = await stack
        .ContentType(contentTypeUid)
        .Entry(entryUid)
        .language(locale)
        .fetch();

      // Resolved shape isn't pinned down in the public SDK types — unwrap defensively
      // in case it mirrors the raw CMA "Get an Entry" response ({ entry: {...} }).
      const localizedEntry = result?.entry ?? result;

      // The CMA doesn't 404 when an entry isn't localized into the requested locale —
      // it silently falls back to the master locale's content instead. The response's
      // own `locale` field reports which locale was actually served; if it doesn't match
      // what we asked for, this is inherited fallback content, not a real localization.
      const servedLocale = localizedEntry?.locale;
      if (servedLocale && servedLocale !== locale) {
        continue;
      }

      const value = localizedEntry?.[fieldUid];
      if (value) {
        perLocale[locale] = value;
      }
      // No value / entry not localized for this locale: silently skip, not an error.
    } catch (err) {
      // 404-ish "entry not found for this locale" is expected for unlocalized entries.
      const status = err?.response?.status || err?.status;
      if (status !== 404) {
        errors.push({ locale, message: err?.message || 'Failed to fetch entry for locale' });
      }
    }
  }

  // perLocale is already the complete, authoritative map — every sync re-reads every
  // stack locale (see getStackLocaleCodes below), so there's no need to merge onto
  // whatever was stored previously. Replacing outright also means a locale that gets
  // unlocalized (or a stale fallback value from before the locale-fallback fix above)
  // is correctly dropped on the next sync instead of lingering forever.
  const metadata = await upsertLanguageUrlsMetadata(appSdk, {
    entryUid,
    contentTypeUid,
    extensionUid,
    locale: currentLocale,
    languageUrls: perLocale
  });

  let republish = { attempted: false };
  if (config.autoRepublish) {
    republish = await republishCurrentLocale({ stack, contentTypeUid, entryUid, entryData, currentLocale });
  }

  return {
    languageUrls: perLocale,
    errors,
    republish,
    syncedAt: new Date().toISOString(),
    metadataUid: metadata?.uid
  };
}

/**
 * Every locale configured on the stack, fetched fresh on each sync so newly added
 * locales are picked up without touching app config. `getLocales()`'s resolved shape
 * isn't pinned down in the public SDK types — unwrap defensively.
 */
async function getStackLocaleCodes(stack) {
  const result = await stack.getLocales();
  const list = result?.locales ?? result;
  return (Array.isArray(list) ? list : []).map((l) => l?.code).filter(Boolean);
}

/**
 * Republishes the entry for the locale/environments it's already published in, so the
 * refreshed metadata becomes visible via CDA. Never publishes a locale/environment that
 * wasn't already published — this only refreshes existing publishes.
 *
 * NOTE: the exact payload shape .publish() forwards to Contentstack's parent frame isn't
 * pinned down in the public App SDK types (typed `any`) — this mirrors the documented CMA
 * "Publish an Entry" body (`{ entry: { environments, locales } }`). Verify against actual
 * behavior once running inside a real entry editor, and adjust if it errors.
 */
async function republishCurrentLocale({ stack, contentTypeUid, entryUid, entryData, currentLocale }) {
  try {
    const publishDetails = entryData?.publish_details || [];
    const environments = publishDetails
      .filter((pd) => pd.locale === currentLocale)
      .map((pd) => pd.environment);

    if (environments.length === 0) {
      return { attempted: false, reason: 'not-currently-published' };
    }

    await stack
      .ContentType(contentTypeUid)
      .Entry(entryUid)
      .language(currentLocale)
      .publish({ entry: { environments, locales: [currentLocale] } });

    return { attempted: true, success: true, environments };
  } catch (err) {
    return { attempted: true, success: false, error: err?.message || 'Republish failed' };
  }
}
