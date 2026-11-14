import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import Studio from './studio/Studio';

const legacy = new URLSearchParams(window.location.search).has('legacy');
const LegacyApp = React.lazy(() => import('./App'));
if (legacy) void import('./index.css');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {legacy ? <Suspense fallback={<p>Loading research workspace…</p>}><LegacyApp /></Suspense> : <Studio />}
  </React.StrictMode>
);
