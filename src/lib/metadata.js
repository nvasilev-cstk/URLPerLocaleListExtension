// Entry Metadata (/v3/metadata) helpers, via a direct authenticated call to the real CMA
// host (see cmaClient.js for why appSdk.metadata's built-in bridge doesn't work here).
//
// Metadata writes don't bump the entry version or fire the entry `update` event, so
// they're safe to do from inside the entry editor without re-triggering anything else
// that also listens for entry updates.

async function findExisting(cma, { entryUid, contentTypeUid, extensionUid }) {
  const query = JSON.stringify({
    entity_uid: entryUid,
    _content_type_uid: contentTypeUid,
    extension_uid: extensionUid
  });
  const { data } = await cma.get('/v3/metadata/', { params: { query } });
  const [existing] = data.metadata || [];
  return existing || null;
}

export async function upsertLanguageUrlsMetadata(cma, { entryUid, contentTypeUid, extensionUid, locale, languageUrls }) {
  const existing = await findExisting(cma, { entryUid, contentTypeUid, extensionUid });

  if (existing) {
    const { data } = await cma.put(`/v3/metadata/${existing.uid}`, {
      metadata: {
        uid: existing.uid,
        type: 'entry',
        _content_type_uid: contentTypeUid,
        extension_uid: extensionUid,
        locale,
        language_urls: languageUrls
      }
    });
    return data.metadata;
  }

  const { data } = await cma.post('/v3/metadata', {
    metadata: {
      entity_uid: entryUid,
      type: 'entry',
      _content_type_uid: contentTypeUid,
      extension_uid: extensionUid,
      locale,
      language_urls: languageUrls
    }
  });
  return data.metadata;
}
