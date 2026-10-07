import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './overrides.css';
import './mobile.css';
import App from './App';
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  window.spmsInstallPrompt = event;
  window.dispatchEvent(new Event('spms:install-ready'));
});
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {}); });
}
createRoot(document.getElementById('root')).render(<App />);
