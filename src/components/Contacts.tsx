import { useEffect, useMemo, useState } from 'react';
import { api, Contact, Group, GROUP_LABELS, GROUP_EMOJIS } from '../types';

const EMPTY_FORM = { name: '', phone: '', group_name: 'otros' as Group, birthday: '', email: '', notes: '' };

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<Group | 'todos'>('todos');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setContacts(await api<Contact[]>('/contacts'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: contacts.length };
    for (const g of Object.keys(GROUP_LABELS)) c[g] = contacts.filter((x) => x.group_name === g).length;
    return c;
  }, [contacts]);

  const visible = contacts.filter(
    (c) =>
      (filter === 'todos' || c.group_name === filter) &&
      (search === '' || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.phone.trim()) {
      setError('El nombre y el teléfono son obligatorios.');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, birthday: form.birthday || null };
      if (editingId) {
        await api<Contact>(`/contacts/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api<Contact>('/contacts', { method: 'POST', body: JSON.stringify(payload) });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function edit(c: Contact) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone,
      group_name: c.group_name,
      birthday: c.birthday || '',
      email: c.email || '',
      notes: c.notes || '',
    });
  }

  async function remove(c: Contact) {
    if (!confirm(`¿Eliminar a ${c.name}?`)) return;
    await api(`/contacts/${c.id}`, { method: 'DELETE' });
    if (editingId === c.id) {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
    load();
  }

  return (
    <div className="grid-2-contacts">
      <section className="panel">
        <h2>{editingId ? '✏️ Editar contacto' : '➕ Agregar contacto'}</h2>
        <form onSubmit={submit} className="form">
          <label className="field">
            <span>Nombre *</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: María González" />
          </label>
          <label className="field">
            <span>Teléfono WhatsApp *</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Ej: +57 300 123 4567" />
          </label>
          <label className="field">
            <span>Grupo</span>
            <select value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value as Group })}>
              {(Object.keys(GROUP_LABELS) as Group[]).map((g) => (
                <option key={g} value={g}>
                  {GROUP_EMOJIS[g]} {GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Cumpleaños</span>
            <input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
          </label>
          <label className="field">
            <span>Correo (opcional)</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field">
            <span>Notas (opcional)</span>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn btn-primary" disabled={busy}>
              {editingId ? 'Guardar cambios' : 'Agregar contacto'}
            </button>
            {editingId && (
              <button type="button" className="btn" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>👥 Contactos ({contacts.length})</h2>
        <div className="filters">
          <button className={`chip ${filter === 'todos' ? 'chip-active' : ''}`} onClick={() => setFilter('todos')}>
            Todos ({counts.todos})
          </button>
          {(Object.keys(GROUP_LABELS) as Group[]).map((g) => (
            <button key={g} className={`chip ${filter === g ? 'chip-active' : ''}`} onClick={() => setFilter(g)}>
              {GROUP_EMOJIS[g]} {GROUP_LABELS[g]} ({counts[g]})
            </button>
          ))}
        </div>
        <input className="search" placeholder="🔍 Buscar por nombre o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {visible.length === 0 ? (
          <p className="muted">No hay contactos que coincidan. Agrega el primero con el formulario.</p>
        ) : (
          <ul className="contact-list">
            {visible.map((c) => (
              <li key={c.id}>
                <div className="avatar">{c.name.charAt(0).toUpperCase()}</div>
                <div className="contact-info">
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {c.phone} · {GROUP_EMOJIS[c.group_name]} {GROUP_LABELS[c.group_name]}
                    {c.birthday ? ` · 🎂 ${c.birthday}` : ''}
                  </span>
                </div>
                <div className="contact-actions">
                  <button className="btn btn-small" onClick={() => edit(c)}>Editar</button>
                  <button className="btn btn-small btn-danger" onClick={() => remove(c)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
