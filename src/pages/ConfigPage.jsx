import React, { useEffect, useState } from 'react';

const DEFAULTS = {
  fieldUid: 'url',
  autoRepublish: false
};

export default function ConfigPage({ appSdk }) {
  const widget = appSdk.location.AppConfigWidget;
  const [form, setForm] = useState(DEFAULTS);
  const [status, setStatus] = useState('loading'); // loading | idle | saving | saved | error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    widget
      .getConfig()
      .then((cfg) => {
        setForm({ ...DEFAULTS, ...cfg });
        setStatus('idle');
      })
      .catch((err) => {
        setErrorMessage(err?.message || 'Failed to load configuration');
        setStatus('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setStatus('saving');
    setErrorMessage('');
    try {
      await widget.setConfig(form);
      setStatus('saved');
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to save configuration');
      setStatus('error');
    }
  }

  if (status === 'loading') {
    return <div className="app-shell app-loading">Loading configuration…</div>;
  }

  return (
    <div className="app-shell config-page">
      <h2>Locale URL List Monitor</h2>
      <p className="hint">
        Aggregates the localized URL field across every locale configured on this stack
        into Entry Metadata, so all locale URLs can be fetched with a single CDA call. No
        management token, extension setup, or locale list to maintain here — locales are
        read live from the stack on each sync, and metadata is anchored to this app's own
        installation identity.
      </p>

      <form onSubmit={handleSave}>
        <label>
          Field UID to aggregate
          <input
            type="text"
            value={form.fieldUid}
            onChange={(e) => update('fieldUid', e.target.value)}
            required
          />
          <small>The localizable field on the entry to read per locale, e.g. `url`.</small>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.autoRepublish}
            onChange={(e) => update('autoRepublish', e.target.checked)}
          />
          Auto-republish the entry after sync (only for locale/environment combos already
          published)
        </label>

        <button type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save configuration'}
        </button>

        {status === 'saved' && <p className="status-ok">Saved.</p>}
        {status === 'error' && <p className="status-error">{errorMessage}</p>}
      </form>
    </div>
  );
}
