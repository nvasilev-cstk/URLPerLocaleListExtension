import React, { useEffect, useState } from 'react';
import ContentstackAppSdk from '@contentstack/app-sdk';
import ConfigPage from './pages/ConfigPage.jsx';
import SidebarWidget from './pages/SidebarWidget.jsx';

export default function App() {
  const [appSdk, setAppSdk] = useState(null);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    ContentstackAppSdk.init()
      .then((sdk) => {
        setAppSdk(sdk);
        if (sdk.location.AppConfigWidget) {
          setLocation('config');
        } else if (sdk.location.SidebarWidget) {
          setLocation('sidebar');
        } else {
          setLocation('unknown');
        }
      })
      .catch((err) => setError(err?.message || 'Failed to initialize Contentstack App SDK'));
  }, []);

  if (error) {
    return <div className="app-shell app-error">Failed to load: {error}</div>;
  }

  if (!appSdk || !location) {
    return <div className="app-shell app-loading">Loading…</div>;
  }

  if (location === 'config') {
    return <ConfigPage appSdk={appSdk} />;
  }

  if (location === 'sidebar') {
    return <SidebarWidget appSdk={appSdk} />;
  }

  return (
    <div className="app-shell app-error">
      This app location isn't supported. Open it from the App Configuration screen or an
      entry's sidebar.
    </div>
  );
}
