const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
import { isBaileysLinked, sendBaileys } from './wa-legacy.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function isCloudApiConfigured() {
  return Boolean(WA_TOKEN && WA_PHONE_ID);
}

export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits.slice(1) : digits;
}

export function buildWaLink(phone, message) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function personalize(template, contact) {
  return String(template || '')
    .replaceAll('{{nombre}}', contact.name || '')
    .replaceAll('{{grupo}}', contact.group_name || '')
    .replaceAll('{{anios}}', String(new Date().getFullYear() - 1990));
}

async function sendCloudApi(phone, text, mediaUrl) {
  const to = normalizePhone(phone);
  const isPdf = (mediaUrl || '').toLowerCase().includes('.pdf');
  let res;
  if (mediaUrl && isPdf) {
    res = await fetch(`${GRAPH}/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WA_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { link: mediaUrl, filename: 'FundacionNinoFeliz.pdf', caption: text || undefined },
      }),
    });
  } else if (mediaUrl) {
    res = await fetch(`${GRAPH}/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WA_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: mediaUrl, caption: text || undefined },
      }),
    });
  } else {
    res = await fetch(`${GRAPH}/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WA_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp API ${res.status}`);
  }
  return data?.messages?.[0]?.id || null;
}

export async function sendToContacts(contacts, template, mediaUrl) {
  const results = [];

  if (isCloudApiConfigured()) {
    for (const contact of contacts) {
      const text = personalize(template, contact);
      try {
        const id = await sendCloudApi(contact.phone, text, mediaUrl);
        results.push({ contact, text, status: 'enviado', provider_message_id: id, waLink: null });
      } catch (err) {
        results.push({
          contact,
          text,
          status: 'error',
          error: err.message,
          waLink: buildWaLink(contact.phone, text),
        });
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return { mode: 'cloud_api', results };
  }

  if (isBaileysLinked()) {
    for (const contact of contacts) {
      const text = personalize(template, contact);
      try {
        await sendBaileys(contact.phone, text, mediaUrl);
        results.push({ contact, text, status: 'enviado', waLink: null });
      } catch (err) {
        results.push({
          contact,
          text,
          status: 'error',
          error: err.message,
          waLink: buildWaLink(contact.phone, text),
        });
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    return { mode: 'qr', results };
  }

  for (const contact of contacts) {
    const text = personalize(template, contact);
    results.push({ contact, text, status: 'pendiente', waLink: buildWaLink(contact.phone, text) });
  }
  return { mode: 'enlaces', results };
}
