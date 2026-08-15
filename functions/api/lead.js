/**
 * POST /api/lead — Landing de TASACIONES
 * Recibe los datos del formulario, valida y reenvía a Tokko CRM.
 * La API key vive en env vars de CF Pages (TOKKO_API_KEY) — nunca en el browser.
 *
 * Env vars requeridas en CF Pages → Settings → Environment variables:
 *   TOKKO_API_KEY  →  la API key de Tokko
 *
 * Nota: este formulario NO pide email (decisión de conversión — tráfico frío de Meta).
 * Si Tokko rechaza contactos sin email, activar FALLBACK_EMAIL.
 */

const TOKKO_ENDPOINT  = 'https://www.tokkobroker.com/api/v1/webcontact/';
const TAG             = 'landing-tasacion';
const ALLOWED_ORIGINS = [
  'https://tasacion.akprop.com.ar',
  'https://akprop-tasacion.pages.dev',
];
// Si Tokko exige email, poner true: manda un placeholder para que el contacto entre igual.
const FALLBACK_EMAIL  = false;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin') || ''),
  });
}

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(request.headers.get('origin') || '');

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400, headers);
  }

  const nombre     = (body.nombre     || '').trim();
  const contacto   = (body.contacto   || '').trim();
  const direccion  = (body.direccion  || '').trim();
  const tipo       = (body.tipo       || '').trim();
  const superficie = (body.superficie || '').trim();
  const origen     = (body.origen     || '').trim();
  const utm        = body.utm && typeof body.utm === 'object' ? body.utm : {};

  // Validación mínima: nombre + teléfono (lo único que necesitamos para contactar)
  if (!nombre || !contacto) {
    return json({ ok: false, error: 'missing_fields' }, 400, headers);
  }
  if (contacto.replace(/\D/g, '').length < 7) {
    return json({ ok: false, error: 'invalid_phone' }, 400, headers);
  }

  // Texto del contacto en Tokko
  let text = 'SOLICITUD DE TASACIÓN (landing tasacion.akprop.com.ar).';
  text += ` Teléfono/WhatsApp: ${contacto}.`;
  if (direccion)  text += ` Propiedad: ${direccion}.`;
  if (tipo)       text += ` Tipo: ${tipo}.`;
  if (superficie) text += ` Superficie aprox.: ${superficie} m².`;
  if (origen)     text += ` Formulario: ${origen}.`;

  const utmStr = Object.keys(utm)
    .filter(k => utm[k])
    .map(k => `${k}=${String(utm[k]).slice(0, 120)}`)
    .join(' | ');
  if (utmStr) text += ` Campaña: ${utmStr}.`;

  const payload = {
    name:  nombre,
    phone: contacto,
    text:  text,
    tags:  [TAG],
  };
  if (body.email) {
    payload.email = String(body.email).trim();
  } else if (FALLBACK_EMAIL) {
    payload.email = `sin-email+${Date.now()}@akprop.com.ar`;
  }

  const apiKey = env.TOKKO_API_KEY;
  if (!apiKey) {
    console.error('TOKKO_API_KEY no configurada');
    return json({ ok: false, error: 'server_config_error' }, 500, headers);
  }

  let tokkoRes;
  try {
    tokkoRes = await fetch(`${TOKKO_ENDPOINT}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Error de red al llamar Tokko:', err);
    return json({ ok: false, error: 'network_error' }, 502, headers);
  }

  if (!tokkoRes.ok) {
    const detail = await tokkoRes.text().catch(() => '');
    console.error(`Tokko respondió ${tokkoRes.status}:`, detail);
    return json({ ok: false, error: 'tokko_error', status: tokkoRes.status }, 502, headers);
  }

  return json({ ok: true }, 200, headers);
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}
