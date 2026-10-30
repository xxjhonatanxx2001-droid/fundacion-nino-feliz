import * as baileys from 'baileys';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { supabase } from './supabase.js';

const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason } = baileys;

const AUTH_DIR = path.join(process.cwd(), 'wa-auth');
const SECRET = process.env.WA_SESSION_SECRET || '';

const state = {
  linked: false,
  qr: null,
  pairCode: null,
  user: null,
  connecting: false,
  lastError: null,
};

let sock = null;
let restartTimer = null;

function encryptJson(obj) {
  if (!SECRET) return null;
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(SECRET).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString('base64');
}

function decryptJson(blob) {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = crypto.createHash('sha256').update(SECRET).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

async function readAuthFiles() {
  const files = {};
  for (const name of fs.readdirSync(AUTH_DIR)) {
    const p = path.join(AUTH_DIR, name);
    if (fs.statSync(p).isFile()) files[name] = fs.readFileSync(p).toString('base64');
  }
  return files;
}

async function backupSession() {
  if (!SECRET || !fs.existsSync(AUTH_DIR)) return;
  try {
    const files = await readAuthFiles();
    const payload = encryptJson(files);
    if (!payload) return;
    await supabase.from('settings').upsert({ key: 'wa_session', value: { payload } });
  } catch (err) {
    console.error('[wa-qr] backup failed:', err.message);
  }
}

async function restoreSession() {
  if (!SECRET) return;
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', 'wa_session').single();
    if (!data?.value?.payload) return;
    const files = decryptJson(data.value.payload);
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    for (const [name, b64] of Object.entries(files)) {
      fs.writeFileSync(path.join(AUTH_DIR, name), Buffer.from(b64, 'base64'));
    }
    console.log('[wa-qr] sesión restaurada desde la nube');
  } catch (err) {
    console.error('[wa-qr] restore failed:', err.message);
  }
}

async function clearStoredSession() {
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  if (SECRET) await supabase.from('settings').delete().eq('key', 'wa_session');
}

export function getWaStatus() {
  return {
    linked: state.linked,
    qr: state.qr,
    pairCode: state.pairCode,
    user: state.user,
    connecting: state.connecting,
    lastError: state.lastError,
  };
}

export function isBaileysLinked() {
  return state.linked && Boolean(sock);
}

export async function startWaSession(pairPhone, force = false) {
  if (state.linked && !force) return getWaStatus();
  if (state.connecting && !force) return getWaStatus();

  if (force && sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.end(undefined, 'restart');
    } catch {
      /* noop */
    }
    sock = null;
    state.connecting = false;
  }

  state.connecting = true;
  state.lastError = null;
  state.pairCode = null;

  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await restoreSession();

    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, { trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => {} }) }),
      },
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    if (pairPhone && !authState.creds?.registered) {
      const digits = String(pairPhone).replace(/[^\d]/g, '');
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(digits);
          state.pairCode = code?.match(/.{1,4}/g)?.join('-') || code;
          console.log('[wa-qr] código de vinculación:', state.pairCode);
        } catch (err) {
          state.lastError = `No se pudo generar el código: ${err.message}`;
          console.error('[wa-qr] pairing code failed:', err.message);
        }
      }, 3000);
    }

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      await backupSession();
    });

    sock.ev.on('connection.update', async (update) => {
      try {
        if (update.qr) {
          state.qr = await QRCode.toDataURL(update.qr);
          state.linked = false;
          state.user = null;
          console.log('[wa-qr] QR listo para escanear');
        }
        if (update.connection === 'open') {
          state.linked = true;
          state.qr = null;
          state.pairCode = null;
          state.connecting = false;
          state.user = sock?.user?.id || null;
          await backupSession();
          console.log('[wa-qr] WhatsApp vinculado:', state.user);
        }
        if (update.connection === 'close') {
          const code = update.lastDisconnect?.error?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            state.linked = false;
            state.qr = null;
            state.connecting = false;
            state.user = null;
            sock = null;
            await clearStoredSession();
            console.log('[wa-qr] sesión cerrada desde el teléfono');
          } else {
            state.linked = false;
            state.connecting = false;
            sock = null;
            if (!restartTimer) {
              restartTimer = setTimeout(() => {
                restartTimer = null;
                startWaSession().catch(() => {});
              }, 5000);
            }
          }
        }
      } catch (err) {
        console.error('[wa-qr] connection.update error:', err.message);
      }
    });

    sock.ev.on('messages.upsert', () => {});
  } catch (err) {
    state.connecting = false;
    state.lastError = err.message;
    console.error('[wa-qr] start failed:', err.message);
  }

  return getWaStatus();
}

export async function logoutWa() {
  try {
    await sock?.logout?.();
  } catch {
    /* noop */
  }
  try {
    sock?.end?.();
  } catch {
    /* noop */
  }
  sock = null;
  state.linked = false;
  state.qr = null;
  state.pairCode = null;
  state.user = null;
  state.connecting = false;
  state.lastError = null;
  await clearStoredSession();
  return getWaStatus();
}

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export async function sendBaileys(phone, text, mediaUrl) {
  if (!isBaileysLinked()) throw new Error('WhatsApp no está vinculado');
  const jid = `${String(phone).replace(/[^\d]/g, '')}@s.whatsapp.net`;
  if (mediaUrl) {
    const res = await fetch(mediaUrl);
    if (!res.ok) throw new Error(`No se pudo descargar el archivo (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = (mediaUrl.split('?')[0].split('.').pop() || '').toLowerCase();
    const mime = MIME_BY_EXT[ext] || res.headers.get('content-type') || 'image/png';
    if (mime === 'application/pdf') {
      await sock.sendMessage(jid, {
        document: buffer,
        mimetype: 'application/pdf',
        fileName: 'FundacionNinoFeliz.pdf',
        caption: text || undefined,
      });
    } else {
      await sock.sendMessage(jid, { image: buffer, caption: text || undefined });
    }
  } else {
    await sock.sendMessage(jid, { text });
  }
}
