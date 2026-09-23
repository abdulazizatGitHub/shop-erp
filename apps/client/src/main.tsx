import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App.js';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// HashRouter, not BrowserRouter — this renderer is loaded via file:// in
// packaged builds (apps/server/src/main.ts's win.loadFile), which has no
// real path-based routing. Only the Settings page (P16-1b) uses routes
// today; every other tab is still App.tsx's own `tab` state, untouched.
createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
