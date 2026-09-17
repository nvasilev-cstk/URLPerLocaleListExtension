import { createCmaClient } from './cmaClient.js';
import { upsertLanguageUrlsMetadata } from './metadata.js';

/**
 * Reads the configured field across every stack locale for the current entry, builds a
 * { locale: url } map, and writes it to Entry Metadata.
 *
 * Locale reads go through the App SDK (appSdk.stack), riding the editor's own
 * authenticated session — no token needed for those. The metadata write is the one call
 * that goes straight to the real CMA host with a management token, bypassing
 * appSdk.metadata's built-in bridge entirely — see cmaClient.js for why: that bridge
 * routes through the web app's own internal domain, not the CMA that CDA actually reads
 * from, so writes through it silently never become visible (confirmed against a live
 * stack: a manual POST straight to the real CMA host worked immediately, no separate
 * publish step needed, while identical-looking writes through the SDK bridge never did).
 *
 * Entry Metadata is anchored to a manually-created Extension UID (config.extensionUid),
 * not to any SDK-provided identifier — appSdk.installationUID is rejected by the CMA
 * outright (wrong ID namespace), and appSdk.locationUID, while a valid Extension UID,
 * isn't stable across certain page reloads (confirmed: creating and saving a new entry
 * reloads the editor and mints a *different* locationUID, orphaning the prior write). A
 * manually-created Extension's UID never changes.
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
  if (!config.managementToken) {
    throw new Error('No management token configured. Set one in the app configuration.');
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

  const stackData = await stack.getData();
  const apiKey = stackData.api_key || stackData.apiKey;
  const cma = createCmaClient({
    apiKey,
    managementToken: config.managementToken,
    region: appSdk.getCurrentRegion?.()
  });

  // perLocale is already the complete, authoritative map — every sync re-reads every
  // stack locale, so there's no need to merge onto whatever was stored previously.
  // Replacing outright also means a locale that gets unlocalized (or a stale fallback
  // value from before the locale-fallback fix above) is correctly dropped on the next
  // sync instead of lingering forever.
  const metadata = await upsertLanguageUrlsMetadata(cma, {
    entryUid,
    contentTypeUid,
    extensionUid,
    locale: currentLocale,
    languageUrls: perLocale
  });

  let republish = { attempted: false };
  if (config.autoRepublish) {
    const environments = getPublishedEnvironments(entryData, currentLocale);
    republish = await republishCurrentLocale({ stack, contentTypeUid, entryUid, environments, currentLocale });
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
 * Environments the entry is already published to, for the given locale. Used to scope
 * the optional entry republish — never publishes a locale/environment combo that wasn't
 * already published.
 */
function getPublishedEnvironments(entryData, locale) {
  const publishDetails = entryData?.publish_details || [];
  return publishDetails.filter((pd) => pd.locale === locale).map((pd) => pd.environment);
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
 * Republishes the entry for the locale/environments it's already published in. Optional —
 * unlike the metadata write itself (which the "manual POST works immediately" test showed
 * doesn't need this), this just keeps the entry's own content fresh if the URL field
 * itself changed. Never publishes a locale/environment that wasn't already published.
 *
 * NOTE: the exact payload shape .publish() forwards to Contentstack's parent frame isn't
 * pinned down in the public App SDK types (typed `any`) — this mirrors the documented CMA
 * "Publish an Entry" body (`{ entry: { environments, locales } }`). Verify against actual
 * behavior once running inside a real entry editor, and adjust if it errors.
 */
async function republishCurrentLocale({ stack, contentTypeUid, entryUid, environments, currentLocale }) {
  if (environments.length === 0) {
    return { attempted: false, reason: 'not-currently-published' };
  }

  try {
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
