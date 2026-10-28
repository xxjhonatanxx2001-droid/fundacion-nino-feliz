import { createClient } from '@supabase/supabase-js';

// Carga de variables de entorno
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// Validación
if (!url || !key) {
  console.error('[supabase] Falta configurar SUPABASE_URL / SUPABASE_ANON_KEY');
}

// Inicialización del cliente
export const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

export const GROUPS = ['padrinos', 'colegios', 'administrativos', 'jovenes', 'otros'];

export const GROUP_LABELS = {
  padrinos: 'Padrinos',
  colegios: 'Colegios',
  administrativos: 'Personal administrativo',
  jovenes: 'Jóvenes de estudio superior',
  otros: 'Otros',
};
