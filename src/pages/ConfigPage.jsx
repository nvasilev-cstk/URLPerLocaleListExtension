import React, { useEffect, useState } from 'react';

const DEFAULTS = {
  extensionUid: '',
  fieldUid: 'url',
  autoRepublish: false
};

export default function ConfigPage({ appSdk }) {
  // appSdk.location.AppConfigWidget has no getConfig/setConfig of its own — that only
  // exists on the top-level appSdk (which is what the Sidebar widget reads from). This
  // location's actual API wraps everything under `installation`, with config nested in
  // an `installationData.configuration` key.
  const installation = appSdk.location.AppConfigWidget.installation;
  const [form, setForm] = useState(DEFAULTS);
  const [status, setStatus] = useState('loading'); // loading | idle | saving | saved | error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    installation
      .getInstallationData()
      .then((data) => {
        setForm({ ...DEFAULTS, ...data?.configuration });
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

  async function handleSave() {
    setStatus('saving');
    setErrorMessage('');
    try {
      const data = await installation.getInstallationData();
      await installation.setInstallationData({ ...data, configuration: form });
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
        management token or locale list to maintain here — locales are read live from the
        stack on each sync.
      </p>

      {/* A plain div, not <form>: Contentstack sandboxes this iframe without
          allow-forms, so any native form submission is blocked outright regardless of
          preventDefault(). The save button below is a plain click handler instead. */}
      <div className="config-form">
        <label>
          Metadata anchor extension UID
          <input
            type="text"
            value={form.extensionUid}
            onChange={(e) => update('extensionUid', e.target.value)}
            placeholder="UID of an inert Custom Field extension"
            required
          />
          <small>
            Entry Metadata must reference an existing Extension, and it must be one whose
            UID never changes. Create one inert Custom Field extension (Settings →
            Extensions → New → Custom Field, any minimal config), never attach it to a
            content type, and paste its UID here. See README for why this can't just use
            this app's own installation identity.
          </small>
        </label>

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

        <button type="button" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save configuration'}
        </button>

        {status === 'saved' && <p className="status-ok">Saved.</p>}
        {status === 'error' && <p className="status-error">{errorMessage}</p>}
      </div>
    </div>
  );
}
