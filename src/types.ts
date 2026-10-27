export type Group = 'padrinos' | 'colegios' | 'administrativos' | 'jovenes' | 'otros';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  group_name: Group;
  birthday: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface DesignInfo {
  style: string;
  palette: string[];
  subtitle?: string;
}

export interface Variant {
  title: string;
  body: string;
  design: DesignInfo;
}

export interface Campaign {
  id: string;
  title: string;
  kind: string;
  body: string;
  media_url: string | null;
  target_groups: string[];
  status: string;
  created_at: string;
}

export interface LogEntry {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface Automation {
  auto_send: boolean;
  default_message: string;
  anniversary_enabled: boolean;
  anniversary_message: string;
}

export interface SendResult {
  mode: 'cloud_api' | 'enlaces' | 'qr';
  preview: {
    contact_id: string;
    name: string;
    phone: string;
    message: string;
    status: string;
    waLink: string | null;
    error: string | null;
  }[];
}

export const GROUP_LABELS: Record<Group, string> = {
  padrinos: 'Padrinos',
  colegios: 'Colegios',
  administrativos: 'Personal administrativo',
  jovenes: 'Jóvenes de estudio superior',
  otros: 'Otros',
};

export const GROUP_EMOJIS: Record<Group, string> = {
  padrinos: '🤝',
  colegios: '🏫',
  administrativos: '🗂️',
  jovenes: '🎓',
  otros: '👤',
};

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  return data as T;
}
