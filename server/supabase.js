import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

if (!url || !key) {
  console.error('[supabase] Missing SUPABASE_URL / SUPABASE_ANON_KEY configuration');
}

export const supabase = createClient(url || 'http://localhost', key || 'anon', {
  auth: { persistSession: false },
});

export const GROUPS = ['padrinos', 'colegios', 'administrativos', 'jovenes', 'otros'];

export const GROUP_LABELS = {
  padrinos: 'Padrinos',
  colegios: 'Colegios',
  administrativos: 'Personal administrativo',
  jovenes: 'Jóvenes de estudio superior',
  otros: 'Otros',
};
