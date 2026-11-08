const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { rateLimit } = require("express-rate-limit");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ---------------------------------------------------------------------------
// Auth configuration
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error(
    "FATAL: JWT_SECRET no está definido. Copia backend/.env.example a backend/.env y genera un secreto."
  );
  process.exit(1);
}
if (JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET debe tener al menos 32 caracteres.");
  process.exit(1);
}
const JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || "7d";
const BCRYPT_ROUNDS = 10;

const isBcryptHash = (value) =>
  typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Brute-force protection on the credential endpoints.
// Only FAILED attempts count: a small team shares one office IP, so counting
// successful logins would lock everyone out after ~20 normal sign-ins.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 20,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos fallidos. Espera 15 minutos." },
});

const fs = require("fs");
const path = require("path");

const install = require("./install");
const { getProvider } = require("./db/providers");

// Messaging (email / WhatsApp / invoice PDF)
const smtp = require("./messaging/smtp");
const whatsapp = require("./messaging/whatsapp");
const invoicePdf = require("./messaging/invoicePdf");
const { applyMessaging, publicSettings } = require("./messaging/validation");
const { encrypt, decrypt } = require("./messaging/secrets");

/**
 * Renders the PDF for an invoice, resolving its company and deal so the
 * recipient block can be filled in. Shared by the /pdf and /send endpoints.
 */
async function buildInvoicePdf(invoice, contact) {
  const company = db.companies.get(invoice.companyId) || {};
  const deal = invoice.dealId ? db.deals.get(invoice.dealId) : null;
  const settings = getSettings();
  const resolvedContact = contact || (deal && deal.contactId ? db.contacts.get(deal.contactId) : null) || null;

  // The recipient is snapshotted the first time so a reprint still shows the
  // address the invoice was issued to, even if the company record changes.
  if (!invoice.customerName) {
    invoice.customerName = company.name || "";
    invoice.customerAddress = company.address || "";
    invoice.customerTaxId = company.taxId || "";
    invoice.customerEmail = company.email || "";
  }
  invoice.taxRate = settings.taxRate;

  const file = await invoicePdf.renderInvoice({
    invoice,
    company: {
      name: settings.companyName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      taxId: settings.taxId,
    },
    contact: resolvedContact,
  });
  saveDb();
  return { ...file, contact: resolvedContact };
}

const DB_FILE = path.join(__dirname, "db.json");

// Load data from file if exists
function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      return {
        users: new Map(Object.entries(data.users || {})),
        companies: new Map(Object.entries(data.companies || {})),
        deals: new Map(Object.entries(data.deals || {})),
        invoices: new Map(Object.entries(data.invoices || {})),
        activities: new Map(Object.entries(data.activities || {})),
        contacts: new Map(Object.entries(data.contacts || {})),
        tasks: new Map(Object.entries(data.tasks || {})),
        settings: data.settings || defaultSettings(),
        idCounter: data.idCounter || 1,
      };
    }
  } catch (e) {
    console.error("Error loading DB:", e.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Persistence layer
//
// The in-memory Maps stay the working store (every request handler keeps
// reading synchronously). When an external database has been configured
// through /install, `persistence` mirrors the snapshot into it: reads are
// hydrated on boot and writes are flushed on a short debounce so a burst of
// mutations results in a single round-trip.
// ---------------------------------------------------------------------------
let persistence = null;
let persistTimer = null;
let persistChain = Promise.resolve();

/** Serialises the current in-memory state into a plain object. */
function snapshot() {
  return {
    users: Object.fromEntries(db.users),
    companies: Object.fromEntries(db.companies),
    deals: Object.fromEntries(db.deals),
    invoices: Object.fromEntries(db.invoices),
    activities: Object.fromEntries(db.activities),
    contacts: Object.fromEntries(db.contacts),
    tasks: Object.fromEntries(db.tasks),
    notifications: Object.fromEntries(db.notifications || new Map()),
    settings: db.settings,
    idCounter: db.idCounter,
  };
}

/** Fills the in-memory Maps from a snapshot read out of the database. */
function hydrateFrom(data) {
  if (!data) return;
  const hydrate = (map, records) => {
    if (!records) return;
    map.clear();
    for (const [id, record] of Object.entries(records)) map.set(id, record);
  };
  hydrate(db.users, data.users);
  hydrate(db.companies, data.companies);
  hydrate(db.deals, data.deals);
  hydrate(db.invoices, data.invoices);
  hydrate(db.activities, data.activities);
  hydrate(db.contacts, data.contacts);
  hydrate(db.tasks, data.tasks);
  if (data.notifications) hydrate(db.notifications, data.notifications);
  if (data.settings) db.settings = { ...defaultSettings(), ...data.settings };
  if (data.idCounter) db.idCounter = data.idCounter;
}

/** Queues a debounced write-through to the configured database. */
function schedulePersist() {
  if (!persistence) return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const data = snapshot();
    persistChain = persistChain
      .then(() => persistence.persist(data))
      .catch((err) => console.error("Error writing to database:", err.message));
  }, 200);
}

// Save data to file (and to the configured database, when there is one)
function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(snapshot(), null, 2));
  } catch (e) {
    console.error("Error saving DB:", e.message, e.stack);
  }
  schedulePersist();
}

// In-memory storage with file persistence
const db = loadDb() || {
  users: new Map(),
  companies: new Map(),
  deals: new Map(),
  invoices: new Map(),
  activities: new Map(),
  contacts: new Map(),
  notifications: new Map(),
};

// Ensure notifications map exists (for existing db.json without the field)
if (!db.notifications) db.notifications = new Map();

// ---------------------------------------------------------------------------
// Settings — single editable object (company identity, currency, tax, pipeline)
// ---------------------------------------------------------------------------
function defaultSettings() {
  return {
    companyName: "CRM Pro",
    currency: "USD",
    taxRate: 21,
    invoicePrefix: "F-",
    // Company identity — rendered on the invoice PDF header
    address: "",
    phone: "",
    email: "",
    taxId: "",
    website: "",
    invoiceNotes: "",
    // Public URL of this deployment, needed to share PDF links by WhatsApp Cloud API
    publicUrl: "",
    // Email delivery (password is encrypted at rest)
    smtp: {
      host: "",
      port: 587,
      user: "",
      password: "",
      secure: "ssl",
      from: "",
      fromName: "",
      replyTo: "",
    },
    // WhatsApp delivery (secrets are encrypted at rest)
    whatsapp: {
      mode: "evolution",
      url: "",
      instance: "",
      apiKey: "",
      phoneNumberId: "",
      token: "",
    },
    stages: [
      { id: "PROSPECTING", label: "Prospección", probability: 10, color: "#64748b" },
      { id: "QUALIFIED", label: "Calificado", probability: 30, color: "#0284c7" },
      { id: "PROPOSAL", label: "Propuesta", probability: 50, color: "#2563eb" },
      { id: "NEGOTIATION", label: "Negociación", probability: 70, color: "#d97706" },
      { id: "WINNING", label: "Ganado", probability: 90, color: "#16a34a" },
      { id: "LOST", label: "Perdido", probability: 0, color: "#dc2626" },
    ],
  };
}

const CURRENCIES = ["USD", "EUR", "MXN", "ARS", "COP", "CLP", "PEN", "VES", "UYU", "BOB", "DOP", "GTQ", "HNL", "NIO", "CRC", "PAB"];

/** Merge saved settings over defaults so new keys appear after an upgrade. */
function getSettings() {
  return { ...defaultSettings(), ...(db.settings || {}) };
}

/**
 * Validates an incoming settings patch and throws a user-facing message.
 * Stage ids are immutable — they are the primary key of every saved deal.
 */
function validateSettings(input) {
  const next = { ...getSettings() };

  if (input.companyName !== undefined) {
    const v = String(input.companyName).trim();
    if (!v) throw new Error("El nombre de la empresa es obligatorio");
    next.companyName = v.slice(0, 120);
  }
  if (input.currency !== undefined) {
    if (!CURRENCIES.includes(input.currency)) throw new Error("Moneda no válida");
    next.currency = input.currency;
  }
  if (input.taxRate !== undefined) {
    const v = Number(input.taxRate);
    if (isNaN(v) || v < 0 || v > 100) throw new Error("El IVA debe estar entre 0 y 100");
    next.taxRate = Math.round(v * 100) / 100;
  }
  if (input.invoicePrefix !== undefined) {
    next.invoicePrefix = String(input.invoicePrefix).trim().slice(0, 12) || "F-";
  }

  if (input.stages !== undefined) {
    if (!Array.isArray(input.stages) || input.stages.length < 1) {
      throw new Error("Debe haber al menos una etapa");
    }
    if (input.stages.length > 12) throw new Error("Máximo 12 etapas");

    // Renaming a stage is harmless (deals store the id), but *removing* one
    // that still has opportunities would strand those records with an orphan
    // stage. Block it and name the offending stage.
    const incomingIds = new Set(input.stages.map((s) => String(s?.id || "")).filter(Boolean));
    const removed = [...new Set(Array.from(db.deals.values()).map((d) => d.stage))]
      .filter((stageId) => stageId && !incomingIds.has(stageId));
    if (removed.length) {
      const names = removed
        .map((id) => getSettings().stages.find((s) => s.id === id)?.label || id)
        .join(", ");
      throw new Error(
        `No puedes eliminar la(s) etapa(s) «${names}»: tienen oportunidades asociadas.`
      );
    }

    const seenIds = new Set();
    const seenLabels = new Set();
    next.stages = input.stages.map((raw, i) => {
      const label = String(raw?.label || "").trim();
      if (!label) throw new Error(`La etapa ${i + 1} necesita un nombre`);
      if (label.length > 30) throw new Error(`La etapa «${label}» supera 30 caracteres`);

      // Duplicate labels would render as two identical columns in the board —
      // reject rather than silently renaming one of them.
      const labelKey = label.toLowerCase();
      if (seenLabels.has(labelKey)) throw new Error(`Etapa duplicada: «${label}»`);
      seenLabels.add(labelKey);

      // Existing stages keep their id (it is the key stored on every deal);
      // brand-new ones get a fresh slug.
      const id = raw?.id && !seenIds.has(raw.id) ? String(raw.id) : slugify(label, seenIds);
      if (seenIds.has(id)) throw new Error(`Etapa duplicada: «${label}»`);
      seenIds.add(id);

      const probability = Number(raw?.probability);
      return {
        id,
        label: label.slice(0, 30),
        probability: isNaN(probability) ? 0 : Math.min(100, Math.max(0, probability)),
        color: /^#[0-9a-fA-F]{6}$/.test(raw?.color || "") ? raw.color : "#64748b",
      };
    });
  }

  // Messaging + company identity (email, WhatsApp, invoice PDF header).
  applyMessaging(input, next, { encrypt, decrypt });

  // The terminal stages drive reports — make sure they survived the edit.
  const ids = new Set(next.stages.map((s) => s.id));
  const labels = new Set(next.stages.map((s) => s.label.toLowerCase()));
  if (!ids.has("WINNING") && !labels.has("ganado")) {
    next.stages.push({ id: "WINNING", label: "Ganado", probability: 90, color: "#16a34a" });
  }
  if (!ids.has("LOST") && !labels.has("perdido")) {
    next.stages.push({ id: "LOST", label: "Perdido", probability: 0, color: "#dc2626" });
  }

  return next;
}

function slugify(value, taken) {
  const base =
    String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "stage";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}_${n++}`;
  return candidate;
}

// Helper to generate IDs
function generateId() {
  return `id_${db.idCounter++}`;
}

// Notifications helper: stores a notification and returns its id
function addNotification(type, title, message, entityId) {
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const notice = {
    id,
    type,
    title,
    message,
    entityId: entityId || null,
    read: false,
    createdAt: new Date(),
  };
  db.notifications.set(id, notice);
  saveDb();
  return id;
}

// ==========================================
// Seed: admin user (created/updated if missing)
// ==========================================
const ADMIN_EMAIL = "pedroagostini@gmail.com";
const ADMIN_PASSWORD = "/&aztq9hjbtaz";

/**
 * Creates or repairs the admin account.
 * Compares against a *hash*, otherwise it would overwrite the bcrypt digest
 * with the plaintext password on every boot.
 */
async function seedAdmin() {
  const desiredHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  // The admin may be stored under its email as the map key, or under a generated
// id (that is how it looked before the settings/password work). Look it up both
// ways, otherwise a second admin row gets created on every boot.
  const existing =
    db.users.get(ADMIN_EMAIL) ||
    Array.from(db.users.values()).find((u) => u && u.email === ADMIN_EMAIL);

  const needsRepair =
    !existing ||
    existing.role !== "ADMIN" ||
    !isBcryptHash(existing.password);

  if (needsRepair) {
    db.users.set(ADMIN_EMAIL, {
      id: existing?.id || generateId(),
      name: existing?.name || "Pedro Agostini",
      email: ADMIN_EMAIL,
      password: desiredHash,
      role: "ADMIN",
      mustChangePassword: false,
      active: true,
      createdAt: existing?.createdAt || new Date(),
    });
    saveDb();
    console.log("👑 Admin user seeded:", ADMIN_EMAIL);
  }
}

/**
 * One-shot migration: any password still stored in plaintext gets hashed.
 * Returns the number of accounts migrated.
 */
async function migratePlaintextPasswords() {
  let migrated = 0;
  for (const [key, user] of db.users) {
    if (!isBcryptHash(user.password)) {
      user.password = await bcrypt.hash(String(user.password), BCRYPT_ROUNDS);
      db.users.set(key, user);
      migrated++;
    }
    // Normalise fields introduced by this release
    if (user.active === undefined) user.active = true;
    if (user.role === undefined) user.role = "VENDOR";
  }
  if (migrated) {
    saveDb();
    console.log(`🔒 Migradas ${migrated} contraseña(es) a bcrypt`);
  }
  return migrated;
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "CRM API is running" });
});

// ==========================================
// INSTALL — quick database setup
// ==========================================
// Unauthenticated by design: this is the only way to configure the database,
// so it has to work before anyone can log in. Every request is rate limited
// because it can open TCP connections to an admin-supplied host.

const installLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos de instalación. Espera 15 minutos." },
});

/** Reports whether a database is already configured (drives the /install redirect). */
app.get("/api/install/status", (req, res) => {
  try {
    res.json({ success: true, data: install.status() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** Validates the credentials typed in the wizard without creating anything. */
app.post("/api/install/test", installLimiter, async (req, res) => {
  try {
    const result = await install.test(req.body || {});
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    });
  }
});

/** Creates the database, applies the schema and persists the initial data. */
app.post("/api/install/run", installLimiter, async (req, res) => {
  try {
    const migrateExisting = Boolean((req.body || {}).migrateExisting);
    const { snapshot: installed, counts, migrated, provider, url, persistence: engine, skipped } = await install.run(
      req.body || {},
      { migrateExisting }
    );

    // Adopt the freshly created database as the live store.
    hydrateFrom(installed);
    persistence = engine;

    console.log(`🗄️  Database installed: ${provider} (${url})`);
    res.json({ success: true, data: { provider, url, counts, migrated, skipped: skipped || [] } });
  } catch (err) {
    console.error("Install failed:", err.message);
    res.status(400).json({
      success: false,
      message: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    });
  }
});

// ==========================================
// SETTINGS
// ==========================================

// Readable by every signed-in user: the deal/invoice forms need the
// stage list and the default currency. These are registered before the
// global auth guard, so they declare protection explicitly.
app.get("/api/settings", authRequired, (req, res) => {
  // Secrets are masked: the browser never receives a usable password or token.
  res.json({ success: true, data: publicSettings(getSettings()) });
});

app.put("/api/settings", authRequired, requireAdmin, (req, res) => {
  try {
    const next = validateSettings(req.body || {});
    db.settings = next;
    saveDb();
    res.json({ success: true, data: next });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ==========================================
// USER MANAGEMENT (admin only)
// ==========================================

function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

function findUserById(id) {
  for (const u of db.users.values()) if (u.id === id) return u;
  return null;
}

// Anyone signed in can read the user list (needed by deal/task forms to pick
// the assigned vendor). Writes stay admin-only.
app.get("/api/users", authRequired, (req, res) => {
  const list = Array.from(db.users.values())
    .map(publicUser)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  res.json({ success: true, data: list });
});

app.post("/api/users", authRequired, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Name, email and password required" });
  }
  const key = String(email).toLowerCase().trim();
  if (db.users.has(key)) {
    return res.status(409).json({ success: false, message: "Email already registered" });
  }
  const userRole = role === "ADMIN" ? "ADMIN" : "VENDOR";
  const user = {
    id: generateId(),
    name: String(name).trim(),
    email: key,
    password: await bcrypt.hash(String(password), 10),
    role: userRole,
    active: true,
    createdAt: new Date(),
  };
  db.users.set(key, user);
  saveDb();
  res.status(201).json({ success: true, data: publicUser(user) });
});

app.patch("/api/users/:id", authRequired, requireAdmin, async (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  const { name, role, active, password } = req.body;
  if (name !== undefined) user.name = String(name).trim() || user.name;
  if (role !== undefined) user.role = role === "ADMIN" ? "ADMIN" : "VENDOR";
  if (active !== undefined) user.active = !!active;
  if (password) user.password = await bcrypt.hash(String(password), 10);
  if (user.role !== "ADMIN" && user.email === ADMIN_EMAIL) user.role = "ADMIN"; // admin nunca rebaja
  saveDb();
  res.json({ success: true, data: publicUser(user) });
});

app.delete("/api/users/:id", authRequired, requireAdmin, (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  if (user.email === ADMIN_EMAIL) {
    return res.status(400).json({ success: false, message: "No puedes eliminar al administrador principal" });
  }
  db.users.delete(user.email);
  saveDb();
  res.json({ success: true, message: "User deleted" });
});

// ==========================================
// AUTH ROUTES
// ==========================================

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }
    const key = String(email).toLowerCase().trim();
    if (db.users.has(key)) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const user = {
      id: generateId(),
      name: String(name).trim(),
      email: key,
      password: await bcrypt.hash(String(password), BCRYPT_ROUNDS),
      role: "VENDOR",
      active: true,
      createdAt: new Date(),
    };
    db.users.set(key, user);
    saveDb();

    // Never echo the hash back
    const { password: _pw, ...safe } = user;
    res.status(201).json({ success: true, data: safe });
  } catch (e) {
    console.error("register error:", e.message);
    res.status(500).json({ success: false, message: "Internal error" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const key = String(email).toLowerCase().trim();
    // Users may be keyed by id or, for the seeded admin, by email — so the
    // lookup falls back to scanning the records.
    const user =
      db.users.get(key) ||
      Array.from(db.users.values()).find((u) => u && String(u.email || "").toLowerCase().trim() === key);

    // Always run a compare so response time does not reveal whether the
    // account exists.
    const stored = user ? user.password : "$2y$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
    const ok = await bcrypt.compare(String(password), stored);

    if (!user || !ok) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (user.active === false) {
      return res.status(403).json({ success: false, message: "Account disabled" });
    }

    const token = signAccessToken(user);

    res.json({
      success: true,
      token,
      data: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ success: false, message: "Internal error" });
  }
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ success: true, data: req.user });
});

// ==========================================
// AUTH HELPERS + MIDDLEWARE
// ==========================================

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: JWT_ACCESS_TTL }
  );
}

/**
 * Verifies the Bearer token and loads a fresh copy of the user, so role or
 * account-status changes take effect immediately instead of persisting for
 * the lifetime of the token.
 */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch (e) {
    const expired = e.name === "TokenExpiredError";
    return res
      .status(401)
      .json({ success: false, message: expired ? "Session expired" : "Invalid token" });
  }

  const user = db.users.get(payload.email) || findById(db.users, payload.sub);
  if (!user) {
    return res.status(401).json({ success: false, message: "Account no longer exists" });
  }
  if (user.active === false) {
    return res.status(403).json({ success: false, message: "Account disabled" });
  }

  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

/** Gate for admin-only routes; chain after authRequired. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
}

function findById(map, id) {
  if (!id) return null;
  for (const value of map.values()) if (value.id === id) return value;
  return null;
}

// Public routes — everything under /api is protected by default.
const PUBLIC_PATHS = new Set(["/api/health", "/api/auth/login", "/api/auth/register"]);
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  return authRequired(req, res, next);
});

// ==========================================
// COMPANY / CONTACT ROUTES
// ==========================================

app.get("/api/companies", (req, res) => {
  const list = Array.from(db.companies.values());
  res.json({ success: true, data: list });
});

app.post("/api/companies", (req, res) => {
  const { name, description, industry, phone, email, address } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: "Company name required" });
  }
  const company = {
    id: generateId(),
    name,
    description,
    industry,
    phone,
    email,
    address,
    status: "ACTIVE",
    createdAt: new Date(),
  };
  db.companies.set(company.id, company); saveDb();
  res.status(201).json({ success: true, data: company });
});

app.get("/api/companies/:id", (req, res) => {
  const company = db.companies.get(req.params.id);
  if (!company) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }
  res.json({ success: true, data: company });
});

// ==========================================
// CONTACTS ROUTES
// ==========================================

app.get("/api/contacts", (req, res) => {
  const list = Array.from(db.contacts.values())
    .filter((c) => !req.query.companyId || c.companyId === req.query.companyId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  res.json({ success: true, data: list });
});

app.post("/api/contacts", (req, res) => {
  const { name, email, phone, role, notes, companyId } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: "El nombre del contacto es obligatorio" });
  }
  if (companyId && !db.companies.has(companyId)) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }
  const contact = {
    id: generateId(),
    name: String(name).trim(),
    email: email ? String(email).trim() : "",
    phone: phone ? String(phone).trim() : "",
    role: role ? String(role).trim() : "",
    notes: notes ? String(notes) : "",
    companyId: companyId || null,
    createdAt: new Date(),
  };
  db.contacts.set(contact.id, contact);
  saveDb();
  addNotification("contact", "Nuevo contacto", `Se creó el contacto "${contact.name}"`, contact.id);
  res.status(201).json({ success: true, data: contact });
});

app.get("/api/contacts/:id", (req, res) => {
  const contact = db.contacts.get(req.params.id);
  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }
  res.json({ success: true, data: contact });
});

app.patch("/api/contacts/:id", (req, res) => {
  const contact = db.contacts.get(req.params.id);
  if (!contact) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }
  const { name, email, phone, role, notes, companyId } = req.body;
  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({ success: false, message: "El nombre del contacto es obligatorio" });
    }
    contact.name = String(name).trim();
  }
  if (email !== undefined) contact.email = String(email).trim();
  if (phone !== undefined) contact.phone = String(phone).trim();
  if (role !== undefined) contact.role = String(role).trim();
  if (notes !== undefined) contact.notes = String(notes);
  if (companyId !== undefined) {
    if (companyId && !db.companies.has(companyId)) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }
    contact.companyId = companyId || null;
  }
  db.contacts.set(contact.id, contact);
  saveDb();
  res.json({ success: true, data: contact });
});

app.delete("/api/contacts/:id", (req, res) => {
  if (!db.contacts.delete(req.params.id)) {
    return res.status(404).json({ success: false, message: "Contact not found" });
  }
  saveDb();
  res.json({ success: true, message: "Contact deleted" });
});

// ==========================================
// TASK ROUTES
// ==========================================

const TASK_PRIORITIES = ["low", "medium", "high"];
const TASK_STATUSES = ["pending", "done"];

app.get("/api/tasks", (req, res) => {
  const list = Array.from(db.tasks.values())
    .filter((t) => {
      if (req.query.companyId && t.companyId !== req.query.companyId) return false;
      if (req.query.status && t.status !== req.query.status) return false;
      if (req.query.assignedTo && t.assignedTo !== req.query.assignedTo) return false;
      return true;
    })
    .sort((a, b) => {
      // pending first, then by due date (soonest first)
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
    });
  res.json({ success: true, data: list });
});

app.post("/api/tasks", (req, res) => {
  const { title, description, dueDate, priority, status, assignedTo, companyId, contactId, dealId } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, message: "El título de la tarea es obligatorio" });
  }
  if (priority && !TASK_PRIORITIES.includes(priority)) {
    return res.status(400).json({ success: false, message: "Prioridad no válida" });
  }
  const task = {
    id: generateId(),
    title: String(title).trim(),
    description: description ? String(description) : "",
    dueDate: dueDate ? String(dueDate) : null,
    priority: priority || "medium",
    status: status === "done" ? "done" : "pending",
    assignedTo: assignedTo || null,
    companyId: companyId || null,
    ...(contactId && { contactId }),
    ...(dealId && { dealId }),
    completedAt: status === "done" ? new Date() : null,
    createdAt: new Date(),
  };
  db.tasks.set(task.id, task);
  saveDb();
  addNotification("task", "Nueva tarea", `Se creó la tarea "${task.title}"`, task.id);
  res.status(201).json({ success: true, data: task });
});

app.get("/api/tasks/:id", (req, res) => {
  const task = db.tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.json({ success: true, data: task });
});

app.patch("/api/tasks/:id", (req, res) => {
  const task = db.tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  const { title, description, dueDate, priority, status, assignedTo, companyId, contactId, dealId } = req.body;
  if (title !== undefined) {
    if (!String(title).trim()) {
      return res.status(400).json({ success: false, message: "El título de la tarea es obligatorio" });
    }
    task.title = String(title).trim();
  }
  if (description !== undefined) task.description = String(description);
  if (dueDate !== undefined) task.dueDate = dueDate ? String(dueDate) : null;
  if (priority !== undefined) {
    if (!TASK_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, message: "Prioridad no válida" });
    }
    task.priority = priority;
  }
  if (status !== undefined) {
    if (!TASK_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Estado no válido" });
    }
    task.status = status;
    task.completedAt = status === "done" ? new Date() : null;
  }
  if (assignedTo !== undefined) task.assignedTo = assignedTo || null;
  if (companyId !== undefined) task.companyId = companyId || null;
  if (contactId !== undefined) task.contactId = contactId || null;
  if (dealId !== undefined) task.dealId = dealId || null;
  task.updatedAt = new Date();
  saveDb();
  res.json({ success: true, data: task });
});

app.delete("/api/tasks/:id", (req, res) => {
  if (!db.tasks.delete(req.params.id)) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  saveDb();
  res.json({ success: true, message: "Task deleted" });
});

// ==========================================
// DEAL / PIPELINE ROUTES
// ==========================================

app.get("/api/deals", (req, res) => {
  const list = Array.from(db.deals.values())
    .filter(deal => !req.query.companyId || deal.companyId === req.query.companyId)
    .sort((a, b) => b.probability - a.probability);
  res.json({ success: true, data: list });
});

app.post("/api/deals", (req, res) => {
  const { name, description, value, currency, stage, closeDate, companyId, contactId, assignedTo } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: "Deal name required" });
  }
  
  // Verify company access if companyId provided
  if (companyId && !db.companies.has(companyId)) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }

  const deal = {
    id: generateId(),
    name,
    description,
    value: value || 0,
    currency: currency || "USD",
    stage: stage || "PROSPECTING",
    probability: getProbabilityForStage(stage || "PROSPECTING"),
    closeDate,
    companyId,
    ...(contactId && { contactId }),
    ...(assignedTo && { assignedTo }),
    createdAt: new Date(),
    status: "ACTIVE",
  };
  db.deals.set(deal.id, deal); saveDb();
  addNotification("deal", "Nueva oportunidad", `Se creó la oportunidad "${deal.name}"`, deal.id);
  res.status(201).json({ success: true, data: deal });
});

app.get("/api/deals/:id", (req, res) => {
  const deal = db.deals.get(req.params.id);
  if (!deal) {
    return res.status(404).json({ success: false, message: "Deal not found" });
  }
  res.json({ success: true, data: deal });
});

app.patch("/api/deals/:id/status", (req, res) => {
  const { stage, lostReason } = req.body;
  const deal = db.deals.get(req.params.id);
  if (!deal) {
    return res.status(404).json({ success: false, message: "Deal not found" });
  }
  
  if (stage) {
    deal.stage = stage;
    deal.probability = getProbabilityForStage(stage); saveDb();
  }
  if (lostReason) {
    deal.lostReason = lostReason;
    deal.status = "LOST";
    saveDb();
  }
  
  res.json({ success: true, data: deal });
});

function getProbabilityForStage(stage) {
  // Settings-driven: admin-created stages must resolve too.
  const found = getSettings().stages.find((s) => s.id === stage);
  if (found) return found.probability;
  const legacy = {
    PROSPECTING: 10,
    QUALIFIED: 30,
    PROPOSAL: 50,
    NEGOTIATION: 70,
    WINNING: 90,
    LOST: 0,
  };
  return legacy[stage] ?? 0;
}

// ==========================================
// INVOICE ROUTES
// ==========================================

app.get("/api/invoices", (req, res) => {
  const list = Array.from(db.invoices.values());
  res.json({ success: true, data: list });
});

app.post("/api/invoices", (req, res) => {
  const { number, date, dueDate, subtotal, tax, total, currency, status, companyId, dealId, items } = req.body;
  if (!number || !companyId) {
    return res.status(400).json({ success: false, message: "Invoice number and company required" });
  }
  if (!db.companies.has(companyId)) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }

  // Optional detailed line items: description, quantity, unitPrice
  let itemsFinal = null;
  let subtotalFinal = Number(subtotal) || 0;
  if (Array.isArray(items) && items.length > 0) {
    itemsFinal = items
      .map((it) => ({
        description: String(it.description || "").trim(),
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        total: (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
      }))
      .filter((it) => it.description && it.quantity > 0);
    subtotalFinal = itemsFinal.reduce((s, it) => s + it.total, 0);
  }

  const taxFinal = tax != null && tax !== "" ? Number(tax) || 0 : Math.round((subtotalFinal * (getSettings().taxRate || 0)) / 100 * 100) / 100;

  const invoice = {
    id: generateId(),
    number,
    date: date || new Date(),
    dueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    subtotal: subtotalFinal,
    tax: taxFinal,
    // Fall back to base + tax so an invoice is never stored with total = 0
    total: total != null && total !== "" ? Number(total) : subtotalFinal + taxFinal,
    currency: currency || "USD",
    status: status || "DRAFT",
    companyId,
    ...(dealId && { dealId }),
    ...(itemsFinal && itemsFinal.length ? { items: itemsFinal } : {}),
    createdAt: new Date(),
  };
  db.invoices.set(invoice.id, invoice); saveDb();
  addNotification("invoice", "Nueva factura", `Se creó la factura "${invoice.number}"`, invoice.id);
  res.status(201).json({ success: true, data: invoice });
});

app.patch("/api/invoices/:id/status", (req, res) => {
  const { status } = req.body;
  const invoice = db.invoices.get(req.params.id);
  if (!invoice) {
    return res.status(404).json({ success: false, message: "Invoice not found" });
  }
  invoice.status = status;
  if (status === "PAID") {
    invoice.paidAt = new Date();
  }
  saveDb();
  res.json({ success: true, data: invoice });
});

// ==========================================
// ACTIVITY ROUTES
// ==========================================

app.get("/api/activities", (req, res) => {
  const list = Array.from(db.activities.values())
    .filter(a => !req.query.relatedTo || a.relatedTo === req.query.relatedTo)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ success: true, data: list });
});

app.post("/api/activities", (req, res) => {
  const { type, title, description, relatedTo, relatedId, companyId, dealId, durationMinutes, outcome, contactId } = req.body;
  if (!type || !title) {
    return res.status(400).json({ success: false, message: "Type and title required" });
  }

  let companyIdFinal = companyId;
  let dealIdFinal = dealId;

  // If relatedTo is "deal" and dealId not provided, look it up
  if (relatedTo === "deal" && !dealIdFinal && companyIdFinal) {
    // Find deals for this company
    const companyDeals = Array.from(db.deals.values()).filter(d => d.companyId === companyIdFinal);
    if (companyDeals.length > 0) {
      dealIdFinal = companyDeals[0].id;
    }
  }

  const activity = {
    id: generateId(),
    type,
    title,
    description,
    relatedTo: relatedTo || "note",
    relatedId: relatedId || null,
    ...(companyIdFinal && { companyId: companyIdFinal }),
    ...(dealIdFinal && { dealId: dealIdFinal }),
    ...(contactId && { contactId }),
    date: new Date(),
    durationMinutes,
    outcome,
  };
  db.activities.set(activity.id, activity); saveDb();
  res.status(201).json({ success: true, data: activity });
});

// ==========================================
// FULL CRUD — COMPANIES
// ==========================================

app.patch("/api/companies/:id", (req, res) => {
  const company = db.companies.get(req.params.id);
  if (!company) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }
  const allowed = ["name", "description", "industry", "phone", "email", "address", "status"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) company[key] = req.body[key];
  });
  if (!company.name) {
    return res.status(400).json({ success: false, message: "Company name required" });
  }
  company.updatedAt = new Date();
  saveDb();
  res.json({ success: true, data: company });
});

app.delete("/api/companies/:id", (req, res) => {
  const company = db.companies.get(req.params.id);
  if (!company) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }
  db.companies.delete(req.params.id);
  saveDb();
  res.json({ success: true, data: { id: req.params.id } });
});

// ==========================================
// FULL CRUD — DEALS
// ==========================================

app.patch("/api/deals/:id", (req, res) => {
  const deal = db.deals.get(req.params.id);
  if (!deal) {
    return res.status(404).json({ success: false, message: "Deal not found" });
  }
  const { name, description, value, currency, stage, closeDate, companyId, status, contactId, assignedTo } = req.body;

  if (companyId && !db.companies.has(companyId)) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }

  if (name !== undefined) deal.name = name;
  if (description !== undefined) deal.description = description;
  if (value !== undefined) deal.value = Number(value) || 0;
  if (currency !== undefined) deal.currency = currency;
  if (closeDate !== undefined) deal.closeDate = closeDate;
  if (companyId !== undefined) deal.companyId = companyId || null;
  if (contactId !== undefined) deal.contactId = contactId || null;
  if (assignedTo !== undefined) deal.assignedTo = assignedTo || null;
  if (status !== undefined) deal.status = status;

  if (stage) {
    deal.stage = stage;
    deal.probability = getProbabilityForStage(stage);
    // Keep status in sync with the stage
    if (stage === "WINNING") deal.status = "WON";
    else if (stage === "LOST") deal.status = "LOST";
    else deal.status = "ACTIVE";
  }

  if (!deal.name) {
    return res.status(400).json({ success: false, message: "Deal name required" });
  }

  deal.updatedAt = new Date();
  saveDb();
  res.json({ success: true, data: deal });
});

app.delete("/api/deals/:id", (req, res) => {
  const deal = db.deals.get(req.params.id);
  if (!deal) {
    return res.status(404).json({ success: false, message: "Deal not found" });
  }
  db.deals.delete(req.params.id);
  saveDb();
  res.json({ success: true, data: { id: req.params.id } });
});

// ==========================================
// FULL CRUD — INVOICES
// ==========================================

app.get("/api/invoices/:id", (req, res) => {
  const invoice = db.invoices.get(req.params.id);
  if (!invoice) {
    return res.status(404).json({ success: false, message: "Invoice not found" });
  }
  res.json({ success: true, data: invoice });
});

app.patch("/api/invoices/:id", (req, res) => {
  const invoice = db.invoices.get(req.params.id);
  if (!invoice) {
    return res.status(404).json({ success: false, message: "Invoice not found" });
  }
  const { number, date, dueDate, subtotal, tax, total, currency, status, companyId, dealId, items } = req.body;

  if (companyId && !db.companies.has(companyId)) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }

  if (Array.isArray(items)) {
    const itemsFinal = items
      .map((it) => ({
        description: String(it.description || "").trim(),
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        total: (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
      }))
      .filter((it) => it.description && it.quantity > 0);
    invoice.items = itemsFinal;
    invoice.subtotal = itemsFinal.reduce((s, it) => s + it.total, 0);
    if (tax === undefined || tax === "" || tax === null) {
      invoice.tax = Math.round((invoice.subtotal * (getSettings().taxRate || 0)) / 100 * 100) / 100;
    }
  }

  if (number !== undefined) invoice.number = number;
  if (date !== undefined) invoice.date = date;
  if (dueDate !== undefined) invoice.dueDate = dueDate;
  if (currency !== undefined) invoice.currency = currency;
  if (status !== undefined) invoice.status = status;
  if (companyId !== undefined) invoice.companyId = companyId;
  if (dealId !== undefined) invoice.dealId = dealId || null;
  if (subtotal !== undefined && !Array.isArray(items)) invoice.subtotal = Number(subtotal) || 0;
  if (tax !== undefined && tax !== "" && tax !== null) invoice.tax = Number(tax) || 0;

  if (total !== undefined) invoice.total = Number(total) || 0;
  else invoice.total = invoice.subtotal + invoice.tax;

  if (invoice.status === "PAID" && !invoice.paidAt) invoice.paidAt = new Date();
  if (invoice.status !== "PAID") delete invoice.paidAt;

  if (!invoice.number) {
    return res.status(400).json({ success: false, message: "Invoice number required" });
  }

  invoice.updatedAt = new Date();
  saveDb();
  res.json({ success: true, data: invoice });
});

app.delete("/api/invoices/:id", (req, res) => {
  const invoice = db.invoices.get(req.params.id);
  if (!invoice) {
    return res.status(404).json({ success: false, message: "Invoice not found" });
  }
  db.invoices.delete(req.params.id);
  saveDb();
  res.json({ success: true, data: { id: req.params.id } });
});

// ==========================================
// FULL CRUD — ACTIVITIES
// ==========================================

app.get("/api/activities/:id", (req, res) => {
  const activity = db.activities.get(req.params.id);
  if (!activity) {
    return res.status(404).json({ success: false, message: "Activity not found" });
  }
  res.json({ success: true, data: activity });
});

app.patch("/api/activities/:id", (req, res) => {
  const activity = db.activities.get(req.params.id);
  if (!activity) {
    return res.status(404).json({ success: false, message: "Activity not found" });
  }
  const { type, title, description, relatedTo, companyId, dealId, durationMinutes, outcome, date, contactId } = req.body;

  if (companyId && !db.companies.has(companyId)) {
    return res.status(404).json({ success: false, message: "Company not found" });
  }

  if (type !== undefined) activity.type = type;
  if (title !== undefined) activity.title = title;
  if (description !== undefined) activity.description = description;
  if (relatedTo !== undefined) activity.relatedTo = relatedTo;
  if (companyId !== undefined) activity.companyId = companyId || null;
  if (dealId !== undefined) activity.dealId = dealId || null;
  if (contactId !== undefined) activity.contactId = contactId || null;
  if (durationMinutes !== undefined) activity.durationMinutes = durationMinutes;
  if (outcome !== undefined) activity.outcome = outcome;
  if (date !== undefined) activity.date = date;

  if (!activity.type || !activity.title) {
    return res.status(400).json({ success: false, message: "Type and title required" });
  }

  activity.updatedAt = new Date();
  saveDb();
  res.json({ success: true, data: activity });
});

app.delete("/api/activities/:id", (req, res) => {
  const activity = db.activities.get(req.params.id);
  if (!activity) {
    return res.status(404).json({ success: false, message: "Activity not found" });
  }
  db.activities.delete(req.params.id);
  saveDb();
  res.json({ success: true, data: { id: req.params.id } });
});

// ==========================================
// REPORTS ROUTE
// ==========================================

app.get("/api/reports/sales", (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const inRange = (v) => {
    if (!v) return true;
    const d = new Date(v);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const companyId = req.query.companyId || null;
  const allDeals = Array.from(db.deals.values()).filter((d) => inRange(d.createdAt) && (!companyId || d.companyId === companyId));
  const allInvoices = Array.from(db.invoices.values()).filter((inv) => inRange(inv.createdAt) && (!companyId || inv.companyId === companyId));

  const totalPipeline = allDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const wonDeals = allDeals.filter((d) => d.stage === "WINNING");
  const totalWon = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const totalLost = allDeals.filter((d) => d.stage === "LOST")
    .reduce((sum, d) => sum + (d.value || 0), 0);
  const totalInvoiced = allInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = allInvoices.filter((inv) => inv.status === "PAID")
    .reduce((sum, inv) => sum + (inv.total || 0), 0);

  // Deals by stage
  const byStage = {};
  allDeals.forEach((d) => {
    if (!byStage[d.stage]) byStage[d.stage] = { count: 0, value: 0 };
    byStage[d.stage].count++;
    byStage[d.stage].value += d.value || 0;
  });

  res.json({
    success: true,
    data: {
      summary: {
        totalPipeline: totalPipeline,
        totalWon,
        totalLost,
        totalInvoiced,
        totalPaid,
        outstanding: totalInvoiced - totalPaid,
      },
      byStage,
      totalDeals: allDeals.length,
      totalInvoices: allInvoices.length,
    },
  });
});

// Pipeline funnel: one row per stage in pipeline order
app.get("/api/reports/funnel", (req, res) => {
  const stages = getSettings().stages;
  const companyId = req.query.companyId || null;
  const all = Array.from(db.deals.values()).filter((d) => !companyId || d.companyId === companyId);
  const data = stages.map((s) => {
    const deals = all.filter((d) => d.stage === s.id);
    return {
      stage: s.id,
      label: s.label,
      count: deals.length,
      value: deals.reduce((sum, d) => sum + (d.value || 0), 0),
      color: s.color,
    };
  });
  res.json({ success: true, data });
});

// Conversion & win-rate summary
app.get("/api/reports/conversion", (req, res) => {
  const companyId = req.query.companyId || null;
  const all = Array.from(db.deals.values()).filter((d) => !companyId || d.companyId === companyId);
  const won = all.filter((d) => d.stage === "WINNING");
  const lost = all.filter((d) => d.stage === "LOST");
  const open = all.filter((d) => d.stage !== "WINNING" && d.stage !== "LOST");
  const decided = won.length + lost.length;
  res.json({
    success: true,
    data: {
      total: all.length,
      open: open.length,
      won: won.length,
      lost: lost.length,
      winRate: decided > 0 ? Math.round((won.length / decided) * 100) : 0,
      avgWonValue: won.length ? Math.round(won.reduce((s, d) => s + (d.value || 0), 0) / won.length) : 0,
      openPipelineValue: open.reduce((s, d) => s + (d.value || 0), 0),
    },
  });
});

// Monthly trend: won deals + invoices paid/total, grouped by calendar month (last 6)
app.get("/api/reports/monthly", (req, res) => {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
      wonValue: 0,
      invoicedValue: 0,
      paidValue: 0,
    });
  }
  const bucket = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const companyId = req.query.companyId || null;
  Array.from(db.deals.values()).filter((d) => !companyId || d.companyId === companyId).forEach((d) => {
    if (d.stage === "WINNING") {
      const k = bucket(d.updatedAt || d.createdAt);
      const m = months.find((x) => x.key === k);
      if (m) m.wonValue += d.value || 0;
    }
  });
  Array.from(db.invoices.values()).filter((inv) => !companyId || inv.companyId === companyId).forEach((inv) => {
    const k = bucket(inv.createdAt);
    const m = months.find((x) => x.key === k);
    if (m) {
      m.invoicedValue += inv.total || 0;
      if (inv.status === "PAID") m.paidValue += inv.total || 0;
    }
  });
  res.json({ success: true, data: months });
});

// Per-vendor performance (matches deals' assignedTo user id).
// Returns one row per user with deal counts and won/open values.
app.get("/api/reports/vendors", (req, res) => {
  const companyId = req.query.companyId || null;
  const byUser = {};
  for (const u of db.users.values()) {
    byUser[u.id] = {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      totalDeals: 0,
      wonDeals: 0,
      lostDeals: 0,
      openDeals: 0,
      wonValue: 0,
      openValue: 0,
    };
  }
  for (const d of db.deals.values()) {
    if (companyId && d.companyId !== companyId) continue;
    const key = d.assignedTo && byUser[d.assignedTo] ? d.assignedTo : "_unassigned";
    byUser[key] = byUser[key] || { userId: "_unassigned", name: "Sin asignar", email: "", role: "", totalDeals: 0, wonDeals: 0, lostDeals: 0, openDeals: 0, wonValue: 0, openValue: 0 };
    const row = byUser[key];
    row.totalDeals++;
    if (d.stage === "WINNING") {
      row.wonDeals++;
      row.wonValue += d.value || 0;
    } else if (d.stage === "LOST") {
      row.lostDeals++;
    } else {
      row.openDeals++;
      row.openValue += d.value || 0;
    }
  }
  const data = Object.values(byUser)
    .map((r) => ({ ...r, winRate: r.wonDeals + r.lostDeals > 0 ? Math.round((r.wonDeals / (r.wonDeals + r.lostDeals)) * 100) : 0 }))
    .filter((r) => r.totalDeals > 0)
    .sort((a, b) => b.wonValue - a.wonValue);
  res.json({ success: true, data });
});

// Top companies by open pipeline + historic won revenue
app.get("/api/reports/top-companies", (req, res) => {
  const byCompany = {};
  Array.from(db.companies.values()).forEach((c) => {
    byCompany[c.id] = { id: c.id, name: c.name, open: 0, won: 0, openDeals: 0 };
  });
  Array.from(db.deals.values()).forEach((d) => {
    const entry = byCompany[d.companyId];
    if (!entry) return;
    if (d.stage === "WINNING") entry.won += d.value || 0;
    else if (d.stage !== "LOST") {
      entry.open += d.value || 0;
      entry.openDeals++;
    }
  });
  const data = Object.values(byCompany)
    .filter((c) => c.open > 0 || c.won > 0)
    .sort((a, b) => b.open + b.won - (a.open + a.won))
    .slice(0, 10);
  res.json({ success: true, data });
});

// Notifications
app.get("/api/notifications", authRequired, (req, res) => {
  const all = Array.from(db.notifications.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const unreadCount = all.filter((n) => !n.read).length;
  res.json({ success: true, data: all, unreadCount });
});

app.post("/api/notifications/:id/read", authRequired, (req, res) => {
  const notice = db.notifications.get(req.params.id);
  if (!notice) return res.status(404).json({ success: false, message: "Notificación no encontrada" });
  notice.read = true;
  saveDb();
  res.json({ success: true });
});

app.post("/api/notifications/read-all", authRequired, (req, res) => {
  Array.from(db.notifications.values()).forEach((n) => (n.read = true));
  saveDb();
  res.json({ success: true });
});

// ==========================================
// MESSAGING — test connections
// ==========================================
// Both are admin-only and rate limited: they open outbound connections to a
// host the admin typed in, so they must not be usable by any signed-in vendor.

const messagingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos. Espera unos minutos." },
});

/** Proves the SMTP credentials work without sending anything to a customer. */
app.post("/api/settings/smtp/test", authRequired, requireAdmin, messagingLimiter, async (req, res) => {
  try {
    const result = await smtp.test(getSettings());
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** Proves the WhatsApp provider credentials work without messaging anyone. */
app.post("/api/settings/whatsapp/test", authRequired, requireAdmin, messagingLimiter, async (req, res) => {
  try {
    const result = await whatsapp.test(whatsapp.normalize(getSettings()));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: whatsapp.friendlyError(err) });
  }
});

// ==========================================
// INVOICE PDF + SENDING
// ==========================================

/**
 * Builds (or rebuilds) the PDF for an invoice.
 * The rendered customer fields are snapshotted onto the invoice so the document
 * keeps the address it was issued to, even if the company record changes later.
 */
app.post("/api/invoices/:id/pdf", authRequired, async (req, res) => {
  try {
    const invoice = db.invoices.get(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Factura no encontrada" });

    const file = await buildInvoicePdf(invoice);
    res.json({ success: true, data: { fileName: file.fileName, filePath: file.filePath } });
  } catch (err) {
    console.error("PDF generation failed:", err);
    res.status(500).json({ success: false, message: `No se pudo generar el PDF: ${err.message}` });
  }
});

/** Streams a previously generated PDF to the browser. */
app.get("/api/invoices/:id/pdf", authRequired, (req, res) => {
  const invoice = db.invoices.get(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, message: "Factura no encontrada" });
  const filePath = path.join(invoicePdf.INVOICE_DIR, `${String(invoice.number || invoice.id).replace(/[^\w.-]/g, "_")}.pdf`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "El PDF todavía no fue generado" });
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="factura-${invoice.number}.pdf"`);
  fs.createReadStream(filePath).pipe(res);
});

/**
 * Sends an invoice to a customer by email or WhatsApp.
 *
 * Body: { channel, to, subject, message, attachPdf }
 * Records the delivery on the invoice so "sent" invoices can be filtered later.
 */
app.post("/api/invoices/:id/send", authRequired, messagingLimiter, async (req, res) => {
  try {
    const invoice = db.invoices.get(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Factura no encontrada" });

    const { channel, to, subject, message, attachPdf } = req.body || {};
    if (!["email", "whatsapp"].includes(channel)) {
      return res.status(400).json({ success: false, message: "Canal inválido: usá «email» o «whatsapp»" });
    }
    if (!to || !String(to).trim()) {
      return res.status(400).json({ success: false, message: "Falta el destinatario" });
    }

    const settings = getSettings();
    let attachmentPath = null;
    let attachmentName = null;
    let contactPhone = null;

    // The contact's phone is the best WhatsApp destination, so resolve it once
    // and default to it when the client did not type a number.
    if (channel === "whatsapp") {
      const deal = invoice.dealId ? db.deals.get(invoice.dealId) : null;
      contactPhone = deal && deal.contactId ? (db.contacts.get(deal.contactId) || {}).phone : null;
    }

    if (attachPdf) {
      const file = await buildInvoicePdf(invoice);
      attachmentPath = file.filePath;
      attachmentName = file.fileName;
    }

    const subjectLine =
      subject || `Factura ${invoice.number} · ${settings.companyName}`;
    const bodyText =
      message ||
      `Hola,\n\nTe adjuntamos la factura ${invoice.number} por ${invoice.total} ${invoice.currency}.\n\nSaludos,\n${settings.companyName}`;

    const result =
      channel === "email"
        ? await smtp.send(settings, {
            to: String(to).trim(),
            subject: subjectLine,
            body: bodyText,
            attachments: attachmentPath
              ? [{ filename: attachmentName, path: attachmentPath, contentType: "application/pdf" }]
              : [],
          })
        : await whatsapp.send(whatsapp.normalize(settings), {
            to: String(to).trim(),
            body: bodyText,
            attachmentPath,
            attachmentName,
            publicUrl: settings.publicUrl,
          });

    // Track the delivery so the team can follow up on what was already sent.
    invoice.sentAt = new Date();
    invoice.sentVia = channel;
    invoice.sentTo = String(to).trim();
    if (channel === "email" && invoice.status === "DRAFT") invoice.status = "SENT";
    saveDb();

    res.json({ success: true, data: { channel, to: String(to).trim(), ...result } });
  } catch (err) {
    console.error("Send failed:", err);
    res.status(400).json({ success: false, message: whatsapp.friendlyError(err) });
  }
});

// Start server — run one-shot data migrations before accepting traffic.
async function boot() {
  // Reconnect to the database chosen through /install, when there is one.
  // A failure here must never take the API down: the app keeps serving from
  // the JSON snapshot so the admin can still reach the installer.
  try {
    const configured = await install.openConfigured();
    if (configured) {
      hydrateFrom(configured.snapshot);
      persistence = configured.persistence;
      console.log(`🗄️  Database connected: ${configured.provider}`);
    } else {
      console.log("🗄️  No database configured yet — open /install to set one up");
    }
  } catch (err) {
    console.error("⚠️  Could not connect to the configured database:", err.message);
  }

  await migratePlaintextPasswords();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`🚀 CRM Backend running on http://localhost:${PORT}`);
    console.log(`🔐 Auth: bcrypt + HS256 JWT (ttl ${JWT_ACCESS_TTL}), rate-limited login`);
  });
}

boot().catch((err) => {
  console.error("Fatal during boot:", err);
  process.exit(1);
});

// A production API should not die silently on a bug in one route.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

module.exports = app;