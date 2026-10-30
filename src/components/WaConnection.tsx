import { useEffect, useRef, useState } from 'react';
import { api } from '../types';

interface WaStatus {
  linked: boolean;
  qr: string | null;
  pairCode: string | null;
  user: string | null;
  connecting: boolean;
  lastError: string | null;
  backup: { secretConfigured: boolean; stored: boolean };
}

type Method = 'qr' | 'phone' | null;

export default function WaConnection({ onLinkedChange }: { onLinkedChange?: (linked: boolean) => void }) {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pairPhone, setPairPhone] = useState('');
  const [method, setMethod] = useState<Method>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const s = await api<WaStatus>('/wa/status');
      setStatus(s);
      onLinkedChange?.(s.linked);
      return s;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const s = await refresh();
      if (s?.linked) stopPolling();
    }, 2500);
  }

  async function linkQr() {
    setBusy(true);
    setMethod('qr');
    try {
      await api<WaStatus>('/wa/start', { method: 'POST', body: JSON.stringify({}) });
      startPolling();
    } finally {
      setBusy(false);
    }
  }

  async function linkWithPhone() {
    const digits = pairPhone.replace(/[^\d]/g, '');
    if (digits.length < 8) {
      alert('Escribe el número completo con código de país, ej: 573001234567');
      return;
    }
    setBusy(true);
    setMethod('phone');
    try {
      await api<WaStatus>('/wa/start', { method: 'POST', body: JSON.stringify({ phoneNumber: digits }) });
      startPolling();
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const payload = method === 'phone' && pairPhone.trim() ? { phoneNumber: pairPhone.replace(/[^\d]/g, ''), force: true } : { force: true };
      await api<WaStatus>('/wa/start', { method: 'POST', body: JSON.stringify(payload) });
      startPolling();
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm('¿Desvincular el dispositivo de WhatsApp? Deberás vincularlo de nuevo.')) return;
    setBusy(true);
    stopPolling();
    try {
      await api<WaStatus>('/wa/logout', { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    const digits = testPhone.replace(/[^\d]/g, '');
    if (digits.length < 8) {
      alert('Escribe el número completo con código de país, ej: 573001234567');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api<{ mode: string; result: { status: string; error: string | null; waLink: string | null } }>('/wa/test', {
        method: 'POST',
        body: JSON.stringify({ phone: digits }),
      });
      if (res.mode === 'enlaces' && res.result.waLink) {
        setTestResult('link');
        window.open(res.result.waLink, '_blank');
      } else if (res.result.status === 'enviado') {
        setTestResult('sent');
      } else {
        setTestResult('error');
      }
    } catch (e) {
      setTestResult('error');
      alert((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="vinculo">
      <section className="panel">
        <h2>📲 Estado de la conexión</h2>
        {!status ? (
          <p className="muted">Cargando estado…</p>
        ) : (
          <div className={`status-banner ${status.linked ? 'status-ok' : status.connecting ? 'status-warn' : 'status-idle'}`}>
            {status.linked ? (
              <>
                ✅ <strong>WhatsApp vinculado</strong> — los envíos y felicitaciones automáticas salen
                directos desde el número <strong>{status.user?.split(':')[0] || 'dispositivo vinculado'}</strong>.
              </>
            ) : status.connecting ? (
              <>⏳ Conectando con WhatsApp… espera unos segundos o regenera el código abajo.</>
            ) : (
              <>⚪ Sin vincular — la app funciona en modo enlaces. Elige un método de inicio abajo.</>
            )}
          </div>
        )}
        {status?.linked && (
          <button className="btn" onClick={unlink} disabled={busy}>
            Desvincular dispositivo
          </button>
        )}
        {status?.lastError && <p className="error">{status.lastError}</p>}
      </section>

      {status && !status.linked && (
        <section className="panel">
          <h2>🔑 Elige cómo iniciar</h2>
          <div className="method-tabs">
            <button className={`method-tab ${method === 'qr' ? 'method-active' : ''}`} onClick={() => setMethod('qr')}>
              📷 Código QR
            </button>
            <button className={`method-tab ${method === 'phone' ? 'method-active' : ''}`} onClick={() => setMethod('phone')}>
              🔢 Número de teléfono
            </button>
          </div>

          {method === 'qr' && (
            <div className="method-body">
              {status.qr ? (
                <>
                  <p className="muted">
                    1. Abre <strong>WhatsApp</strong> en tu teléfono<br />
                    2. Ve a <strong>Ajustes → Dispositivos vinculados</strong><br />
                    3. Toca <strong>Vincular un dispositivo</strong> y escanea:
                  </p>
                  <div className="qr-box">
                    <img src={status.qr} alt="Código QR de WhatsApp" />
                  </div>
                  <div className="row">
                    <button className="btn btn-small" onClick={regenerate} disabled={busy}>
                      🔄 Regenerar QR
                    </button>
                    <span className="muted small">El código se renueva solo si expira.</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">
                    Genera un código QR y escanéalo desde tu teléfono, igual que al conectar WhatsApp Web.
                  </p>
                  <button className="btn btn-primary" onClick={linkQr} disabled={busy}>
                    {busy ? 'Generando QR…' : '📷 Generar código QR'}
                  </button>
                </>
              )}
            </div>
          )}

          {method === 'phone' && (
            <div className="method-body">
              {status.pairCode ? (
                <>
                  <p className="muted">
                    En tu teléfono: <strong>WhatsApp → Ajustes → Dispositivos vinculados → Vincular un
                    dispositivo → Vincular con el número de teléfono</strong>. Ingresa este código:
                  </p>
                  <div className="pair-code">{status.pairCode}</div>
                  <div className="row">
                    <button className="btn btn-small" onClick={regenerate} disabled={busy}>
                      🔄 Generar otro código
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() => navigator.clipboard?.writeText(status.pairCode!.replace(/-/g, ''))}
                    >
                      📋 Copiar código
                    </button>
                  </div>
                  <p className="hint mt">El código expira en unos minutos.</p>
                </>
              ) : (
                <>
                  <p className="muted">
                    Sin escanear nada: te damos un código de 8 dígitos para ingresarlo en el teléfono.
                  </p>
                  <div className="row">
                    <input
                      className="pair-input"
                      placeholder="Ej: 573001234567 (con código de país)"
                      value={pairPhone}
                      onChange={(e) => setPairPhone(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={linkWithPhone} disabled={busy || !pairPhone.trim()}>
                      {busy ? 'Generando…' : '🔑 Generar código de vinculación'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {method === null && (
            <p className="muted">
              Con QR escaneas desde el teléfono; con el número recibes un código para escribir sin
              cámara. Ambos conectan el mismo WhatsApp de la fundación.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <h2>🧪 Probar la conexión</h2>
        <p className="muted">
          Envía un mensaje de prueba a cualquier número (por ejemplo, el tuyo) para confirmar que los
          envíos automáticos llegarán bien.
        </p>
        <div className="row">
          <input
            className="pair-input"
            placeholder="Ej: 573001234567 (con código de país)"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <button className="btn btn-primary" onClick={sendTest} disabled={testing || !testPhone.trim()}>
            {testing ? 'Enviando…' : '📨 Enviar mensaje de prueba'}
          </button>
        </div>
        {testResult === 'sent' && (
          <p className="ok-text mt">✅ Enviado. Revisa el teléfono: la conexión funciona perfecto.</p>
        )}
        {testResult === 'link' && (
          <p className="muted mt">
            WhatsApp se abrió con el mensaje listo (modo enlaces). Vincula la app arriba para que los
            envíos salgan solos.
          </p>
        )}
        {testResult === 'error' && (
          <p className="error mt">Hubo un problema al enviar. Verifica que WhatsApp esté vinculado y vuelve a intentarlo.</p>
        )}
      </section>

      <section className="panel">
        <h2>💾 Copia de seguridad de la sesión</h2>
        {status?.backup?.secretConfigured ? (
          status.backup.stored ? (
            <p className="ok-text">
              ✅ Sesión respaldada de forma cifrada. Tras cada actualización de la app, la conexión se
              restaura sola: no tendrás que volver a vincular.
            </p>
          ) : (
            <p className="warn-text">
              ⏳ Respaldo activado pero aún sin sesión guardada. Se guardará automáticamente en cuanto
              vincules WhatsApp.
            </p>
          )
        ) : (
          <>
            <p className="warn-text">
              ⚠️ Sin secreto configurado: cada vez que se publique una actualización de la app,
              tendrás que vincular de nuevo escaneando el QR o generando otro código.
            </p>
            <p className="hint">
              Cómo activarlo: ve a <strong>My app → Secrets</strong> y crea el secreto{' '}
              <code>WA_SESSION_SECRET</code> con cualquier frase larga y secreta (por ejemplo una clave
              aleatoria). Luego vincula WhatsApp una sola vez: la sesión quedará cifrada y se restaurará
              sola en cada despliegue.
            </p>
          </>
        )}
        <p className="hint mt">
          Nota: la conexión usa el modo "dispositivo vinculado" (no oficial). Como cualquier sesión de
          WhatsApp Web, un uso masivo puede arriesgar el número; úsalo con moderación.
        </p>
      </section>
    </div>
  );
}
