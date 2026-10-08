import React, { useEffect, useState } from 'react';

export default function InstallApp() {
  const [prompt, setPrompt] = useState(window.spmsInstallPrompt || null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const ready = () => setPrompt(window.spmsInstallPrompt);
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('spms:install-ready', ready);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('spms:install-ready', ready); window.removeEventListener('appinstalled', done); };
  }, []);
  if (installed) return <p className="install-caption">Installed · Zada SPMS</p>;
  async function install() {
    if (!prompt) { setHelp(!help); return; }
    await prompt.prompt();
    await prompt.userChoice;
    window.spmsInstallPrompt = null;
    setPrompt(null);
  }
  return <div className="install-app">
    <button type="button" className="install-button" onClick={install}>{prompt ? 'Install SPMS app' : 'Add to Home Screen'}</button>
    {help && <p className="install-caption" role="status">On iPhone, open in Safari and choose Share → Add to Home Screen. On Android, open the browser menu and choose Install app or Add to Home screen, if available. Internet is required for bills and payments.</p>}
  </div>;
}
