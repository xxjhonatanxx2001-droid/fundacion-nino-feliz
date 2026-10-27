import { createClient } from '@supabase/supabase-js';

// Tomamos la URL de Render y nos aseguramos de que NUNCA tenga '/rest/v1' duplicado ni espacios
let url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
url = url.trim().replace(/\/rest\/v1\/?$/, ''); 

// Forzamos el uso de tu llave pública anon
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

if (!url || !key) {
  console.error('[supabase] Missing SUPABASE_URL / SUPABASE_ANON_KEY configuration');
}

// Conectamos de forma limpia a tu Supabase privado
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
