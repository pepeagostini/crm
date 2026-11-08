/**
 * WhatsApp delivery through two providers that share one interface.
 *
 *  - "evolution": Evolution API (self-hosted, no per-message cost). The default
 *    because it needs nothing but a container and keeps the CRM in control.
 *  - "cloud":    WhatsApp Cloud API from Meta. Official, scales, but the number
 *    must be a verified business and outbound templates need approval.
 *
 * Both resolve to `send()` → `{ ok, messageId }`.
 */

const { decrypt } = require("./secrets");

const MODES = ["evolution", "cloud"];

function normalize(settings) {
  const wa = settings.whatsapp || {};
  const mode = MODES.includes(wa.mode) ? wa.mode : "evolution";
  return {
    mode,
    // Evolution API
    url: (wa.url || "").replace(/\/+$/, ""),
    instance: wa.instance || "",
    apiKey: decrypt(wa.apiKey),
    // Cloud API
    phoneNumberId: wa.phoneNumberId || "",
    token: decrypt(wa.token),
  };
}

function assertConfigured(cfg) {
  if (cfg.mode === "evolution") {
    if (!cfg.url) throw new Error("Falta la URL de Evolution API en Ajustes → Envío");
    if (!cfg.instance) throw new Error("Falta la instancia de Evolution API");
    if (!cfg.apiKey) throw new Error("Falta la API key de Evolution API");
  } else {
    if (!cfg.phoneNumberId) throw new Error("Falta el Phone Number ID de Meta");
    if (!cfg.token) throw new Error("Falta el token de acceso de Meta");
  }
}

/** Normalises a phone number to digits only (Evolution wants no formatting). */
function digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/** Trims a message to the WhatsApp text limit. */
function clampText(text) {
  const clean = String(text || "").trim();
  return clean.length > 4096 ? clean.slice(0, 4095) + "…" : clean;
}

/**
 * Chooses how to deliver:
 *  - Evolution accepts the PDF as an upload, so the attachment goes through.
 *  - The Cloud API cannot upload, so the message carries a link to the PDF.
 */
async function send(cfg, { to, body, attachmentPath, attachmentName, publicUrl }) {
  assertConfigured(cfg);
  const number = digits(to);
  if (!number) throw new Error("El número de WhatsApp no es válido");

  let text = clampText(body);

  if (cfg.mode === "evolution") {
    return sendEvolution(cfg, { to: number, text, attachmentPath, attachmentName });
  }

  if (attachmentPath) {
    if (!publicUrl) {
      throw new Error(
        "Para adjuntar la factura por Cloud API hace falta una URL pública del CRM configurada."
      );
    }
    const link = `${publicUrl.replace(/\/+$/, "")}/invoices/${encodeURIComponent(
      attachmentName
    )}`;
    text = `${text}\n\nPDF de la factura: ${link}`;
  }
  return sendCloud(cfg, { to: number, text });
}

/** Evolution API — POST /message/sendText and /message/sendMedia. */
async function sendEvolution(cfg, { to, text, attachmentPath, attachmentName }) {
  const base = `${cfg.url}/message/send${attachmentPath ? "Media" : "Text"}`;
  const headers = { apikey: cfg.apiKey, "Content-Type": "application/json" };
  const fs = require("fs");

  const build = (media) => {
    const body = { number: to, text };
    if (media) body.media = media;
    return body;
  };

  let response;
  if (attachmentPath) {
    // Evolution expects the media as a data URI.
    const data = fs.readFileSync(attachmentPath).toString("base64");
    const media = `data:application/pdf;base64,${data}`;
    response = await fetch(base, { method: "POST", headers, body: JSON.stringify(build(media)) });
  } else {
    response = await fetch(base, { method: "POST", headers, body: JSON.stringify(build()) });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Evolution API rechazó el envío: ${payload.response || payload.message || `HTTP ${response.status}`}`
    );
  }
  return {
    ok: true,
    messageId: String(payload.key?.id || payload.messageId || payload.key || ""),
  };
}

/** WhatsApp Cloud API (Meta) — POST /{phone-number-id}/messages. */
async function sendCloud(cfg, { to, text }) {
  const url = `https://graph.facebook.com/v21.0/${cfg.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || `HTTP ${response.status}`;
    throw new Error(`WhatsApp Cloud API rechazó el envío: ${detail}`);
  }
  return { ok: true, messageId: payload.messages?.[0]?.id || "" };
}

/** Verifies the credentials without sending anything to a customer. */
async function test(cfg) {
  assertConfigured(cfg);
  if (cfg.mode === "evolution") {
    const response = await fetch(`${cfg.url}/`, { headers: { apikey: cfg.apiKey } });
    if (!response.ok) throw new Error(`Evolution API respondió HTTP ${response.status}`);
    return { ok: true, detail: `Evolution API conectada (instancia «${cfg.instance}»)` };
  }
  // Cloud API: read the phone number metadata as the cheapest auth probe.
  const url = `https://graph.facebook.com/v21.0/${cfg.phoneNumberId}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Credenciales de Meta inválidas: ${payload.error?.message || `HTTP ${response.status}`}`);
  }
  return {
    ok: true,
    detail: `WhatsApp Cloud API conectada · ${payload.display_phone_number || cfg.phoneNumberId}`,
  };
}

/** Friendly, actionable errors for the most common provider failures. */
function friendlyError(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return "No se pudo contactar al proveedor de WhatsApp. Revisá la URL y que el servicio esté levantado.";
  }
  if (/401|403|unauthor|apikey/i.test(msg)) {
    return `Credenciales de WhatsApp inválidas o sin permiso. ${msg}`;
  }
  if (/429|rate limit/i.test(msg)) {
    return "WhatsApp alcanzó el límite de mensajes. Probá en unos minutos.";
  }
  return msg;
}

module.exports = { normalize, send, test, digits, friendlyError, MODES };