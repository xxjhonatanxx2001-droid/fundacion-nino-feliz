import { useEffect, useState } from 'react';
import Contacts from './components/Contacts';
import Composer from './components/Composer';
import History from './components/History';
import WaConnection from './components/WaConnection';
import Automation from './components/Automation';
import { api } from './types';
import logoUrl from './assets/logo.png';

type Tab = 'inicio' | 'vinculo' | 'automatizacion' | 'contactos' | 'historial';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'vinculo', label: 'Vínculo', icon: '📲' },
  { id: 'automatizacion', label: 'Automatización', icon: '⚙️' },
  { id: 'contactos', label: 'Contactos', icon: '👥' },
  { id: 'historial', label: 'Historial', icon: '📋' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('inicio');
  const [status, setStatus] = useState<{ whatsapp: string; ai: string; waLinked: boolean } | null>(null);

  useEffect(() => {
    api<{ whatsapp: string; ai: string; waLinked: boolean }>('/status').then(setStatus).catch(() => {});
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src={logoUrl} alt="Logo Fundación Niño Feliz" className="brand-logo-img" />
          <div>
            <h1>Fundación Niño Feliz</h1>
            <p>Mensajes, cumpleaños e invitaciones por WhatsApp</p>
          </div>
        </div>
        <div className="topbar-status">
          {status && (
            <span
              className={`badge ${status.whatsapp === 'cloud_api' || status.waLinked ? 'badge-ok' : 'badge-warn'}`}
              title={
                status.whatsapp === 'cloud_api' || status.waLinked
                  ? 'WhatsApp conectado: los envíos son automáticos.'
                  : 'Modo enlaces: se abre WhatsApp con el mensaje listo para enviar. Vincula por QR o número en la pestaña Vínculo.'
              }
            >
              {status.whatsapp === 'cloud_api' || status.waLinked ? '● WhatsApp automático' : '● Modo enlaces WhatsApp'}
            </span>
          )}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'inicio' && <Composer />}
        {tab === 'vinculo' && <WaConnection />}
        {tab === 'automatizacion' && <Automation />}
        {tab === 'contactos' && <Contacts />}
        {tab === 'historial' && <History />}
      </main>

      <footer className="footer">
        <img src={logoUrl} alt="" className="footer-logo" />
        <p>Fundación Niño Feliz · Cada mensaje lleva una sonrisa 💛</p>
      </footer>
    </div>
  );
}
