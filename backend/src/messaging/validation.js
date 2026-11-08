const { decrypt } = require("./secrets");

/**
 * Company identity fields used by the invoice PDF header.
 * Kept separate from `stages`/`currency` so the settings validator can reject
 * bad values without touching the rest of the schema.
 */

const MAX = {
  address: 160,
  phone: 40,
  email: 120,
  taxId: 40,
  website: 120,
  invoiceNotes: 400,
  publicUrl: 200,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{6,40}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

/**
 * Validates and stores the messaging/identity blocks into `next`.
 * Secrets are encrypted here so they never persist in clear text.
 *
 * @param {object} input  payload from the client
 * @param {object} next   the settings object being built (mutated)
 * @param {object} helpers { encrypt, decrypt, currentSmtp, currentWhatsapp }
 */
function applyMessaging(input, next, helpers) {
  const { encrypt, decrypt } = helpers;

  // ---- Company identity (shown on the PDF) ----
  if (input.address !== undefined) {
    next.address = String(input.address).trim().slice(0, MAX.address);
  }
  if (input.phone !== undefined) {
    const v = String(input.phone).trim().slice(0, MAX.phone);
    if (v && !PHONE_RE.test(v)) throw new Error("El teléfono tiene un formato inválido");
    next.phone = v;
  }
  if (input.email !== undefined) {
    const v = String(input.email).trim().toLowerCase().slice(0, MAX.email);
    if (v && !EMAIL_RE.test(v)) throw new Error("El email de la empresa no es válido");
    next.email = v;
  }
  if (input.taxId !== undefined) {
    next.taxId = String(input.taxId).trim().slice(0, MAX.taxId);
  }
  if (input.website !== undefined) {
    const v = String(input.website).trim().slice(0, MAX.website);
    if (v && !URL_RE.test(v)) throw new Error("El sitio web debe empezar con http:// o https://");
    next.website = v;
  }
  if (input.invoiceNotes !== undefined) {
    next.invoiceNotes = String(input.invoiceNotes).trim().slice(0, MAX.invoiceNotes);
  }
  if (input.publicUrl !== undefined) {
    const v = String(input.publicUrl).trim().replace(/\/+$/, "").slice(0, MAX.publicUrl);
    if (v && !URL_RE.test(v)) throw new Error("La URL pública debe empezar con http:// o https://");
    next.publicUrl = v;
  }

  // ---- SMTP ----
  if (input.smtp !== undefined) {
    const raw = input.smtp || {};
    const current = next.smtp || {};
    const port = raw.port === undefined ? current.port : Number(raw.port);
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error("El puerto SMTP debe estar entre 1 y 65535");
    }
    const from = raw.from === undefined ? current.from : String(raw.from || "").trim();
    if (from && !EMAIL_RE.test(from)) throw new Error("El remitente no es un email válido");

    next.smtp = {
      host: raw.host === undefined ? current.host || "" : String(raw.host || "").trim().slice(0, 120),
      port: port || 587,
      user: raw.user === undefined ? current.user || "" : String(raw.user || "").trim().slice(0, 120),
      // An empty password means "keep the stored one", so the UI can mask it.
      password: raw.password ? encrypt(raw.password) : current.password || "",
      secure: ["none", "starttls", "ssl"].includes(raw.secure) ? raw.secure : current.secure || "ssl",
      from,
      fromName: raw.fromName === undefined ? current.fromName || "" : String(raw.fromName || "").trim().slice(0, 80),
      replyTo:
        raw.replyTo === undefined
          ? current.replyTo || ""
          : String(raw.replyTo || "").trim().toLowerCase(),
    };
    if (next.smtp.replyTo && !EMAIL_RE.test(next.smtp.replyTo)) {
      throw new Error("El «responder a» no es un email válido");
    }
  }

  // ---- WhatsApp ----
  if (input.whatsapp !== undefined) {
    const raw = input.whatsapp || {};
    const current = next.whatsapp || {};
    const mode = ["evolution", "cloud"].includes(raw.mode) ? raw.mode : current.mode || "evolution";
    const url = raw.url === undefined ? current.url || "" : String(raw.url || "").trim().replace(/\/+$/, "");
    if (url && !URL_RE.test(url)) throw new Error("La URL de Evolution API debe empezar con http:// o https://");

    next.whatsapp = {
      mode,
      url: url.slice(0, MAX.publicUrl),
      instance: raw.instance === undefined ? current.instance || "" : String(raw.instance || "").trim().slice(0, 60),
      apiKey: raw.apiKey ? encrypt(raw.apiKey) : current.apiKey || "",
      phoneNumberId:
        raw.phoneNumberId === undefined ? current.phoneNumberId || "" : String(raw.phoneNumberId || "").trim().slice(0, 40),
      token: raw.token ? encrypt(raw.token) : current.token || "",
    };
    if (mode === "evolution" && next.whatsapp.url && !/^https?:\/\//i.test(next.whatsapp.url)) {
      throw new Error("La URL de Evolution API debe empezar con http:// o https://");
    }
  }
}

/** Replaces secrets with a masked version before sending settings to the client. */
function publicSettings(settings) {
  const clone = JSON.parse(JSON.stringify(settings));
  if (clone.smtp) {
    // decrypt() is only used to learn the length so the mask has a stable shape.
    clone.smtp.password = clone.smtp.password
      ? "•".repeat(Math.min(12, Math.max(4, decrypt(clone.smtp.password).length - 2)))
      : "";
  }
  if (clone.whatsapp) {
    clone.whatsapp.apiKey = clone.whatsapp.apiKey ? "•".repeat(10) : "";
    clone.whatsapp.token = clone.whatsapp.token ? "•".repeat(10) : "";
  }
  return clone;
}

module.exports = { applyMessaging, publicSettings, MAX };