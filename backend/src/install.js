/**
 * Quick-install orchestration.
 *
 * Responsibilities:
 *  - report whether the CRM already has a database configured
 *  - validate the credentials the admin typed in the wizard
 *  - create the database, its schema and the admin account automatically
 *  - optionally migrate the data already present in db.json
 *  - persist the resulting configuration to .env and reconnect the app
 *
 * The running app keeps using its in-memory maps as the working store (so no
 * request handler needs to change); this module makes that store durable by
 * hydrating it from, and writing it through to, the selected database.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { describeProviders, getProvider, makePersistence, COLLECTIONS } = require("./db/providers");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(BACKEND_ROOT, ".env");
const DB_JSON = path.join(__dirname, "db.json");

const ADMIN_EMAIL = "pedroagostini@gmail.com";
const ADMIN_PASSWORD = "/&aztq9hjbtaz";

// ---------------------------------------------------------------------------
// .env helpers
// ---------------------------------------------------------------------------

/** Reads a `.env` file without depending on dotenv's process side effects. */
function readEnvFile(file = ENV_FILE) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Rewrites `.env` in place, preserving comments and unrelated keys. */
function writeEnvValues(values, file = ENV_FILE) {
  let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const serialized = value === undefined || value === null ? "" : String(value);
    const line = `${key}=${serialized}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      if (content && !content.endsWith("\n")) content += "\n";
      content += `${line}\n`;
    }
  }
  fs.writeFileSync(file, content, { mode: 0o600 });
}

/** Hides the password so the frontend can display the URL safely. */
function maskUrl(url) {
  if (!url) return "";
  return url.replace(/:\/\/([^:@/]+):([^@/]*)@/, (_m, user) => `://${user}:••••@`);
}

// ---------------------------------------------------------------------------
// Configuration state
// ---------------------------------------------------------------------------

/** Reads the persisted installation configuration, if any. */
function readConfig() {
  const env = readEnvFile();
  const providerId = env.CRM_DB_PROVIDER;
  if (!providerId) return null;
  let credentials = {};
  if (env.CRM_DB_CONFIG) {
    try {
      credentials = JSON.parse(Buffer.from(env.CRM_DB_CONFIG, "base64").toString("utf8"));
    } catch {
      credentials = {};
    }
  }
  return {
    provider: providerId,
    url: env.DATABASE_URL || "",
    credentials,
  };
}

/** True when a previous install completed and wrote the configuration. */
function isConfigured() {
  return Boolean(readConfig() && readConfig().url);
}

/** Status payload consumed by the frontend to decide whether to show /install. */
function status() {
  const config = readConfig();
  if (!config) {
    return { configured: false, providers: describeProviders() };
  }
  return {
    configured: true,
    provider: config.provider,
    url: maskUrl(config.url),
    providers: describeProviders(),
  };
}

// ---------------------------------------------------------------------------
// Credential validation
// ---------------------------------------------------------------------------

/**
 * Rejects incomplete or obviously unsafe credentials before touching the
 * network, so the wizard can show an inline error instead of a stack trace.
 */
function validate(cfg) {
  const provider = getProvider(cfg.provider);
  const errors = {};
  for (const field of provider.fields) {
    const value = cfg[field.key];
    const required = field.key !== "ssl" && !(provider.id === "mongodb" && ["user", "password"].includes(field.key));
    if (required && (value === undefined || value === null || String(value).trim() === "")) {
      errors[field.key] = `${field.label} es obligatorio`;
    }
  }
  if (provider.needsServer && cfg.database && !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(String(cfg.database))) {
    errors.database = "Use solo letras, números, guion y guion bajo";
  }
  if (cfg.port && (!Number.isInteger(Number(cfg.port)) || Number(cfg.port) < 1 || Number(cfg.port) > 65535)) {
    errors.port = "Puerto inválido";
  }
  if (Object.keys(errors).length) {
    const err = new Error(Object.values(errors)[0]);
    err.fields = errors;
    throw err;
  }
  return { ...cfg, port: Number(cfg.port) || undefined };
}

/** Proves the credentials work without creating anything. */
async function test(rawCfg) {
  const cfg = validate(rawCfg);
  const provider = getProvider(cfg.provider);
  try {
    return await provider.test(cfg);
  } catch (err) {
    throw new Error(translateConnectionError(cfg.provider, err));
  }
}

// ---------------------------------------------------------------------------
// Seed / migration payloads
// ---------------------------------------------------------------------------

/** Reads the current JSON store, if it holds data worth migrating. */
function readLegacySnapshot() {
  if (!fs.existsSync(DB_JSON)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(DB_JSON, "utf8"));
    const hasData = COLLECTIONS.some((c) => raw[c] && Object.keys(raw[c]).length);
    return hasData ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Builds the snapshot to persist on a fresh install: either the legacy JSON
 * data, or a single admin account so the wizard can log in immediately.
 */
async function buildInitialSnapshot(migrateExisting) {
  const bcrypt = require("bcrypt");
  const legacy = migrateExisting ? readLegacySnapshot() : null;
  if (legacy) {
    return { snapshot: legacy, migrated: true };
  }
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  return {
    snapshot: {
      users: {
        [ADMIN_EMAIL]: {
          id: ADMIN_EMAIL,
          name: "Pedro Agostini",
          email: ADMIN_EMAIL,
          password: hash,
          role: "ADMIN",
          active: true,
          createdAt: new Date().toISOString(),
        },
      },
      companies: {},
      contacts: {},
      deals: {},
      invoices: {},
      activities: {},
      tasks: {},
      notifications: {},
      idCounter: 1,
    },
    migrated: false,
  };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Creates the database, applies the schema and persists the initial data.
 * Returns the snapshot so the caller can hydrate its in-memory store without
 * a second round-trip.
 */
async function run(rawCfg, { migrateExisting = false } = {}) {
  const cfg = validate(rawCfg);
  const provider = getProvider(cfg.provider);

  let created;
  try {
    created = await provider.create(cfg);
  } catch (err) {
    throw new Error(translateConnectionError(cfg.provider, err));
  }

  const persistence = makePersistence(cfg.provider, created);
  try {
    await persistence.ensureSchema();

    const { snapshot, migrated } = await buildInitialSnapshot(migrateExisting);
    const { failures = [] } = (await persistence.persist(snapshot)) || {};
    if (failures.length) {
      console.warn(
        `⚠️  ${failures.length} registro(s) no se pudieron guardar:`,
        failures.slice(0, 5).map((f) => `${f.collection}/${f.id}`).join(", ")
      );
    }

    writeEnvValues({
      CRM_DB_PROVIDER: cfg.provider,
      CRM_DB_CONFIG: Buffer.from(JSON.stringify(cfg), "utf8").toString("base64"),
      DATABASE_URL: created.url,
    });

    const counts = {};
    for (const collection of COLLECTIONS) {
      counts[collection] = Object.keys(snapshot[collection] || {}).length;
    }

    return {
      snapshot,
      counts,
      migrated,
      skipped: failures,
      provider: cfg.provider,
      url: maskUrl(created.url),
      persistence,
    };
  } catch (err) {
    await persistence.close();
    throw new Error(`No se pudo preparar el esquema: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Boot-time reconnection
// ---------------------------------------------------------------------------

/**
 * Reopens the database configured by a previous install and returns its
 * persistence engine plus the stored snapshot. Returns null when the CRM is
 * still running on the legacy JSON store.
 */
async function openConfigured() {
  const config = readConfig();
  if (!config || !config.url) return null;
  const provider = getProvider(config.provider);
  const created = await provider.create(config.credentials);
  const persistence = makePersistence(config.provider, created);
  const snapshot = await persistence.loadAll();
  return { persistence, snapshot, provider: config.provider };
}

// ---------------------------------------------------------------------------
// Error translation (driver messages are not user facing)
// ---------------------------------------------------------------------------

const HINTS = {
  postgresql:
    "Revisa host, puerto, usuario y contraseña. En Neon/Supabase activa SSL y usa el usuario de la conexión pooled.",
  mysql:
    "Revisa host, puerto, usuario y contraseña. El usuario necesita permiso para crear la base de datos.",
  mongodb:
    "Revisa host, puerto y credenciales. La IP del servidor debe estar en la lista de acceso de Atlas.",
  sqlite: "No se pudo escribir el archivo. Revisa los permisos de la carpeta.",
};

function translateConnectionError(providerId, err) {
  const raw = err && err.message ? err.message : String(err);
  if (/password authentication failed|authentication failed|Access denied|E_INVALID_USER|auth/i.test(raw)) {
    return `Credenciales incorrectas. ${HINTS[providerId] || ""}`.trim();
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|getaddrinfo|Server selection|timed? ?out|timeout exceeded/i.test(raw)) {
    return `No se pudo conectar al servidor. ${HINTS[providerId] || ""}`.trim();
  }
  if (/EACCES|permission denied|not supported/i.test(raw)) {
    return `Permisos insuficientes. ${HINTS[providerId] || ""}`.trim();
  }
  if (/database .* does not exist|Unknown database|ER_BAD_DB_ERROR/i.test(raw)) {
    return `La base de datos no existe todavía. ${HINTS[providerId] || ""}`.trim();
  }
  return `Error de conexión: ${raw}`;
}

module.exports = {
  ENV_FILE,
  status,
  isConfigured,
  readConfig,
  test,
  run,
  openConfigured,
  readLegacySnapshot,
  maskUrl,
  generateJwtSecret: () => crypto.randomBytes(48).toString("hex"),
  readEnvFile,
  writeEnvValues,
};