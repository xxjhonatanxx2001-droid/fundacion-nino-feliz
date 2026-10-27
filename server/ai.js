const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

const SYSTEM_PROMPT = `Eres el asistente creativo de la "Fundación Niño Feliz", una fundación que apoya a niños y jóvenes.
Generas textos para tarjetas de WhatsApp: cartas, invitaciones y felicitaciones de cumpleaños.
Responde SIEMPRE en español, con tono cálido y apropiado para una fundación infantil.
IMPORTANTE: redacta prosa natural, completa y gramaticalmente correcta. Nunca copies literalmente
la petición del usuario: interpretala y convierte los datos (evento, fecha, hora, lugar,
destinatarios, actividades) en oraciones bien escritas con sentido completo.
Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown) con esta forma:
{"variants":[{"title":"...","body":"...","design":{"style":"festivo|infantil|elegante|floral|clasico","palette":["#hex","#hex","#hex"],"subtitle":"..."}}, ...]}
Genera entre 3 y 5 variants, cada una con un style y palette distintos.
La primera línea de cada body es el título de la tarjeta (máximo 48 caracteres, puede llevar emojis).
Cada body debe tener entre 4 y 8 líneas en total y admitir el marcador {{nombre}} para personalizar.`;

export function isAiConfigured() {
  return Boolean(OPENAI_KEY);
}

async function generateWithOpenAI(prompt, kind, tone) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Tipo de pieza: ${kind}. Tono: ${tone}. Petición: ${prompt}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  if (!parsed.variants || !Array.isArray(parsed.variants)) throw new Error('Formato inesperado');
  return parsed.variants.slice(0, 5);
}

const DESIGN_STYLES = [
  {
    style: 'festivo',
    palette: ['#FF8A3D', '#FFD23F', '#2E86AB'],
    title: 'Festivo',
    subtitle: 'Colores de celebración con confeti',
  },
  {
    style: 'infantil',
    palette: ['#FF6B9D', '#4ECDC4', '#FFE66D'],
    title: 'Infantil',
    subtitle: 'Alegre y colorido, pensado para los niños',
  },
  {
    style: 'elegante',
    palette: ['#2E4057', '#F6AE2D', '#FFFFFF'],
    title: 'Elegante',
    subtitle: 'Formal, ideal para padrinos e instituciones',
  },
  {
    style: 'floral',
    palette: ['#D96C8A', '#F4E1D2', '#7BA05B'],
    title: 'Floral',
    subtitle: 'Suave y delicado, con flores en las esquinas',
  },
  {
    style: 'clasico',
    palette: ['#2E86AB', '#FFE66D', '#4A6FA5'],
    title: 'Clásico',
    subtitle: 'Limpio y directo, con banda de color',
  },
];

function pickTone(tone) {
  if (tone === 'formal') return 'con un tono formal y respetuoso';
  if (tone === 'divertido') return 'con un tono divertido y lleno de energía';
  return 'con un tono cálido y cercano';
}

// ---- Motor de comprensión local: extrae los datos clave de la petición ----
const ACCENT_FIXES = [
  [/\bsabado\b/g, 'sábado'], [/\bmiercoles\b/g, 'miércoles'], [/\bmusica\b/g, 'música'],
  [/\bpractica\b/g, 'práctica'], [/\bfundacion\b/g, 'Fundación'], [/\bcumpleanos\b/g, 'cumpleaños'],
];

function fixAccents(s) {
  let out = s;
  for (const [re, rep] of ACCENT_FIXES) out = out.replace(re, rep);
  return out;
}

function understand(prompt, kind) {
  const p = fixAccents((prompt || '').toLowerCase().normalize('NFC'));
  const has = (re) => re.test(p);

  // Tipo de evento
  let event = null;
  if (has(/aniversario/)) event = 'el aniversario de la Fundación Niño Feliz';
  else if (has(/cumplea[ñn]os/)) event = 'la fiesta de cumpleaños';
  else if (has(/graduaci[óo]n|grado/)) event = 'la ceremonia de graduación';
  else if (has(/d[íi]a del ni[ñn]o/)) event = 'la celebración del Día del Niño';
  else if (has(/navidad|natalicio|decembrin/)) event = 'la celebración de Navidad';
  else if (has(/fiesta|celebraci[óo]n|pase[ñn]o|recreov[íi]a|jornada|taller|evento|actividad/)) {
    const m = p.match(/(fiesta|celebraci[óo]n|pase[ñn]o|recreov[íi]a|jornada|taller|evento|actividad)[a-záéíóúñ ]*/);
    event = `la ${m[0].trim()}`;
  }

  // Fecha y hora
  let when = null;
  const dm = p.match(/el \d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
  const hora = p.match(/a la[s]? \d{1,2}(:\d{2})?\s*(am|pm|de la (ma[ñn]ana|tarde|noche))?/);
  if (dm && hora) when = `${dm[0]}, ${hora[0]}`;
  else if (dm) when = dm[0];
  else if (hora) when = hora[0];
  else {
    const wm = p.match(/este (s[áa]bado|domingo|lunes|martes|mi[ée]rcoles|jueves|viernes)|el pr[óo]ximo (s[áa]bado|domingo|lunes|martes|mi[ée]rcoles|jueves|viernes)|ma[ñn]ana|hoy/);
    if (wm) when = wm[0];
  }

  // Lugar
  let place = null;
  const pm = p.match(/en (la fundaci[óo]n|el parque|la sede|el auditorio|el sal[óo]n|la plaza|el colegio|la escuela)[a-záéíóúñ ]*/);
  if (pm) place = pm[0].trim();

  // Destinatarios
  let audience = null;
  if (has(/estudiantes|j[óo]venes de estudio|j[óo]venes/)) audience = 'todos nuestros jóvenes y estudiantes';
  else if (has(/padrinos/)) audience = 'nuestros queridos padrinos';
  else if (has(/ni[ñn]os|peques/)) audience = 'todos los niños y niñas';
  else if (has(/padres|familias/)) audience = 'todas las familias';
  else if (has(/todos/)) audience = 'toda nuestra gran familia';

  // Actividades adicionales
  const extras = [];
  for (const [re, label] of [
    [/pastel/, 'un delicioso pastel'],
    [/juegos/, 'juegos y dinámicas para todos'],
    [/m[úu]sica/, 'música y baile'],
    [/refrigerio|comida|merienda/, 'un rico refrigerio'],
    [/sorpresas|sorpresa/, 'muchas sorpresas'],
    [/pi[ñn]ata/, 'piñata'],
    [/premiaci[óo]n|premios/, 'premios sorpresa'],
  ]) {
    if (has(re)) extras.push(label);
  }

  const isInvite = kind === 'invitacion' || has(/invit/);
  const isLetter = kind === 'carta' || has(/carta/);
  const isBirthday = has(/cumplea[ñn]os/) || (!event && !isInvite && !isLetter);

  return { event, when, place, audience, extras, isInvite, isLetter, isBirthday };
}

function joinEvent(opening, event) {
  // "a el" -> "al", "de el" -> "del"
  const s = `${opening} ${event}`;
  return s.replace(/ a el /g, ' al ').replace(/ de el /g, ' del ');
}

function composeCore(u, variantIdx) {
  const parts = [];
  if (u.isInvite) {
    const openings = [
      'Tenemos el gusto de invitarte a celebrar',
      '¡Queremos invitarte de todo corazón a celebrar',
      'Nos encantaría compartir contigo',
      'Te invitamos con mucho cariño a',
      'Únete a la celebración de',
    ];
    const ev = u.event || 'un día muy especial lleno de alegría';
    let s = joinEvent(openings[variantIdx % openings.length], ev);
    if (u.when) s += ` ${u.when}`;
    s += '.';
    parts.push(s);
    if (u.place) parts.push(`El encuentro será ${u.place}.`);
    if (u.audience) parts.push(`Esta celebración es para ${u.audience}.`);
  } else if (u.isLetter) {
    parts.push(`Escribimos esta carta para ti, {{nombre}}, con mucho cariño.`);
    if (u.event) parts.push(`Queremos recordarte que muy pronto viviremos ${u.event}${u.when ? ` ${u.when}` : ''}.`);
    else parts.push('Queremos recordarte lo importante que eres para nuestra familia.');
  } else {
    parts.push('Hoy es un día muy especial: ¡feliz cumpleaños, {{nombre}}! 🎂');
    parts.push('Que la pases increíble rodeado(a) del cariño de toda la Fundación Niño Feliz.');
  }
  if (u.extras.length > 0) {
    parts.push(`Habrá ${u.extras.slice(0, 3).join(', ')}.`);
  }
  return parts;
}

function localGenerate(prompt, kind, tone) {
  const u = understand(prompt, kind);
  const formal = tone === 'formal';

  const closers = formal
    ? ['Con aprecio y respeto,\nFundación Niño Feliz 💛', 'Atentamente,\nFundación Niño Feliz 💛', 'Cordialmente,\nFundación Niño Feliz 💛', 'Con reconocimiento a tu invaluable apoyo,\nFundación Niño Feliz 💛', 'Con nuestra más sincera gratitud,\nFundación Niño Feliz 💛']
    : ['Con cariño,\nFundación Niño Feliz 💛', 'Con amor,\nFundación Niño Feliz 💛', 'Con un abrazo grande,\nFundación Niño Feliz 💛', 'Con alegría,\nFundación Niño Feliz 💛', 'Con mucha ilusión,\nFundación Niño Feliz 💛'];

  const headings = u.isInvite
    ? ['🎉 ¡Estás Invitado! 🎉', '🌟 Nuestra Invitación', '💛 Te Esperamos', '🎈 ¡Gran Fiesta! 🎈', '✨ Guarda la Fecha ✨']
    : u.isLetter
      ? ['💌 Una carta para ti', '💛 Para ti, con cariño', '🌟 Un mensaje especial', '✉️ Palabras para ti', '🤗 De nuestra familia a la tuya']
      : ['🎂 ¡Feliz Cumpleaños! 🎉', '🎈 ¡Hoy celebramos tu día!', '🌟 ¡Felicidades, {{nombre}}!', '🎉 ¡Un año lleno de vida!', '💛 Tu día especial'];

  const bodies = headings.map((heading, i) => {
    const lines = [heading, '', ...composeCore(u, i)];
    if (u.isInvite) {
      lines.push(formal ? 'Contamos con tu valiosa presencia.' : '¡No puede faltar tu sonrisa! 😄');
    } else if (u.isLetter) {
      lines.push('Gracias por regalar tu tiempo y tu corazón a nuestra causa.');
    }
    lines.push('', closers[i % closers.length]);
    return lines.join('\n');
  });

  return DESIGN_STYLES.map((d, i) => ({
    title: d.title,
    body: bodies[i % bodies.length],
    design: {
      style: d.style,
      palette: d.palette,
      subtitle: d.subtitle,
    },
  }));
}

export async function generateDesigns(prompt, kind, tone) {
  if (OPENAI_KEY) {
    try {
      const variants = await generateWithOpenAI(prompt, kind, tone);
      return { variants, source: 'openai' };
    } catch (err) {
      console.error('[ai] OpenAI failed, using local generator:', err.message);
    }
  }
  return { variants: localGenerate(prompt, kind, tone), source: 'local' };
}
