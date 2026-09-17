import React, { useEffect, useRef, useState } from 'react';
import { syncLocaleUrls } from '../lib/aggregate.js';
import { getLanguageUrlsMetadata } from '../lib/metadata.js';

export default function SidebarWidget({ appSdk }) {
  const sidebarWidget = appSdk.location.SidebarWidget;
  const [config, setConfig] = useState(null);
  const [languageUrls, setLanguageUrls] = useState({});
  const [status, setStatus] = useState('loading'); // loading | idle | syncing | error
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);
  const [republish, setRepublish] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const configRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    appSdk
      .getConfig()
      .then(async (cfg) => {
        if (cancelled) return;
        configRef.current = cfg;
        setConfig(cfg);
        await loadExisting(cfg);
        if (cancelled) return;
        setStatus('idle');
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err?.message || 'Failed to load app configuration');
        setStatus('error');
      });

    // Auto-sync whenever the entry is saved.
    sidebarWidget.entry.onSave(() => {
      runSync();
    });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadExisting() {
    try {
      const existing = await getLanguageUrlsMetadata(appSdk, {
        entryUid: sidebarWidget.entry.getData().uid,
        contentTypeUid: sidebarWidget.entry.content_type?.uid,
        extensionUid: appSdk.locationUID
      });
      if (existing) {
        setLanguageUrls(existing.languageUrls);
      }
    } catch {
      // No existing metadata yet, or a lookup error — non-fatal, "Sync now" will populate it.
    }
  }

  async function runSync() {
    const cfg = configRef.current;
    if (!cfg) return;

    setStatus('syncing');
    setErrorMessage('');
    try {
      const result = await syncLocaleUrls({ appSdk, sidebarWidget, config: cfg });
      setLanguageUrls(result.languageUrls);
      setFieldErrors(result.errors);
      setRepublish(result.republish);
      setLastSynced(result.syncedAt);
      setStatus('idle');
    } catch (err) {
      setErrorMessage(err?.message || 'Sync failed');
      setStatus('error');
    }
  }

  if (status === 'loading') {
    return <div className="app-shell app-loading">Loading…</div>;
  }

  const locales = Object.keys(languageUrls);

  return (
    <div className="app-shell sidebar-widget">
      <div className="sidebar-header">
        <h3>Locale URLs</h3>
        <button onClick={runSync} disabled={status === 'syncing'}>
          {status === 'syncing' ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {status === 'error' && <p className="status-error">{errorMessage}</p>}

      {locales.length === 0 ? (
        <p className="hint">No URLs synced yet. Click "Sync now" or save the entry.</p>
      ) : (
        <table className="locale-url-table">
          <tbody>
            {locales.map((locale) => (
              <tr key={locale}>
                <td className="locale-cell">{locale}</td>
                <td className="url-cell">{languageUrls[locale]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {fieldErrors.length > 0 && (
        <div className="warnings">
          {fieldErrors.map((e) => (
            <p key={e.locale} className="status-error">
              {e.locale}: {e.message}
            </p>
          ))}
        </div>
      )}

      {republish?.attempted && (
        <p className={republish.success ? 'status-ok' : 'status-error'}>
          {republish.success
            ? `Republished (${republish.environments?.join(', ')})`
            : `Republish failed: ${republish.error}`}
        </p>
      )}

      {lastSynced && (
        <p className="hint small">Last synced {new Date(lastSynced).toLocaleString()}</p>
      )}
    </div>
  );
}
