/**
 * SMTP email delivery.
 *
 * Supports the three security modes a small business actually meets:
 *  - none     : plain SMTP on port 25/587 without STARTTLS (rare)
 *  - starttls : upgrade in place, the usual choice on port 587
 *  - ssl      : implicit TLS from the first byte, port 465
 */

const nodemailer = require("nodemailer");
const { decrypt } = require("./secrets");

const SECURE_MODES = ["none", "starttls", "ssl"];

function normalize(settings) {
  const smtp = settings.smtp || {};
  const secureMode = SECURE_MODES.includes(smtp.secure) ? smtp.secure : "ssl";
  return {
    host: smtp.host || "",
    port: Number(smtp.port) || (secureMode === "ssl" ? 465 : 587),
    user: smtp.user || "",
    password: decrypt(smtp.password),
    secureMode,
    from: smtp.from || smtp.user || "",
    fromName: smtp.fromName || settings.companyName || "CRM",
    replyTo: smtp.replyTo || "",
  };
}

function transportFor(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // implicit TLS on ssl, otherwise let nodemailer upgrade via STARTTLS
    secure: cfg.secureMode === "ssl",
    requireTLS: cfg.secureMode === "starttls",
    ignoreTLS: cfg.secureMode === "none",
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    // 10s is plenty for a transactional send and keeps the UI responsive
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

/** Validates the SMTP block before attempting a connection. */
function assertConfigured(cfg) {
  if (!cfg.host) throw new Error("Falta el servidor SMTP en Ajustes → Envío");
  if (!cfg.from) throw new Error("Falta el remitente en Ajustes → Envío");
}

/** Opens a connection and reports the greeting, without sending anything. */
async function test(settings) {
  const cfg = normalize(settings);
  assertConfigured(cfg);
  const transport = transportFor(cfg);
  try {
    const info = await transport.verify();
    return {
      ok: true,
      detail: info.secure
        ? `Conexión segura con ${cfg.host}:${cfg.port}`
        : `Conexión con ${cfg.host}:${cfg.port}`,
    };
  } catch (err) {
    throw new Error(friendlyError(err));
  } finally {
    transport.close();
  }
}

/**
 * Sends one message. Returns the provider message id so the invoice can record
 * exactly what was delivered.
 */
async function send(settings, { to, subject, body, attachments = [] }) {
  const cfg = normalize(settings);
  assertConfigured(cfg);
  if (!to) throw new Error("Falta el destinatario");

  const transport = transportFor(cfg);
  try {
    const info = await transport.sendMail({
      from: { name: cfg.fromName, address: cfg.from },
      to,
      subject,
      text: body,
      html: toHtml(subject, body),
      ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
      attachments,
    });
    return { ok: true, messageId: info.messageId || "", accepted: info.accepted || [] };
  } catch (err) {
    throw new Error(friendlyError(err));
  } finally {
    transport.close();
  }
}

/** Minimal HTML wrapper: plain text bodies stay readable in every client. */
function toHtml(subject, body) {
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = String(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a"><h2 style="font-size:16px;margin:0 0 12px">${esc(
    subject
  )}</h2>${paragraphs}</div>`;
}

/** Turns driver errors into something an administrator can act on. */
function friendlyError(err) {
  const code = err && err.code ? String(err.code) : "";
  const msg = err && err.message ? err.message : String(err);
  if (code === "ECONNREFUSED" || /connect ECONNREFUSED/i.test(msg)) {
    return `No se pudo conectar a ${err.host || "el servidor SMTP"}. Revisa host y puerto.`;
  }
  if (code === "ETIMEDOUT" || /timed? ?out/i.test(msg)) {
    return "El servidor SMTP no respondió a tiempo. Revisa el puerto y el modo de seguridad.";
  }
  if (code === "EAUTH" || /Invalid login|535|534|auth/i.test(msg)) {
    return "Credenciales SMTP incorrectas. Verificá el usuario y la contraseña.";
  }
  if (/self.signed|unable to verify|altnames|DEPTH_ZERO/i.test(msg)) {
    return "El certificado SSL no es válido para ese servidor. Probá con seguridad STARTTLS en el puerto 587.";
  }
  if (/STARTTLS/i.test(msg)) {
    return "El servidor pidió STARTTLS pero está configurado sin TLS. Probá el modo STARTTLS.";
  }
  if (/550|553|relay|Relay/i.test(msg)) {
    return `El servidor rechazó el remitente o el destinatario: ${msg}`;
  }
  return `Error de email: ${msg}`;
}

module.exports = { test, send, normalize, SECURE_MODES };