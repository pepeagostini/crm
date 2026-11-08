/** Shared formatters + label maps so every module speaks the same language. */

export const currency = (value: number, code = "USD") =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export const currencyExact = (value: number, code = "USD") =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export const date = (value?: string | Date | null) =>
  value
    ? new Date(value).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const dateTime = (value?: string | Date | null) =>
  value
    ? new Date(value).toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** ISO yyyy-mm-dd for <input type="date"> values. */
export const toDateInput = (value?: string | Date | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---------- Deals ----------
// Static defaults — the live list lives in settings (useSettings). These are
// only the first-paint fallback before /api/settings resolves.
export const STAGES = [
  "PROSPECTING",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WINNING",
  "LOST",
] as const;

export const stageLabel: Record<string, string> = {
  PROSPECTING: "Prospección",
  QUALIFIED: "Calificado",
  PROPOSAL: "Propuesta",
  NEGOTIATION: "Negociación",
  WINNING: "Ganado",
  LOST: "Perdido",
};

export const stageProbability: Record<string, number> = {
  PROSPECTING: 10,
  QUALIFIED: 30,
  PROPOSAL: 50,
  NEGOTIATION: 70,
  WINNING: 90,
  LOST: 0,
};

/**
 * Badge class for a stage, derived from its probability so admin-created
 * stages still get a sensible colour without a per-stage lookup table.
 * Terminal stages keep their fixed semantics.
 */
export const stageBadgeFor = (stageId?: string | null, probability?: number): string => {
  if (stageId === "WINNING") return "badge-success";
  if (stageId === "LOST") return "badge-danger";
  const p = probability ?? 0;
  if (p >= 75) return "badge-success";
  if (p >= 45) return "badge-info";
  if (p >= 20) return "badge-warning";
  return "badge-neutral";
};

/** Kept for call sites that only have the id in scope. */
export const stageBadge: Record<string, string> = {
  PROSPECTING: "badge-neutral",
  QUALIFIED: "badge-info",
  PROPOSAL: "badge-info",
  NEGOTIATION: "badge-warning",
  WINNING: "badge-success",
  LOST: "badge-danger",
};

// ---------- Invoices ----------
export const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;

export const invoiceStatusLabel: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

export const invoiceStatusBadge: Record<string, string> = {
  DRAFT: "badge-neutral",
  SENT: "badge-info",
  PAID: "badge-success",
  OVERDUE: "badge-danger",
  CANCELLED: "badge-neutral",
};

// ---------- Activities ----------
export const ACTIVITY_TYPES = ["call", "email", "meeting", "note"] as const;

export const activityTypeLabel: Record<string, string> = {
  call: "Llamada",
  email: "Email",
  meeting: "Reunión",
  note: "Nota",
};

export const activityTypeBadge: Record<string, string> = {
  call: "badge-info",
  email: "badge-info",
  meeting: "badge-success",
  note: "badge-neutral",
};

export const outcomeLabel: Record<string, string> = {
  pending: "Pendiente",
  completed: "Completada",
  no_answer: "Sin respuesta",
  rescheduled: "Reprogramada",
  interested: "Interesado",
  not_interested: "No interesado",
};

/** Neutral badge class for a given outcome/status string. */
export const badgeFor = (value: string): string => {
  const map: Record<string, string> = {
    ACTIVE: "badge-success",
    INACTIVE: "badge-neutral",
    completed: "badge-success",
    interested: "badge-success",
    pending: "badge-warning",
    rescheduled: "badge-warning",
    no_answer: "badge-warning",
    not_interested: "badge-danger",
  };
  return map[value] || "badge-neutral";
};
