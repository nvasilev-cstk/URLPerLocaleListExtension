import React, { useEffect, useRef, useState } from 'react';
import { syncLocaleUrls } from '../lib/aggregate.js';

export default function SidebarWidget({ appSdk }) {
  const sidebarWidget = appSdk.location.SidebarWidget;
  const [languageUrls, setLanguageUrls] = useState({});
  const [status, setStatus] = useState('loading'); // loading | idle | syncing | error
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);
  const [republish, setRepublish] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const configRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    appSdk
      .getConfig()
      .then(async (cfg) => {
        if (cancelled) return;
        configRef.current = cfg;
        // Sync on every mount, not just on save. The App SDK has no dedicated event for
        // unlocalizing a locale (only entrySave/entryChange/entryPublish/entryUnPublish
        // exist) — unlocalizing reloads the entry editor, which remounts this sidebar, so
        // this is the only reliable way to catch it and drop the removed locale from the
        // metadata map.
        await runSync();
        if (cancelled) return;
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err?.message || 'Failed to load app configuration');
        setStatus('error');
      });

    // Also auto-sync whenever the entry is saved.
    sidebarWidget.entry.onSave(() => {
      runSync();
    });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only one sync runs at a time. Two nearly-simultaneous triggers (e.g. React
  // StrictMode double-invoking the mount effect and the onSave registration in dev, or a
  // fast double-click on "Sync now" in general) would otherwise both check "does metadata
  // exist yet?" before either had written it, and both try to create — the second create
  // then fails with "Metadata already exists" (confirmed against a real stack). A trigger
  // that arrives while a sync is in flight is queued to run once, not dropped, so it
  // still picks up anything that changed since the in-flight sync started.
  async function runSync() {
    const cfg = configRef.current;
    if (!cfg) return;

    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      return;
    }
    syncInFlightRef.current = true;

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
    } finally {
      syncInFlightRef.current = false;
      if (pendingSyncRef.current) {
        pendingSyncRef.current = false;
        runSync();
      }
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
        <p className="hint">No localized URLs found for this entry.</p>
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
