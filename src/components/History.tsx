import { useEffect, useState } from 'react';
import { api, Campaign, LogEntry } from '../types';

export default function History() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api<Campaign[]>('/campaigns').then(setCampaigns).catch(() => {});
    api<LogEntry[]>('/log').then(setLog).catch(() => {});
  }, []);

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>📮 Envíos realizados</h2>
        {campaigns.length === 0 ? (
          <p className="muted">Todavía no hay envíos. Crea el primero en "Crear y Enviar".</p>
        ) : (
          <ul className="campaign-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button className="campaign-head" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <div>
                    <strong>{c.title}</strong>
                    <span className="muted small">
                      {' '}
                      · {new Date(c.created_at).toLocaleString('es')} · {c.target_groups.length > 0 ? c.target_groups.join(', ') : 'destinatarios individuales'}
                    </span>
                  </div>
                  <span className={`pill ${c.status === 'enviado' ? 'pill-ok' : ''}`}>{c.status}</span>
                </button>
                {expanded === c.id && (
                  <div className="campaign-body">
                    {c.media_url && <img src={c.media_url} alt="" className="media-thumb" />}
                    <pre>{c.body}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>📋 Registro de mensajes</h2>
        {log.length === 0 ? (
          <p className="muted">Aquí aparecerá cada mensaje enviado o automatizado.</p>
        ) : (
          <ul className="log-list">
            {log.map((l) => (
              <li key={l.id}>
                <strong>{l.contact_name || 'Contacto'}</strong>
                <span className={`pill ${l.status === 'enviado' ? 'pill-ok' : l.status === 'error' ? 'pill-error' : ''}`}>{l.status}</span>
                <span className="muted small"> {new Date(l.created_at).toLocaleString('es')}</span>
                {l.error && <p className="error-text small">{l.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
