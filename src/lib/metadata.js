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
  const matches = data.metadata || [];

  if (matches.length <= 1) {
    return matches[0] || null;
  }

  // More than one record for the same (entity, extension) pair means a duplicate was
  // created at some point — most likely two page loads/mounts racing each other, a case
  // the sidebar's own in-flight guard can't cover since it only serializes syncs within
  // one already-open instance. Confirmed against a real stack: one record sat frozen at
  // _version 1 while another kept growing, because a naive "take the first result" read
  // happened to always land on the live one and silently ignored the dead one sitting
  // right next to it. Self-heal instead: adopt whichever was updated most recently, and
  // delete the rest so the duplicate doesn't linger forever.
  const [winner, ...stale] = [...matches].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
  );
  await Promise.all(
    stale.map((record) => cma.delete(`/v3/metadata/${record.uid}`).catch(() => {}))
  );
  return winner;
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
