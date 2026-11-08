/**
 * Provider registry for the quick-install module.
 *
 * Every provider exposes the same contract so the installer never needs to
 * branch on the database engine:
 *
 *   label         Human readable name shown in the wizard
 *   needsServer   true when the admin must supply host/user/password
 *   fields        Credential descriptors used to render the wizard form
 *   buildUrl(cfg) Turns credentials into a connection string
 *   test(cfg)     Proves the credentials work WITHOUT creating anything
 *   create(cfg)   Creates the database/schema if it does not exist yet
 *   connect()     Opens the connection and returns a handle
 *   loadAll()     Reads every collection back into plain objects
 *   persist(snap) Mirrors the whole in-memory snapshot into the database
 *   close()       Releases the connection
 *
 * Only the drivers that are actually needed are required lazily, so a SQLite
 * install works on a machine that never installed `pg` or `mongodb`.
 */

const path = require("path");
const fs = require("fs");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const SQLITE_FILE = path.join(BACKEND_ROOT, "src", "db.sqlite");

/** Collections persisted to the relational/document database, in FK-safe order. */
const COLLECTIONS = [
  "users",
  "companies",
  "contacts",
  "deals",
  "invoices",
  "activities",
  "tasks",
  "notifications",
];

/**
 * Logical schema. `columns` become real columns (indexed/unique) while the
 * full record is stored as a JSON payload, which keeps the migration tolerant
 * of the free-form fields the CRM already has (invoice items, settings, ...).
 */
const SCHEMA = {
  users: {
    columns: [
      ["email", "text", { unique: true }],
      ["role", "text"],
      ["active", "bool"],
    ],
  },
  companies: {
    columns: [
      ["name", "text"],
      ["industry", "text"],
    ],
  },
  contacts: {
    columns: [
      ["name", "text"],
      ["email", "text"],
      ["companyId", "text", { index: true }],
    ],
  },
  deals: {
    columns: [
      ["name", "text"],
      ["stage", "text", { index: true }],
      ["status", "text"],
      ["companyId", "text", { index: true }],
      ["contactId", "text"],
      ["assignedTo", "text", { index: true }],
      ["value", "number"],
      ["closeDate", "text"],
      ["createdAt", "datetime"],
    ],
  },
  invoices: {
    columns: [
      // Not unique on purpose: legacy stores may contain duplicated numbers
      // and a failed migration is worse than a duplicated index entry.
      ["number", "text", { index: true }],
      ["status", "text", { index: true }],
      ["companyId", "text", { index: true }],
      ["dealId", "text"],
      ["total", "number"],
      ["date", "datetime"],
      ["dueDate", "datetime"],
      ["createdAt", "datetime"],
    ],
  },
  activities: {
    columns: [
      ["type", "text", { index: true }],
      ["title", "text"],
      ["companyId", "text", { index: true }],
      ["contactId", "text"],
      ["dealId", "text"],
      ["createdAt", "datetime"],
    ],
  },
  tasks: {
    columns: [
      ["title", "text"],
      ["status", "text", { index: true }],
      ["priority", "text"],
      ["assignedTo", "text", { index: true }],
      ["companyId", "text", { index: true }],
      ["dueDate", "text"],
      ["createdAt", "datetime"],
    ],
  },
  notifications: {
    columns: [
      ["type", "text", { index: true }],
      ["title", "text"],
      ["read", "bool"],
      ["createdAt", "datetime"],
    ],
  },
};

// ---------------------------------------------------------------------------
// SQL dialect helpers
// ---------------------------------------------------------------------------

/** Maps a logical type to the concrete type of each SQL dialect. */
const SQL_TYPES = {
  sqlite: { text: "TEXT", number: "REAL", bool: "INTEGER", datetime: "TEXT", json: "TEXT" },
  postgresql: { text: "TEXT", number: "NUMERIC(14,2)", bool: "BOOLEAN", datetime: "TIMESTAMPTZ", json: "JSONB" },
  mysql: { text: "VARCHAR(255)", number: "DECIMAL(14,2)", bool: "TINYINT(1)", datetime: "DATETIME", json: "JSON" },
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(dialect, name) {
  if (!IDENT.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return dialect === "mysql" ? `\`${name}\`` : `"${name}"`;
}

function quoteValue(dialect, value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Converts an ISO/Date string into the value the dialect expects. */
function toSqlValue(dialect, type, value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (type === "bool") {
    // Drivers bind booleans differently: Postgres wants a real boolean,
    // SQLite and MySQL want 0/1 numbers. Strings are rejected outright.
    const truthy =
      value === true || value === 1 || value === "1" || value === "true" || value === "TRUE";
    if (dialect === "postgresql") return truthy;
    return truthy ? 1 : 0;
  }
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === "datetime") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return String(value);
}

/**
 * Emits the DDL for one collection. `IF NOT EXISTS` everywhere so the installer
 * can be re-run against an existing database without destroying data.
 */
function buildCreateTable(dialect, table) {
  const spec = SCHEMA[table];
  const types = SQL_TYPES[dialect];
  // SQLite requires table-level constraints to come after every column, so
  // UNIQUE is emitted as its own index instead of inline.
  const parts = [
    `${quoteIdent(dialect, "id")} ${types.text} PRIMARY KEY`,
    // The original in-memory map key, needed to rebuild the Maps faithfully.
    `${quoteIdent(dialect, "map_key")} ${types.text}`,
  ];
  for (const [name, type] of spec.columns) {
    parts.push(`${quoteIdent(dialect, name)} ${types[type]}`);
  }
  parts.push(`${quoteIdent(dialect, "data")} ${types.json}`);
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(dialect, table)} (\n  ${parts.join(",\n  ")}\n)`;
}

function buildCreateIndexes(dialect, table) {
  const spec = SCHEMA[table];
  const indexes = spec.columns
    .filter(([, , opts]) => opts && opts.index)
    .map(
      ([name]) =>
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(dialect, `idx_${table}_${name}`)} ON ${quoteIdent(dialect, table)} (${quoteIdent(dialect, name)})`
    );
  const unique = spec.columns
    .filter(([, , opts]) => opts && opts.unique)
    .map(
      ([name]) =>
        `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(dialect, `uq_${table}_${name}`)} ON ${quoteIdent(dialect, table)} (${quoteIdent(dialect, name)})`
    );
  return [...indexes, ...unique];
}

function buildSettingsTable(dialect) {
  const types = SQL_TYPES[dialect];
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(dialect, "settings")} (\n  ${quoteIdent(dialect, "key")} ${types.text} PRIMARY KEY,\n  ${quoteIdent(dialect, "value")} ${types.json}\n)`;
}

/**
 * Builds the `INSERT ... ON CONFLICT` statement used to mirror a record.
 *
 * `mapKey` is stored separately because a record's map key is not always its
 * `id`: the seeded admin is keyed by its email address. Without this column the
 * key would be lost on reload and `db.users.get(email)` would come back empty.
 */
function buildUpsert(dialect, table, record, mapKey) {
  const spec = SCHEMA[table];
  const names = ["id"];
  const values = [record.id];
  names.push("data");
  values.push(JSON.stringify(record));
  names.push("map_key");
  values.push(mapKey === undefined || mapKey === null ? String(record.id) : String(mapKey));
  for (const [name, type] of spec.columns) {
    names.push(name);
    values.push(toSqlValue(dialect, type, record[name]));
  }
  const cols = names.map((n) => quoteIdent(dialect, n)).join(", ");
  const placeholders = names.map(() => "?").join(", ");
  const conflict =
    dialect === "mysql"
      ? `ON DUPLICATE KEY UPDATE ${spec.columns.map(([n]) => `${quoteIdent(dialect, n)} = VALUES(${quoteIdent(dialect, n)})`).join(", ")}, ${quoteIdent(dialect, "data")} = VALUES(${quoteIdent(dialect, "data")})`
      : `ON CONFLICT (${quoteIdent(dialect, "id")}) DO UPDATE SET ${names
          .filter((n) => n !== "id")
          .map((n) => `${quoteIdent(dialect, n)} = EXCLUDED.${quoteIdent(dialect, n)}`)
          .join(", ")}`;
  return { sql: `INSERT INTO ${quoteIdent(dialect, table)} (${cols}) VALUES (${placeholders}) ${conflict}`, values };
}

/**
 * Generic SQL persistence engine shared by SQLite, PostgreSQL and MySQL.
 * `driver` only has to provide `execute(sql, params)`, `all(sql, params)` and
 * `close()`, which keeps this file free of engine-specific branching.
 */
function makeSqlPersistence(dialect, driver) {
  return {
    async loadAll() {
      const snapshot = { idCounter: 1 };
      for (const table of COLLECTIONS) {
        // map_key restores the original key (the admin is keyed by email);
        // older rows without it fall back to the record id.
        const rows = await driver.all(
          `SELECT ${quoteIdent(dialect, "map_key")}, ${quoteIdent(dialect, "data")} FROM ${quoteIdent(dialect, table)}`
        );
        const map = {};
        for (const row of rows) {
          let parsed;
          try {
            parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
          } catch {
            continue;
          }
          if (!parsed || !parsed.id) continue;
          map[row.map_key || parsed.id] = parsed;
        }
        snapshot[table] = map;
      }
      try {
        const rows = await driver.all(`SELECT ${quoteIdent(dialect, "key")}, ${quoteIdent(dialect, "value")} FROM ${quoteIdent(dialect, "settings")}`);
        const settings = {};
        for (const row of rows) {
          try {
            settings[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          } catch {
            settings[row.key] = row.value;
          }
        }
        if (Object.keys(settings).length) snapshot.settings = settings;
      } catch {
        /* settings table is optional */
      }
      return snapshot;
    },

    async persist(snapshot) {
      // A single malformed record must not abort the whole write: the failures
      // are collected and reported instead.
      const failures = [];
      for (const table of COLLECTIONS) {
        const records = snapshot[table] || {};
        for (const [mapKey, record] of Object.entries(records)) {
          if (!record || !record.id) continue;
          try {
            const { sql, values } = buildUpsert(dialect, table, record, mapKey);
            await driver.execute(sql, values);
          } catch (err) {
            failures.push({ collection: table, id: record.id, error: err.message });
          }
        }
      }
      const settings = snapshot.settings || {};
      for (const [key, value] of Object.entries(settings)) {
        const cols = `${quoteIdent(dialect, "key")}, ${quoteIdent(dialect, "value")}`;
        const conflict =
          dialect === "mysql"
            ? `ON DUPLICATE KEY UPDATE ${quoteIdent(dialect, "value")} = VALUES(${quoteIdent(dialect, "value")})`
            : `ON CONFLICT (${quoteIdent(dialect, "key")}) DO UPDATE SET ${quoteIdent(dialect, "value")} = EXCLUDED.${quoteIdent(dialect, "value")}`;
        try {
          await driver.execute(
            `INSERT INTO ${quoteIdent(dialect, "settings")} (${cols}) VALUES (?, ?) ${conflict}`,
            [key, JSON.stringify(value)]
          );
        } catch (err) {
          failures.push({ collection: "settings", id: key, error: err.message });
        }
      }
      return { failures };
    },

    async ensureSchema() {
      for (const table of COLLECTIONS) {
        await driver.execute(buildCreateTable(dialect, table));
        for (const stmt of buildCreateIndexes(dialect, table)) {
          try {
            await driver.execute(stmt);
          } catch {
            /* index already exists */
          }
        }
      }
      await driver.execute(buildSettingsTable(dialect));
    },

    async close() {
      if (driver && typeof driver.close === "function") await driver.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * SQLite — the zero-configuration default. Uses the built-in `node:sqlite`
 * module, so a fresh install needs no database server and no npm driver.
 */
const sqliteProvider = {
  id: "sqlite",
  label: "SQLite (recomendado para empezar)",
  description: "Archivo local, sin servidor ni credenciales. Ideal para un CRM de un solo equipo.",
  needsServer: false,
  fields: [
    { key: "file", label: "Archivo de la base de datos", type: "text", default: SQLITE_FILE, hint: "Ruta donde se guardará el archivo .sqlite" },
  ],

  buildUrl(cfg) {
    return `file:${cfg.file || SQLITE_FILE}`;
  },

  async test(cfg) {
    const { DatabaseSync } = require("node:sqlite");
    const file = cfg.file || SQLITE_FILE;
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    const probe = new DatabaseSync(file);
    probe.exec("CREATE TABLE IF NOT EXISTS _probe (id INTEGER)");
    probe.exec("DROP TABLE _probe");
    probe.close();
    return { ok: true, detail: `Archivo accessible en ${file}` };
  },

  async create(cfg) {
    const { DatabaseSync } = require("node:sqlite");
    const file = cfg.file || SQLITE_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const handle = new DatabaseSync(file);
    handle.exec("PRAGMA journal_mode = WAL");
    handle.exec("PRAGMA foreign_keys = ON");
    return {
      url: `file:${file}`,
      driver: {
        execute: (sql, params = []) => handle.prepare(sql).run(...params),
        all: (sql, params = []) => handle.prepare(sql).all(...params),
        close: () => handle.close(),
      },
    };
  },
};

/** PostgreSQL — recommended for production. */
const postgresProvider = {
  id: "postgresql",
  label: "PostgreSQL",
  description: "Relacional, ideal para producción. Gratis en Neon o Supabase.",
  needsServer: true,
  fields: [
    { key: "host", label: "Host", type: "text", default: "localhost", placeholder: "ep-xxx.neon.tech" },
    { key: "port", label: "Puerto", type: "number", default: 5432 },
    { key: "user", label: "Usuario", type: "text", default: "postgres" },
    { key: "password", label: "Contraseña", type: "password" },
    { key: "database", label: "Base de datos", type: "text", default: "crm" },
    { key: "ssl", label: "Usar SSL", type: "boolean", default: false, hint: "Actívalo para Neon, Supabase oRailway" },
  ],

  buildUrl(cfg) {
    const ssl = cfg.ssl ? "?sslmode=require" : "";
    return `postgresql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@${cfg.host}:${cfg.port || 5432}/${cfg.database}${ssl}`;
  },

  /** Connects to the maintenance database so a missing database can be created. */
  async maintenanceClient(cfg) {
    const { Client } = require("pg");
    const ssl = cfg.ssl ? { rejectUnauthorized: false } : undefined;
    const client = new Client({
      host: cfg.host,
      port: Number(cfg.port) || 5432,
      user: cfg.user,
      password: cfg.password,
      database: "postgres",
      ssl,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    return client;
  },

  async test(cfg) {
    const client = await this.maintenanceClient(cfg);
    try {
      const res = await client.query("SELECT version()");
      const version = String(res.rows[0].version).split(" ").slice(0, 2).join(" ");
      return { ok: true, detail: `Conexión lista · PostgreSQL ${version}` };
    } finally {
      await client.end();
    }
  },

  async create(cfg) {
    const client = await this.maintenanceClient(cfg);
    try {
      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [cfg.database]);
      if (exists.rowCount === 0) {
        // Identifier cannot be parameterised; the wizard already validates it.
        if (!IDENT.test(cfg.database)) throw new Error("Nombre de base de datos inválido");
        await client.query(`CREATE DATABASE "${cfg.database}"`);
      }
    } finally {
      await client.end();
    }
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: this.buildUrl(cfg),
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    await pool.query("SELECT 1");
    return {
      url: this.buildUrl(cfg),
      driver: {
        execute: async (sql, params = []) => {
          await pool.query(sql, params);
        },
        all: async (sql, params = []) => (await pool.query(sql, params)).rows,
        close: () => pool.end(),
      },
    };
  },
};

/** MySQL / MariaDB. */
const mysqlProvider = {
  id: "mysql",
  label: "MySQL / MariaDB",
  description: "Para quien ya tiene un servidor MySQL en su empresa u hosting.",
  needsServer: true,
  fields: [
    { key: "host", label: "Host", type: "text", default: "localhost" },
    { key: "port", label: "Puerto", type: "number", default: 3306 },
    { key: "user", label: "Usuario", type: "text", default: "root" },
    { key: "password", label: "Contraseña", type: "password" },
    { key: "database", label: "Base de datos", type: "text", default: "crm" },
  ],

  buildUrl(cfg) {
    return `mysql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@${cfg.host}:${cfg.port || 3306}/${cfg.database}`;
  },

  async connect(cfg, database) {
    const mysql = require("mysql2/promise");
    return mysql.createConnection({
      host: cfg.host,
      port: Number(cfg.port) || 3306,
      user: cfg.user,
      password: cfg.password,
      database,
      connectTimeout: 10000,
    });
  },

  async test(cfg) {
    const conn = await this.connect(cfg, undefined);
    try {
      const [rows] = await conn.query("SELECT VERSION() AS v");
      return { ok: true, detail: `Conexión lista · ${rows[0].v}` };
    } finally {
      await conn.end();
    }
  },

  async create(cfg) {
    if (!IDENT.test(cfg.database)) throw new Error("Nombre de base de datos inválido");
    const conn = await this.connect(cfg, undefined);
    try {
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await conn.end();
    }
    const conn2 = await this.connect(cfg, cfg.database);
    return {
      url: this.buildUrl(cfg),
      driver: {
        execute: async (sql, params = []) => {
          await conn2.query(sql, params);
        },
        all: async (sql, params = []) => {
          const [rows] = await conn2.query(sql, params);
          return Array.isArray(rows) ? rows : [];
        },
        close: () => conn2.end(),
      },
    };
  },
};

/** MongoDB — document store for teams already standardised on it. */
const mongodbProvider = {
  id: "mongodb",
  label: "MongoDB",
  description: "Almacén de documentos, útil si ya trabajas con MongoDB.",
  needsServer: true,
  fields: [
    { key: "host", label: "Host", type: "text", default: "localhost" },
    { key: "port", label: "Puerto", type: "number", default: 27017 },
    { key: "user", label: "Usuario", type: "text", hint: "Vacío si no requiere autenticación" },
    { key: "password", label: "Contraseña", type: "password" },
    { key: "database", label: "Base de datos", type: "text", default: "crm" },
  ],

  buildUrl(cfg) {
    const auth =
      cfg.user && cfg.password
        ? `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}@`
        : "";
    return `mongodb://${auth}${cfg.host}:${cfg.port || 27017}/${cfg.database}`;
  },

  async test(cfg) {
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(this.buildUrl(cfg), { serverSelectionTimeoutMS: 10000 });
    try {
      await client.connect();
      const info = await client.db("admin").command({ buildInfo: 1 });
      return { ok: true, detail: `Conexión lista · MongoDB ${info.version}` };
    } finally {
      await client.close();
    }
  },

  async create(cfg) {
    if (!IDENT.test(cfg.database)) throw new Error("Nombre de base de datos inválido");
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(this.buildUrl(cfg), { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    return { url: this.buildUrl(cfg), client, driver: { close: () => client.close() } };
  },

  async loadAllFor(client, database) {
    const db = client.db(database);
    const snapshot = { idCounter: 1 };
    for (const table of COLLECTIONS) {
      const docs = await db.collection(table).find({}).toArray();
      const map = {};
      for (const doc of docs) {
        const { _id, mapKey, ...rest } = doc;
        map[String(mapKey || _id)] = rest;
      }
      snapshot[table] = map;
    }
    const settingsDocs = await db.collection("settings").find({}).toArray();
    if (settingsDocs.length) {
      snapshot.settings = Object.fromEntries(settingsDocs.map((d) => [d.key, d.value]));
    }
    return snapshot;
  },

  async persistFor(client, database, snapshot) {
    const db = client.db(database);
    for (const table of COLLECTIONS) {
      const col = db.collection(table);
      for (const [mapKey, record] of Object.entries(snapshot[table] || {})) {
        if (!record || !record.id) continue;
        await col.replaceOne({ _id: record.id }, { ...record, mapKey }, { upsert: true });
      }
    }
    const settingsCol = db.collection("settings");
    for (const [key, value] of Object.entries(snapshot.settings || {})) {
      await settingsCol.replaceOne({ key }, { key, value }, { upsert: true });
    }
  },
};

const PROVIDERS = {
  sqlite: sqliteProvider,
  postgresql: postgresProvider,
  mysql: mysqlProvider,
  mongodb: mongodbProvider,
};

/** Public, credential-free description of every provider for the wizard UI. */
function describeProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    needsServer: p.needsServer,
    fields: p.fields,
  }));
}

function getProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Base de datos no soportada: ${id}`);
  return provider;
}

/** Builds the persistence engine for a provider + already-created connection. */
function makePersistence(providerId, created) {
  if (providerId === "mongodb") {
    const database = providerId && created.url.split("/").pop();
    return {
      loadAll: () => mongodbProvider.loadAllFor(created.client, database),
      persist: (snap) => mongodbProvider.persistFor(created.client, database, snap),
      ensureSchema: async () => {
        for (const table of COLLECTIONS) await created.client.db(database).createCollection(table).catch(() => {});
        await created.client.db(database).createCollection("settings").catch(() => {});
      },
      close: () => created.driver.close(),
    };
  }
  const dialect = providerId === "postgresql" ? "postgresql" : providerId === "mysql" ? "mysql" : "sqlite";
  return makeSqlPersistence(dialect, created.driver);
}

module.exports = {
  PROVIDERS,
  COLLECTIONS,
  SCHEMA,
  SQLITE_FILE,
  describeProviders,
  getProvider,
  makePersistence,
  buildCreateTable,
  buildSettingsTable,
};