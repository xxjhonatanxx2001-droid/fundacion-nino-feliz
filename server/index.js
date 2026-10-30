import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { supabase, GROUPS } from './supabase.js';
import { generateDesigns, isAiConfigured } from './ai.js';
import { isCloudApiConfigured, sendToContacts, buildWaLink, personalize } from './whatsapp.js';
import { getAutomation, saveAutomation, getTodaysBirthdays, startAutomation, sendBirthdaysNow } from './automation.js';
import { getWaStatus, startWaSession, logoutWa } from './wa-legacy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));

const api = express.Router();

api.get('/health', (_req, res) => res.json({ ok: true }));

api.get('/status', (_req, res) => {
  res.json({
    whatsapp: isCloudApiConfigured() ? 'cloud_api' : 'enlaces',
    ai: isAiConfigured() ? 'openai' : 'local',
    waLinked: getWaStatus().linked,
  });
});

api.get('/wa/status', async (_req, res) => {
  const secretConfigured = Boolean(process.env.WA_SESSION_SECRET);
  let stored = false;
  if (secretConfigured) {
    try {
      const { data } = await supabase.from('settings').select('key').eq('key', 'wa_session').maybeSingle();
      stored = Boolean(data);
    } catch {
      stored = false;
    }
  }
  res.json({ ...getWaStatus(), backup: { secretConfigured, stored } });
});

api.post('/wa/start', async (req, res) => {
  const { phoneNumber, force } = req.body || {};
  res.json(await startWaSession(phoneNumber, Boolean(force)));
});

api.post('/wa/logout', async (_req, res) => {
  res.json(await logoutWa());
});

api.post('/wa/test', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Escribe un número de destino para la prueba' });
  const fakeContact = { id: 'test', name: 'Prueba', phone, group_name: 'otros', group: 'otros' };
  try {
    const { mode, results } = await sendToContacts([fakeContact], '✅ Mensaje de prueba de la Fundación Niño Feliz. Si lees esto, la conexión funciona y las felicitaciones llegarán sin problemas. 💛', null);
    res.json({ mode, result: results[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Contactos ----
api.get('/contacts', async (_req, res) => {
  const { data, error } = await supabase.from('contacts').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

api.post('/contacts', async (req, res) => {
  const { name, phone, group_name, birthday, email, notes } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
  const { data, error } = await supabase
    .from('contacts')
    .insert({ name, phone, group_name: GROUPS.includes(group_name) ? group_name : 'otros', birthday: birthday || null, email: email || null, notes: notes || null })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

api.put('/contacts/:id', async (req, res) => {
  const { name, phone, group_name, birthday, email, notes } = req.body || {};
  const { data, error } = await supabase
    .from('contacts')
    .update({ name, phone, group_name: GROUPS.includes(group_name) ? group_name : 'otros', birthday: birthday || null, email: email || null, notes: notes || null })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

api.delete('/contacts/:id', async (req, res) => {
  const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---- Cumpleaños ----
api.get('/birthdays/today', async (_req, res) => {
  try {
    res.json(await getTodaysBirthdays());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.post('/birthdays/send-now', async (_req, res) => {
  try {
    res.json(await sendBirthdaysNow());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.get('/birthdays/upcoming', async (_req, res) => {
  const { data, error } = await supabase.from('contacts').select('*').not('birthday', 'is', null);
  if (error) return res.status(500).json({ error: error.message });
  const now = new Date();
  const upcoming = (data || [])
    .map((c) => {
      const [y, m, d] = String(c.birthday).split('-').map(Number);
      let next = new Date(now.getFullYear(), m - 1, d);
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        next = new Date(now.getFullYear() + 1, m - 1, d);
      }
      const days = Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      return { ...c, next_date: next.toISOString().slice(0, 10), days_until: days };
    })
    .filter((c) => c.days_until > 0)
    .sort((a, b) => a.days_until - b.days_until)
    .slice(0, 15);
  res.json(upcoming);
});

// ---- IA ----
api.post('/ai/generate', async (req, res) => {
  const { prompt, kind, tone } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Describe primero qué quieres crear' });
  try {
    res.json(await generateDesigns(prompt.trim(), kind || 'mensaje', tone || 'calido'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Subida de imágenes ----
api.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowed.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Solo se permiten imágenes (PNG, JPG, WEBP, GIF) o PDF' });
  }
  const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase();
  const key = `envios/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(key, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false,
  });
  if (error) return res.status(500).json({ error: error.message });
  const { data } = supabase.storage.from('media').getPublicUrl(key);
  res.json({ url: data.publicUrl });
});

// ---- Campañas / Envíos ----
api.get('/campaigns', async (_req, res) => {
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

api.post('/campaigns', async (req, res) => {
  const { title, kind, body, media_url, target_groups } = req.body || {};
  if (!body) return res.status(400).json({ error: 'El mensaje es obligatorio' });
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      title: title || 'Envío sin título',
      kind: kind || 'mensaje',
      body,
      media_url: media_url || null,
      target_groups: Array.isArray(target_groups) ? target_groups : [],
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

api.post('/campaigns/:id/send', async (req, res) => {
  const { contact_ids, groups } = req.body || {};
  let query = supabase.from('contacts').select('*');
  if (Array.isArray(contact_ids) && contact_ids.length > 0) {
    query = query.in('id', contact_ids);
  } else if (Array.isArray(groups) && groups.length > 0) {
    query = query.in('group_name', groups);
  } else {
    return res.status(400).json({ error: 'Selecciona destinatarios o grupos' });
  }
  const { data: contacts, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!contacts || contacts.length === 0) return res.status(400).json({ error: 'No hay contactos que coincidan' });

  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', req.params.id).single();
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

  try {
    const { mode, results } = await sendToContacts(contacts, campaign.body, campaign.media_url);
    const rows = results.map((r) => ({
      campaign_id: campaign.id,
      contact_id: r.contact.id,
      contact_name: r.contact.name,
      channel: 'whatsapp',
      status: r.status,
      provider_message_id: r.provider_message_id || null,
      error: r.error || null,
    }));
    await supabase.from('message_log').insert(rows);
    const anySent = results.some((r) => r.status === 'enviado');
    if (anySent || mode === 'enlaces') {
      await supabase.from('campaigns').update({ status: 'enviado' }).eq('id', campaign.id);
    }
    res.json({
      mode,
      preview: results.map((r) => ({
        contact_id: r.contact.id,
        name: r.contact.name,
        phone: r.contact.phone,
        message: r.text,
        status: r.status,
        waLink: r.waLink,
        error: r.error || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.get('/log', async (_req, res) => {
  const { data, error } = await supabase
    .from('message_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Automatización ----
api.get('/automation', async (_req, res) => {
  try {
    res.json(await getAutomation());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.put('/automation', async (req, res) => {
  try {
    res.json(await saveAutomation(req.body || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.post('/test-wa', (req, res) => {
  const { phone, message } = req.body || {};
  res.json({ link: buildWaLink(phone || '', personalize(message || 'Hola {{nombre}}', { name: 'Prueba' })) });
});

app.use('/api', api);

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

// Este bloque le permite al servidor usar el puerto que le asigne internet de forma automática
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor de Fundación Niño Feliz corriendo en el puerto ${port}`);
});
// ... (Todo el código anterior permanece exactamente igual)

api.post('/campaigns/:id/send', async (req, res) => {
  const { contact_ids, groups } = req.body || {};
  let query = supabase.from('contacts').select('*');
  
  if (Array.isArray(contact_ids) && contact_ids.length > 0) {
    query = query.in('id', contact_ids);
  } else if (Array.isArray(groups) && groups.length > 0) {
    query = query.in('group_name', groups);
  } else {
    return res.status(400).json({ error: 'Selecciona destinatarios o grupos' });
  }

  const { data: contacts, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!contacts || contacts.length === 0) return res.status(400).json({ error: 'No hay contactos que coincidan' });

  try {
    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', req.params.id).single();
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

    // Ejecuta el envío masivo usando el helper de whatsapp.js
    const result = await sendToContacts(contacts, campaign.body, campaign.media_url);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default api;


