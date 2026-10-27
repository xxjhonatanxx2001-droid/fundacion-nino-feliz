import { supabase } from './supabase.js';
import { isCloudApiConfigured, sendToContacts, personalize } from './whatsapp.js';
import { isBaileysLinked } from './wa-legacy.js';

let lastBirthdayRun = null;
let lastAnniversaryRun = null;
const FOUNDED = { month: 11, day: 26, year: 1990 };

export async function getAutomation() {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'automation').single();
  if (error || !data) {
    return {
      auto_send: false,
      default_message: '¡Feliz cumpleaños {{nombre}}! 🎉 Hoy celebramos tu día. Todo el equipo de la Fundación Niño Feliz te envía un abrazo grande. 🎂',
      anniversary_enabled: false,
      anniversary_message: '🎉 ¡La Fundación Niño Feliz celebra hoy {{anios}} años de bendecir vidas! Desde el 26 de noviembre de 1990 trabajamos para que cada niño tenga motivos para sonreír. Gracias por ser parte de nuestra historia. 💛',
    };
  }
  return {
    auto_send: false,
    default_message: '¡Feliz cumpleaños {{nombre}}! 🎉 Hoy celebramos tu día. Todo el equipo de la Fundación Niño Feliz te envía un abrazo grande. 🎂',
    anniversary_enabled: false,
    anniversary_message: '🎉 ¡La Fundación Niño Feliz celebra hoy {{anios}} años de bendecir vidas! Desde el 26 de noviembre de 1990 trabajamos para que cada niño tenga motivos para sonreír. Gracias por ser parte de nuestra historia. 💛',
    ...data.value,
  };
}

export async function saveAutomation(patch) {
  const current = await getAutomation();
  const next = { ...current, ...patch };
  const { error } = await supabase.from('settings').upsert({ key: 'automation', value: next });
  if (error) throw new Error(error.message);
  return next;
}

export async function getTodaysBirthdays() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .not('birthday', 'is', null);
  if (error) throw new Error(error.message);
  return (data || []).filter((c) => {
    const [y, m, d] = String(c.birthday).split('-');
    return m === mm && d === dd;
  });
}

async function runDailyCheck() {
  const today = new Date().toISOString().slice(0, 10);
  const monthDay = today.slice(5);
  const channelReady = isCloudApiConfigured() || isBaileysLinked();

  try {
    const config = await getAutomation();

    // ---- Cumpleaños ----
    if (config.auto_send && channelReady && lastBirthdayRun !== today) {
      const birthdays = await getTodaysBirthdays();
      if (birthdays.length === 0) {
        lastBirthdayRun = today;
      } else {
        try {
          const { mode, results } = await sendToContacts(birthdays, config.default_message, null);
          const rows = results.map((r) => ({
            contact_id: r.contact.id,
            contact_name: r.contact.name,
            channel: 'whatsapp',
            status: r.status,
            provider_message_id: r.provider_message_id || null,
            error: r.error || null,
          }));
          await supabase.from('message_log').insert(rows);
          lastBirthdayRun = today;
          console.log(`[automation] Cumpleaños: enviados ${results.filter((r) => r.status === 'enviado').length}/${results.length} (${mode})`);
        } catch (err) {
          console.error('[automation] Error en cumpleaños (reintentará en 1 h):', err.message);
        }
      }
    }

    // ---- Aniversario de la fundación (26 de noviembre) ----
    if (monthDay === `${String(FOUNDED.month).padStart(2, '0')}-${String(FOUNDED.day).padStart(2, '0')}` && lastAnniversaryRun !== today) {
      if (!config.anniversary_enabled || !channelReady) {
        console.log('[automation] Hoy es el aniversario de la fundación (auto-envío inactivo, reintentará en 1 h)');
        return;
      }
      try {
        const { data: contacts, error } = await supabase.from('contacts').select('*');
        if (error) throw new Error(error.message);
        if (contacts && contacts.length > 0) {
          const { mode, results } = await sendToContacts(contacts, config.anniversary_message, null);
          const rows = results.map((r) => ({
            contact_id: r.contact.id,
            contact_name: r.contact.name,
            channel: 'whatsapp',
            status: r.status,
            provider_message_id: r.provider_message_id || null,
            error: r.error || null,
          }));
          await supabase.from('message_log').insert(rows);
          lastAnniversaryRun = today;
          console.log(`[automation] Aniversario: enviados ${results.filter((r) => r.status === 'enviado').length}/${results.length} (${mode})`);
        } else {
          lastAnniversaryRun = today;
        }
      } catch (err) {
        console.error('[automation] Error en aniversario (reintentará en 1 h):', err.message);
      }
    }
  } catch (err) {
    console.error('[automation] Error en chequeo diario:', err.message);
  }
}

function previewRows(results) {
  return results.map((r) => ({
    contact_id: r.contact.id,
    name: r.contact.name,
    phone: r.contact.phone,
    message: r.text,
    status: r.status,
    waLink: r.waLink || null,
    error: r.error || null,
  }));
}

export async function sendBirthdaysNow() {
  const config = await getAutomation();
  const birthdays = await getTodaysBirthdays();
  if (birthdays.length === 0) {
    return { mode: 'ninguno', preview: [] };
  }
  const { mode, results } = await sendToContacts(birthdays, config.default_message, null);
  const rows = results.map((r) => ({
    contact_id: r.contact.id,
    contact_name: r.contact.name,
    channel: 'whatsapp',
    status: r.status,
    provider_message_id: r.provider_message_id || null,
    error: r.error || null,
  }));
  await supabase.from('message_log').insert(rows);
  if (mode !== 'enlaces') {
    lastBirthdayRun = new Date().toISOString().slice(0, 10);
  }
  return { mode, preview: previewRows(results) };
}

export function startAutomation() {
  setInterval(runDailyCheck, 5 * 60 * 1000).unref();
  setTimeout(runDailyCheck, 5000).unref();
}

export { personalize };
