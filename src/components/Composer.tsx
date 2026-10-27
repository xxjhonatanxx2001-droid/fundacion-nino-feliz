import { useEffect, useRef, useState } from 'react';
import {
  api,
  Contact,
  Group,
  GROUP_LABELS,
  GROUP_EMOJIS,
  Variant,
  SendResult,
} from '../types';
import { drawCard, canvasToBlob, renderToDataUrl } from '../cardRenderer';

const KINDS = [
  { id: 'mensaje', label: '💌 Mensaje' },
  { id: 'carta', label: '📜 Carta' },
  { id: 'invitacion', label: '🎉 Invitación' },
];

const TONES = [
  { id: 'calido', label: 'Cálido' },
  { id: 'formal', label: 'Formal' },
  { id: 'divertido', label: 'Divertido' },
];

export default function Composer() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState('mensaje');
  const [tone, setTone] = useState('calido');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantImgs, setVariantImgs] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cardCanvas = useRef<HTMLCanvasElement>(null);

  const [selectedGroups, setSelectedGroups] = useState<Set<Group>>(new Set());
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [usedDesignImage, setUsedDesignImage] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    api<Contact[]>('/contacts').then(setContacts).catch(() => {});
  }, []);

  const visibleContacts = contacts.filter((c) => selectedGroups.size === 0 || selectedGroups.has(c.group_name));

  async function renderBigCard(text: string, design?: { style: string; palette: string[] }) {
    if (selectedVariant === null && !design) return;
    const d = design || variants[selectedVariant!].design;
    const canvas = cardCanvas.current;
    if (!canvas) return;
    await drawCard(canvas, text, d, 1080);
    setCardUrl(canvas.toDataURL('image/png'));
  }

  async function generate() {
    setAiError('');
    setGenerating(true);
    try {
      const res = await api<{ variants: Variant[]; source: string }>('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, kind, tone }),
      });
      setVariants(res.variants);
      setVariantImgs(await Promise.all(res.variants.map((v) => renderToDataUrl(v.body, v.design, 540))));
      setSelectedVariant(0);
      setBody(res.variants[0].body);
      await renderBigCard(res.variants[0].body, res.variants[0].design);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function pickVariant(i: number) {
    setSelectedVariant(i);
    setBody(variants[i].body);
    renderBigCard(variants[i].body, variants[i].design);
  }

  async function uploadBlob(blob: Blob, name: string): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', new File([blob], name, { type: blob.type }));
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir la imagen');
    return data.url;
  }

  async function uploadFile(file: File) {
    setSendError('');
    setUploading(true);
    try {
      const url = await uploadBlob(file, file.name);
      if (url) setMediaUrl(url);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  function toggleGroup(g: Group) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function toggleContact(id: string) {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedContacts(new Set(visibleContacts.map((c) => c.id)));
  }

  function clearSelection() {
    setSelectedContacts(new Set());
    setSelectedGroups(new Set());
  }

  const recipientIds = selectedContacts.size > 0 ? Array.from(selectedContacts) : [];

  async function send() {
    setSendError('');
    setSendResult(null);
    if (!body.trim()) {
      setSendError('Escribe o genera un mensaje primero.');
      return;
    }
    if (recipientIds.length === 0) {
      setSendError('Selecciona al menos un destinatario.');
      return;
    }
    setSending(true);
    try {
      let finalMedia = mediaUrl;
      setUsedDesignImage(false);
      if (!finalMedia && selectedVariant !== null && cardCanvas.current) {
        const blob = await canvasToBlob(cardCanvas.current);
        const url = await uploadBlob(blob, 'diseno-fundacion-nino-feliz.png');
        if (url) {
          finalMedia = url;
          setUsedDesignImage(true);
        }
      }

      const campaignTitle = (body.trim().split('\n')[0] || 'Envío Fundación').slice(0, 60);
      const campaign = await api<{ id: string }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ title: campaignTitle, kind, body, media_url: finalMedia, target_groups: Array.from(selectedGroups) }),
      });
      const result = await api<SendResult>(`/campaigns/${campaign.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ contact_ids: recipientIds }),
      });
      setSendResult(result);
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

  return (
    <div className="composer">
      <section className="panel">
        <h2>✨ Crea, diseña y envía</h2>
        <p className="muted">
          Todo en un solo lugar: pídele a la IA una tarjeta diseñada, edita el texto, elige los
          destinatarios y envía. La tarjeta se envía como imagen con tu mensaje.
        </p>
        <div className="kind-row">
          {KINDS.map((k) => (
            <button key={k.id} className={`chip ${kind === k.id ? 'chip-active' : ''}`} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
          <span className="spacer" />
          {TONES.map((t) => (
            <button key={t.id} className={`chip chip-soft ${tone === t.id ? 'chip-active' : ''}`} onClick={() => setTone(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          className="ai-box"
          rows={3}
          placeholder="Ej: Quiero hacer una invitación a la fiesta de cumpleaños del sábado en la fundación, con juegos y pastel…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="btn btn-primary" onClick={generate} disabled={generating || !prompt.trim()}>
          {generating ? '✨ Diseñando…' : '✨ Generar diseños'}
        </button>
        {aiError && <p className="error">{aiError}</p>}

        {variants.length > 0 && (
          <>
            <h3 className="mt">🎨 Elige un diseño</h3>
            <div className="variants">
              {variants.map((v, i) => (
                <button key={i} className={`variant-card ${selectedVariant === i ? 'variant-selected' : ''}`} onClick={() => pickVariant(i)}>
                  {variantImgs[i] ? (
                    <img src={variantImgs[i]} alt={v.title} className="variant-thumb" />
                  ) : (
                    <div className="variant-preview" style={{ background: `linear-gradient(135deg, ${v.design.palette[0]}, ${v.design.palette[1] ?? v.design.palette[0]})` }}>
                      <span className="variant-style">{v.title}</span>
                    </div>
                  )}
                  <p className="muted small"><strong>{v.title}</strong> · {v.design.subtitle || v.design.style}</p>
                </button>
              ))}
            </div>
          </>
        )}
        <hr className="divider" />

        <h3>✍️ Texto y tarjeta</h3>
        <label className="field">
          <span>Texto del mensaje (editable)</span>
          <textarea
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => renderBigCard(body)}
          />
        </label>
        {selectedVariant !== null && cardUrl && (
          <div className="card-preview">
            <img src={cardUrl} alt="Tarjeta diseñada" />
            <div className="row">
              <button className="btn btn-small" onClick={() => renderBigCard(body)}>
                🔄 Actualizar imagen con el texto actual
              </button>
            </div>
            <p className="hint">
              Esta tarjeta se envía como <strong>imagen</strong> junto con tu mensaje. El marcador{' '}
              <code>{'{{nombre}}'}</code> se personaliza en el texto de cada contacto; dentro de la
              imagen aparece como «amigo(a)».
            </p>
          </div>
        )}

        <h3>🖼️ Tu propia imagen o PDF (opcional)</h3>
        <p className="muted small">
          Si adjuntas un archivo propio, este reemplaza la tarjeta diseñada al enviar. Deja vacío para
          usar el diseño generado.
        </p>
        <div
          className={`dropzone ${dragOver ? 'dropzone-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <p>Subiendo archivo…</p>
          ) : mediaUrl ? (
            mediaUrl.toLowerCase().includes('.pdf') ? (
              <p className="pdf-chip">📄 PDF cargado — se enviará como documento a todos los destinatarios</p>
            ) : (
              <img src={mediaUrl} alt="Vista previa" className="media-preview" />
            )
          ) : (
            <p>Arrastra una imagen o PDF aquí, o haz clic para elegir un archivo</p>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.pdf"
          hidden
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        {mediaUrl && (
          <button className="btn btn-small mt" onClick={() => setMediaUrl(null)}>
            Quitar archivo
          </button>
        )}
        <hr className="divider" />

        <h3>📤 Destinatarios y envío</h3>
        <div className="filters">
          {(Object.keys(GROUP_LABELS) as Group[]).map((g) => (
            <button key={g} className={`chip ${selectedGroups.has(g) ? 'chip-active' : ''}`} onClick={() => toggleGroup(g)}>
              {GROUP_EMOJIS[g]} {GROUP_LABELS[g]} ({contacts.filter((c) => c.group_name === g).length})
            </button>
          ))}
        </div>
        <div className="row mt">
          <button className="btn btn-small" onClick={selectAllVisible}>Seleccionar todos los visibles</button>
          <button className="btn btn-small" onClick={clearSelection}>Limpiar selección</button>
          <span className="muted small">{recipientIds.length} destinatario(s) seleccionado(s)</span>
        </div>

        {contacts.length === 0 ? (
          <p className="muted mt">Aún no tienes contactos. Agrega primero en la pestaña Contactos.</p>
        ) : (
          <ul className="contact-list mt">
            {visibleContacts.map((c) => (
              <li key={c.id} className={selectedContacts.has(c.id) ? 'contact-selected' : ''}>
                <label className="contact-row">
                  <input type="checkbox" checked={selectedContacts.has(c.id)} onChange={() => toggleContact(c.id)} />
                  <div className="avatar">{c.name.charAt(0).toUpperCase()}</div>
                  <div className="contact-info">
                    <strong>{c.name}</strong>
                    <span className="muted">{c.phone} · {GROUP_LABELS[c.group_name]}</span>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}

        {sendError && <p className="error">{sendError}</p>}
        <button className="btn btn-send" onClick={send} disabled={sending || recipientIds.length === 0}>
          {sending ? 'Enviando…' : `🟢 Enviar por WhatsApp a ${recipientIds.length || '…'} contacto(s)`}
        </button>

        {sendResult && (
          <div className="result mt">
            <h3>
              {sendResult.mode !== 'enlaces'
                ? '✅ Envío realizado'
                : '📲 Mensajes listos — un clic por persona'}
            </h3>
            {usedDesignImage && sendResult.mode !== 'enlaces' && (
              <p className="ok-text small">La tarjeta diseñada se envió como imagen junto con el texto. 🖼️</p>
            )}
            {usedDesignImage && sendResult.mode === 'enlaces' && (
              <p className="muted small">
                Nota: en modo enlaces WhatsApp no permite adjuntar la imagen automáticamente. Vincula la
                app en la pestaña 📲 Vínculo para que la tarjeta se envíe sola.
              </p>
            )}
            {sendResult.mode === 'enlaces' && (
              <>
                <p className="muted">
                  WhatsApp se abrirá con el mensaje ya escrito y personalizado para cada contacto.
                  Solo debes presionar "Enviar" en cada ventana.
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
      </section>
      <canvas ref={cardCanvas} hidden />
    </div>
  );
}
