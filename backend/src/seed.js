/**
 * Seeds demo data so the CRM isn't empty on first run.
 * Idempotent: exits immediately if companies already exist.
 *
 *   node src/seed.js
 */
const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "db.json");

let db;
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
} catch (e) {
  console.error("No se pudo leer db.json:", e.message);
  process.exit(1);
}

db.companies = db.companies || {};
db.deals = db.deals || {};
db.invoices = db.invoices || {};
db.activities = db.activities || {};
db.users = db.users || {};

if (Object.keys(db.companies).length > 0) {
  console.log("La base ya tiene datos — no se siembra nada.");
  process.exit(0);
}

let n = Number(db.idCounter) || 1;
const id = () => `id_${n++}`;

const days = (d) => new Date(Date.now() + d * 86400000).toISOString();

// ---------- Companies ----------
const companies = [
  {
    id: id(), name: "Acme Retail S.L.", industry: "Retail", email: "contacto@acmeretail.es",
    phone: "+34 910 223 344", address: "Calle Gran Vía 28, Madrid",
    description: "Cadena de tiendas con 14 puntos de venta. Decisión de compra en dirección comercial.",
    status: "ACTIVE", createdAt: days(-46),
  },
  {
    id: id(), name: "Nortech Solutions", industry: "Tecnología", email: "hola@nortech.io",
    phone: "+34 933 118 902", address: "Av. Diagonal 402, Barcelona",
    description: "Software house especializada en ERP. Potencial para 40 licencias.",
    status: "ACTIVE", createdAt: days(-38),
  },
  {
    id: id(), name: "Clínica Sanitas Valladolid", industry: "Salud", email: "admin@sanitas-vall.es",
    phone: "+34 983 445 120", address: "Calle Sagasta 19, Valladolid",
    description: "Grupo de 3 clínicas. Necesitan facturación electrónica integrada.",
    status: "ACTIVE", createdAt: days(-31),
  },
  {
    id: id(), name: "Grupo Alimentario DelSur", industry: "Alimentación", email: "compras@delsur.com",
    phone: "+34 954 220 771", address: "Polígono Cartuja, Sevilla",
    description: "Distribuidor regional. Renovación anual en marzo.",
    status: "ACTIVE", createdAt: days(-25),
  },
  {
    id: id(), name: "Estudio Vega & Asociados", industry: "Servicios", email: "info@vegaasociados.es",
    phone: "+34 963 559 018", address: "Calle Colón 44, Valencia",
    description: "Bufete de 12 personas. Buscaban alternativa al software actual.",
    status: "ACTIVE", createdAt: days(-19),
  },
  {
    id: id(), name: "Logística Mena", industry: "Transporte", email: "operaciones@menalog.es",
    phone: "+34 944 102 335", address: "Zona industrial Galindo, Bilbao",
    description: "Flota de 30 camiones. Cuenta en fase de descubrimiento.",
    status: "ACTIVE", createdAt: days(-12),
  },
  {
    id: id(), name: "Bistró Manzana", industry: "Hostelería", email: "reservas@bistromanzana.com",
    phone: "+34 945 887 610", address: "Calle Estación 7, Logroño",
    description: "Restaurante con dos locales. Cliente pequeño con recurrencia.",
    status: "INACTIVE", createdAt: days(-60),
  },
];
companies.forEach((c) => (db.companies[c.id] = c));

const byName = Object.fromEntries(companies.map((c) => [c.name, c.id]));

// ---------- Deals ----------
const stages = ["PROSPECTING", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WINNING", "LOST"];
const prob = { PROSPECTING: 10, QUALIFIED: 30, PROPOSAL: 50, NEGOTIATION: 70, WINNING: 90, LOST: 0 };
const statusOf = (s) => (s === "WINNING" ? "WON" : s === "LOST" ? "LOST" : "ACTIVE");

const rawDeals = [
  ["Licencias CRM — 40 usuarios", "Nortech Solutions", 18400, "NEGOTIATION", 9, "Renovación de 40 licencias con soporte premium."],
  ["Implantación ERP retail", "Acme Retail S.L.", 32000, "PROPOSAL", 21, "Propuesta para 14 tiendas + almacén central."],
  ["Facturación electrónica", "Clínica Sanitas Valladolid", 9600, "QUALIFIED", 34, "Integración con sistema de historia clínica."],
  ["Renovación anual 2026", "Grupo Alimentario DelSur", 24000, "WINNING", -3, "Renovación cerrada, firma pendiente de contador."],
  ["Sustitución de software", "Estudio Vega & Asociados", 7200, "PROPOSAL", 15, "Migración desde la competencia, 12 usuarios."],
  ["Piloto gestión de flota", "Logística Mena", 5400, "PROSPECTING", 45, "Piloto de 3 meses con 5 vehículos."],
  ["Módulo compras", "Acme Retail S.L.", 11800, "QUALIFIED", 28, "Ampliación sobre la implantación principal."],
  ["Soporte y mantenimiento", "Nortech Solutions", 4800, "PROSPECTING", 60, "Contrato anual de soporte."],
  ["Portal de clientes", "Clínica Sanitas Valladolid", 15200, "LOST", 0, "Perdido: presupuesto congelado hasta 2027."],
  ["Formación de equipo", "Estudio Vega & Asociados", 2400, "WINNING", -7, "2 sesiones de formación pagadas."],
  ["App de reservas", "Bistró Manzana", 3200, "LOST", 0, "Perdido: cerraron el segundo local."],
  ["Integración tienda online", "Grupo Alimentario DelSur", 13500, "PROSPECTING", 40, "Conectar stock con la web B2B."],
];

const deals = rawDeals.map(([name, companyName, value, stage, close, desc]) => ({
  id: id(),
  name,
  description: desc,
  value,
  currency: "USD",
  stage,
  probability: prob[stage],
  status: statusOf(stage),
  closeDate: days(close),
  companyId: byName[companyName],
  createdAt: days(-20),
}));
deals.forEach((d) => (db.deals[d.id] = d));

const dealBy = (name) => deals.find((d) => d.name === name);

// ---------- Invoices ----------
const rawInvoices = [
  ["F-2026-001", "Grupo Alimentario DelSur", 24000, "PAID", -34, -4, "Renovación anual"],
  ["F-2026-002", "Estudio Vega & Asociados", 2400, "PAID", -12, 18, "Formación de equipo"],
  ["F-2026-003", "Nortech Solutions", 4800, "SENT", -5, 25, "Soporte trimestral"],
  ["F-2026-004", "Acme Retail S.L.", 6000, "SENT", -2, 28, "Fase 1 implantación"],
  ["F-2026-005", "Clínica Sanitas Valladolid", 3200, "OVERDUE", -60, -30, "Licencias 2025"],
  ["F-2026-006", "Logística Mena", 1800, "DRAFT", -1, 29, "Piloto inicial"],
];

const invoices = rawInvoices.map(([number, companyName, total, status, issued, due, concept]) => {
  const subtotal = Math.round(total / 1.21 * 100) / 100;
  const tax = Math.round((total - subtotal) * 100) / 100;
  return {
    id: id(),
    number,
    concept,
    date: days(issued),
    dueDate: days(due),
    subtotal,
    tax,
    total,
    currency: "USD",
    status,
    companyId: byName[companyName],
    createdAt: days(issued),
    ...(status === "PAID" ? { paidAt: days(due + 5) } : {}),
  };
});
invoices.forEach((i) => (db.invoices[i.id] = i));

// ---------- Activities ----------
const rawActivities = [
  ["call", "Llamada de descubrimiento", "Nortech Solutions", "completed", -8, 35, "Reunión con el CTO. Interesados en SSO y API.", "Licencias CRM — 40 usuarios"],
  ["meeting", "Demostración del producto", "Acme Retail S.L.", "interested", -6, 60, "Demo a dirección comercial. Preguntaron por el módulo de almacén.", "Implantación ERP retail"],
  ["email", "Envío de propuesta", "Estudio Vega & Asociados", "completed", -4, 0, "Propuesta con dos opciones de precio y plan de migración.", "Sustitución de software"],
  ["call", "Seguimiento comercial", "Logística Mena", "no_answer", -3, 5, "Sin respuesta. Reprogramar para la semana que viene.", "Piloto gestión de flota"],
  ["note", "Presupuesto congelado", "Clínica Sanitas Valladolid", "not_interested", -5, 0, "Dirección financiera ha congelado toda inversión hasta 2027.", "Portal de clientes"],
  ["meeting", "Revisión de contrato", "Grupo Alimentario DelSur", "completed", -2, 45, "Ajustada la cláusula de penalización. Listo para firma.", "Renovación anual 2026"],
  ["call", "Primer contacto", "Bistró Manzana", "completed", -20, 12, "Cliente pequeño, presupuesto muy ajustado.", "App de reservas"],
  ["email", "Recordatorio de pago", "Clínica Sanitas Valladolid", "pending", -1, 0, "Factura F-2026-005 vencida hace 30 días.", null],
  ["call", "Cierre de formación", "Estudio Vega & Asociados", "completed", -1, 20, "Ambas sesiones validadas. Cliente satisfecho.", "Formación de equipo"],
  ["meeting", "Presentación piloto", "Logística Mena", "rescheduled", 4, 45, "Reprogramada por indisponibilidad del director de operaciones.", "Piloto gestión de flota"],
];

const activities = rawActivities.map(([type, title, companyName, outcome, when, mins, desc, dealName]) => ({
  id: id(),
  type,
  title,
  description: desc,
  relatedTo: "note",
  relatedId: null,
  companyId: byName[companyName],
  ...(dealName ? { dealId: dealBy(dealName)?.id } : {}),
  date: days(when),
  durationMinutes: mins || null,
  outcome,
}));
activities.forEach((a) => (db.activities[a.id] = a));

// ---------- Contacts ----------
db.contacts = db.contacts || {};
const rawContacts = [
  ["Ana Gómez", "ana.gomez@acmeretail.es", "+34 910 224 012", "Gerente comercial", "Primer punto de contacto para renovaciones.", "Acme Retail S.L."],
  ["Luis Fernández", "l.fernandez@nortech.io", "+34 933 118 910", "CTO", "Evaluación técnica de licencias.", "Nortech Solutions"],
  ["Marta Ruiz", "marta.ruiz@sanitas-vall.es", "+34 983 445 121", "Administración", "Centraliza facturación de las 3 clínicas.", "Clínica Sanitas Valladolid"],
  ["Jorge Serrano", "jserrano@delsur.com", "+34 954 220 773", "Compras", "Renovación anual en marzo.", "Grupo Alimentario DelSur"],
  ["Elena Torres", "elena.torres@acmeretail.es", "+34 910 224 018", "Compras", "Consolida pedidos de las 14 tiendas.", "Acme Retail S.L."],
  ["Pablo Navarro", "p.navarro@nortech.io", "+34 933 118 922", "CTO", "Revisor técnico principal.", "Nortech Solutions"],
  ["Carmen Vidal", "carmen.vidal@sanitas-vall.es", "+34 983 445 118", "Dirección", "Decisora de la integración.", "Clínica Sanitas Valladolid"],
  ["Raúl Ortega", "r.ortega@delsur.com", "+34 954 220 776", "Logística", "Coordina entregas regionales.", "Grupo Alimentario DelSur"],
];
rawContacts.forEach(([name, email, phone, role, notes, companyName]) => {
  const c = { id: id(), name, email, phone, role, notes, companyId: byName[companyName], createdAt: days(-14) };
  db.contacts[c.id] = c;
});

// ---------- Tasks ----------
db.tasks = db.tasks || {};
const rawTasks = [
  ["Llamar a Acme Retail para confirmar renovación", "medium", "pending", "Acme Retail S.L.", -1],
  ["Enviar presupuesto a Nortech", "high", "pending", "Nortech Solutions", 0],
  ["Revisar contrato Sanitas", "low", "pending", "Clínica Sanitas Valladolid", -2],
  ["Agendar demo con DelSur", "medium", "pending", "Grupo Alimentario DelSur", 3],
  ["Seguimiento factura F-2026-005 vencida", "high", "pending", "Clínica Sanitas Valladolid", 2],
  ["Preparar presentación logística", "low", "done", null, null],
];
rawTasks.forEach(([title, priority, status, companyName, dueOffset]) => {
  const t = {
    id: id(),
    title,
    description: "",
    dueDate: dueOffset != null ? days(dueOffset).slice(0, 10) : null,
    priority,
    status,
    assignedTo: null,
    companyId: companyName ? byName[companyName] : null,
    createdAt: days(-3),
  };
  db.tasks[t.id] = t;
});

db.idCounter = n;

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log(`✅ Sembrados: ${companies.length} empresas, ${deals.length} oportunidades, ${invoices.length} facturas, ${activities.length} actividades, ${Object.keys(db.contacts).length} contactos`);
