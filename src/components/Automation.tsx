import { useEffect, useState } from 'react';
import { api, Contact, GROUP_LABELS } from '../types';
import type { Automation as AutomationSettings, SendResult } from '../types';

interface AppStatus {
  whatsapp: string;
  ai: string;
  waLinked: boolean;
}

export default function Automation() {
  const [today, setToday] = useState<Contact[]>([]);
  const [upcoming, setUpcoming] = useState<(Contact & { days_until: number; next_date: string })[]>([]);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<(Omit<SendResult, 'mode'> & { mode: string }) | null>(null);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    api<Contact[]>('/birthdays/today').then(setToday).catch(() => {});
    api<(Contact & { days_until: number; next_date: string })[]>('/birthdays/upcoming').then(setUpcoming).catch(() => {});
    api<AutomationSettings>('/automation').then(setAutomation).catch(() => {});
    api<AppStatus>('/status').then(setAppStatus).catch(() => {});
  }, []);

  async function save(patch: Partial<AutomationSettings>) {
    setSaving(true);
    try {
      const next = await api<AutomationSettings>('/automation', { method: 'PUT', body: JSON.stringify(patch) });
      setAutomation(next);
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    setSendError('');
    setSendResult(null);
    setSending(true);
    try {
      const res = await api<SendResult & { mode: string }>('/birthdays/send-now', { method: 'POST' });
      setSendResult(res);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function openAllLinks() {
    if (!sendResult) return;
    sendResult.preview.forEach((p, i) => {
      if (p.waLink) setTimeout(() => window.open(p.waLink!, '_blank'), i * 700);
    });
  }

  const channelReady = appStatus ? appStatus.whatsapp === 'cloud_api' || appStatus.waLinked : null;
  const active = Boolean(automation?.auto_send && channelReady);

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>🎂 Felicitar cumpleaños automáticamente</h2>

        {automation && channelReady !== null && (
          <div className={`status-banner ${active ? 'status-ok' : 'status-warn'}`}>
            {active ? (
              <>✅ Automatización activa: cada día a primera hora se felicitará a los cumpleañeros.</>
            ) : (
              <>
                ⚠️ La automatización todavía no puede enviar porque falta:{' '}
                <strong>
                  {!automation.auto_send ? 'activar el interruptor de abajo' : ''}
                  {!automation.auto_send && !channelReady ? ' y ' : ''}
                  {!channelReady ? 'vincular WhatsApp en la pestaña 📲 Vínculo' : ''}
                </strong>
                .
              </>
            )}
          </div>
        )}

        {automation ? (
          <>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={automation.auto_send}
                disabled={saving}
                onChange={(e) => save({ auto_send: e.target.checked })}
              />
              <span>
                Enviar automáticamente el mensaje de cumpleaños a los contactos que cumplan años hoy
              </span>
            </label>
            <label className="field">
              <span>Mensaje automático de cumpleaños</span>
              <textarea
                rows={6}
                value={automation.default_message}
                disabled={saving}
                onChange={(e) => setAutomation({ ...automation, default_message: e.target.value })}
                onBlur={() => save({ default_message: automation.default_message })}
              />
            </label>
            <p className="hint">
              Usa <code>{'{{nombre}}'}</code> para personalizar con el nombre de cada contacto. Si activas
              el interruptor con WhatsApp vinculado, el sistema reintenta cada 5 minutos hasta lograr el envío.
            </p>

            <div className="row mt">
              <button className="btn btn-send btn-send-inline" onClick={sendNow} disabled={sending || today.length === 0}>
                {sending ? 'Enviando…' : `🎁 Felicitar ahora a los ${today.length} cumpleañero(s) de hoy`}
              </button>
            </div>
            {today.length === 0 && <p className="muted small mt">Hoy no hay cumpleañeros; el botón se activa cuando los haya.</p>}
            {sendError && <p className="error">{sendError}</p>}

            {sendResult && (
              <div className="result mt">
                <h3>
                  {sendResult.mode === 'ninguno'
                    ? 'Hoy no hay cumpleaños registrados'
                    : sendResult.mode !== 'enlaces'
                      ? '✅ Felicitaciones enviadas'
                      : '📲 Mensajes listos — un clic por persona'}
                </h3>
                {sendResult.mode === 'enlaces' && (
                  <>
                    <p className="muted">
                      WhatsApp se abrirá con el mensaje ya escrito para cada cumpleañero. Presiona "Enviar"
                      en cada ventana.
                    </p>
                    <button className="btn btn-primary" onClick={openAllLinks}>
                      Abrir todos en WhatsApp
                    </button>
                  </>
                )}
                <ul className="result-list">
                  {sendResult.preview.map((p) => (
                    <li key={p.contact_id}>
                      <div>
                        <strong>{p.name}</strong>
                        {p.error ? (
                          <span className="error-text"> — {p.error}</span>
                        ) : sendResult.mode !== 'enlaces' ? (
                          <span className="ok-text"> — enviado ✓</span>
                        ) : null}
                        <p className="muted small">{p.message.length > 140 ? p.message.slice(0, 140) + '…' : p.message}</p>
                      </div>
                      {p.waLink && (
                        <a className="btn btn-small" href={p.waLink} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <h3 className="mt">📅 Próximos cumpleaños</h3>
            {upcoming.length === 0 ? (
              <p className="muted">Agrega cumpleaños a tus contactos para verlos aquí.</p>
            ) : (
              <ul className="birthday-list">
                {upcoming.map((c) => (
                  <li key={c.id}>
                    <div className="avatar avatar-alt">{c.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <strong>{c.name}</strong>
                      <span className="muted"> · {c.next_date} · {GROUP_LABELS[c.group_name]}</span>
                    </div>
                    <span className="pill">{c.days_until === 1 ? 'Mañana' : `En ${c.days_until} días`}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted">Cargando configuración…</p>
        )}
      </section>

      <section className="panel">
        <h2>🎊 Aniversario de la Fundación</h2>
        <p className="muted">
          La Fundación Niño Feliz fue fundada el <strong>26 de noviembre de 1990</strong>. Cada 26 de
          noviembre puedes felicitar automáticamente a todos tus contactos.
        </p>
        {automation ? (
          <>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={automation.anniversary_enabled}
                disabled={saving}
                onChange={(e) => save({ anniversary_enabled: e.target.checked })}
              />
              <span>
                Felicitar automáticamente el aniversario (26 de noviembre) a todos los contactos
              </span>
            </label>
            <label className="field">
              <span>Mensaje de aniversario</span>
              <textarea
                rows={6}
                value={automation.anniversary_message || ''}
                disabled={saving}
                onChange={(e) => setAutomation({ ...automation, anniversary_message: e.target.value })}
                onBlur={() => save({ anniversary_message: automation.anniversary_message })}
              />
            </label>
            <p className="hint">
              Usa <code>{'{{anios}}'}</code> y la app calcula los años de la fundación
              (2026 → 36 años). También puedes usar <code>{'{{nombre}}'}</code>. El mismo requisito aplica:
              WhatsApp vinculado en la pestaña Vínculo.
            </p>
          </>
        ) : (
          <p className="muted">Cargando configuración…</p>
        )}

        <h3 className="mt">🎁 Cumpleaños de hoy</h3>
        {today.length === 0 ? (
          <p className="muted">Hoy no hay cumpleaños registrados.</p>
        ) : (
          <ul className="birthday-list">
            {today.map((c) => (
              <li key={c.id}>
                <div className="avatar">{c.name.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{c.name}</strong>
                  <span className="muted"> · {GROUP_LABELS[c.group_name]}</span>
                </div>
                <span className="pill pill-party">¡Felicidades!</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
