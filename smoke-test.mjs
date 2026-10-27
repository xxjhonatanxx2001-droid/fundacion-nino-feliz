process.env.VITE_SUPABASE_URL = 'https://supabase-api-prod.verdent.ai/p/pe87fa659614b6537cafa';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyMTA3OTYwMzg4LCJpYXQiOjE3OTIzNDExODgsImlzcyI6InN1cGFiYXNlIiwicHJvamVjdF9yZWYiOiJwZTg3ZmE2NTk2MTRiNjUzN2NhZmEiLCJyb2xlIjoiYW5vbiJ9.kOVs8ITsWHUTPu5e-lWI3DRYY7zSooTKT_hjftLNfw0';
process.env.PORT = '8091';

const { spawn } = await import('node:child_process');

const server = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' });

await new Promise((r) => setTimeout(r, 2500));

const base = 'http://localhost:8091';
const results = [];

async function check(name, path, init) {
  try {
    const res = await fetch(base + path, init);
    const text = await res.text();
    results.push(`${res.ok ? 'PASS' : 'FAIL'} ${name} -> ${res.status} ${text.slice(0, 160)}`);
  } catch (e) {
    results.push(`FAIL ${name} -> ${e.message}`);
  }
}

await check('GET /', '/');
await check('GET /api/health', '/api/health');
await check('GET /api/status', '/api/status');
await check('GET /api/contacts', '/api/contacts');
await check('GET /api/automation', '/api/automation');
await check('GET /api/birthdays/today', '/api/birthdays/today');
await check(
  'POST /api/ai/generate',
  '/api/ai/generate',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'invitación a la fiesta del sábado', kind: 'invitacion', tone: 'calido' }) },
);
await check(
  'POST /api/contacts',
  '/api/contacts',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Prueba Humo', phone: '+573001234567', group_name: 'padrinos', birthday: '2015-10-18' }) },
);

const contactsRes = await fetch(base + '/api/contacts');
const contacts = await contactsRes.json();
const smoke = contacts.find((c) => c.name === 'Prueba Humo');

if (smoke) {
  const campRes = await fetch(base + '/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Humo', kind: 'mensaje', body: '¡Feliz cumpleaños {{nombre}}! 🎉', target_groups: [] }),
  });
  const camp = await campRes.json();
  results.push(`${campRes.ok ? 'PASS' : 'FAIL'} POST /api/campaigns -> ${campRes.status} ${camp.id || ''}`);

  const sendRes = await fetch(base + `/api/campaigns/${camp.id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_ids: [smoke.id] }),
  });
  const send = await sendRes.json();
  const okSend = sendRes.ok && send.mode === 'enlaces' && send.preview?.[0]?.waLink?.includes('wa.me');
  results.push(`${okSend ? 'PASS' : 'FAIL'} POST /api/campaigns/:id/send -> ${sendRes.status} ${JSON.stringify(send).slice(0, 220)}`);

  const del = await fetch(base + `/api/contacts/${smoke.id}`, { method: 'DELETE' });
  results.push(`${del.ok ? 'PASS' : 'FAIL'} DELETE /api/contacts/:id -> ${del.status}`);
}

console.log('\n===== SMOKE RESULTS =====');
for (const r of results) console.log(r);
server.kill();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
