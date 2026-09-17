// Entry Metadata (/v3/metadata) helpers, via the App SDK's built-in `appSdk.metadata`
// client. This proxies through Contentstack's own parent-frame bridge (postRobot), which
// makes the authenticated CMA call on the app's behalf — no management token needed.
//
// Metadata writes don't bump the entry version or fire the entry `update` event, so
// they're safe to do from inside the entry editor without re-triggering anything else
// that also listens for entry updates.

// Unlike appSdk.stack's methods (getLocales, getContentTypes, ...), which end with
// `.then(onData).catch(onError)` to unwrap the bridge's outer `{ data: ... }` envelope,
// the Metadata class's methods return the raw `sendToParent(...)` promise as-is (verified
// against the compiled @contentstack/app-sdk source — no such .then chain on
// createMetaData/retrieveAllMetaData/updateMetaData). So the resolved value here still
// has that envelope: `{ data: { metadata: ... } }`. Confirmed in practice: without
// unwrapping `.data` first, the list lookup always came back empty and every sync tried
// (and failed) to create a metadata record that already existed.
function unwrapOne(result) {
  const body = result?.data ?? result;
  return body?.metadata ?? body ?? null;
}

function unwrapList(result) {
  const body = result?.data ?? result;
  const list = body?.metadata ?? body;
  return Array.isArray(list) ? list : [];
}

async function findExisting(appSdk, { entryUid, contentTypeUid, extensionUid }) {
  const query = JSON.stringify({
    entity_uid: entryUid,
    _content_type_uid: contentTypeUid,
    extension_uid: extensionUid
  });
  const result = await appSdk.metadata.retrieveAllMetaData({ query });
  const [existing] = unwrapList(result);
  return existing || null;
}

export async function getLanguageUrlsMetadata(appSdk, opts) {
  const existing = await findExisting(appSdk, opts);
  return existing ? { uid: existing.uid, languageUrls: existing.language_urls || {} } : null;
}

export async function upsertLanguageUrlsMetadata(appSdk, { entryUid, contentTypeUid, extensionUid, locale, languageUrls }) {
  const existing = await findExisting(appSdk, { entryUid, contentTypeUid, extensionUid });

  if (existing) {
    const result = await appSdk.metadata.updateMetaData({
      uid: existing.uid,
      type: 'entry',
      _content_type_uid: contentTypeUid,
      extension_uid: extensionUid,
      locale,
      language_urls: languageUrls
    });
    return unwrapOne(result);
  }

  const result = await appSdk.metadata.createMetaData({
    entity_uid: entryUid,
    type: 'entry',
    _content_type_uid: contentTypeUid,
    extension_uid: extensionUid,
    locale,
    language_urls: languageUrls
  });
  return unwrapOne(result);
}
