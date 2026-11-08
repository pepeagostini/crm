import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSettings } from "../hooks/useSettings";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { PageHeader, Panel } from "../components/Page";
import { DetailRow, Field, Input, Textarea } from "../components/Form";
import {
  currencyExact,
  date as fmtDate,
  dateTime,
  INVOICE_STATUSES,
  invoiceStatusLabel,
  invoiceStatusBadge,
} from "../lib/format";

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sending
  const [sendOpen, setSendOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [sendTo, setSendTo] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendOk, setSendOk] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const inv: any = await api.get(`invoices/${id}`).catch(() => null);
      if (!inv || !inv.data) {
        setError("Esta factura ya no existe o fue eliminada.");
        setInvoice(null);
        return;
      }
      setInvoice(inv.data);

      const extras = await Promise.all([
        inv.data.companyId ? api.get(`companies/${inv.data.companyId}`).catch(() => null) : null,
        inv.data.dealId ? api.get(`deals/${inv.data.dealId}`).catch(() => null) : null,
      ]);
      setCompany(extras[0]?.data || null);
      setDeal(extras[1]?.data || null);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar la factura");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
    else load();
  }, [user, load, navigate]);

  const changeStatus = async (status: string) => {
    if (!id) return;
    setBusy(true);
    try {
      const res: any = await api.patch(`invoices/${id}/status`, { status });
      setInvoice(res.data);
      setStatusOpen(false);
    } catch (e: any) {
      setError(e.message || "No se pudo actualizar el estado");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    try {
      await api.delete(`invoices/${id}`);
      navigate("/invoices", { replace: true });
    } catch (e: any) {
      setError(e.message || "No se pudo eliminar");
      setConfirmDelete(false);
    }
  };

  // ---- Sending ----

  /**
   * Opens the send dialog, prefilled with the recipient that makes sense for
   * the chosen channel (the company email, or the contact's phone).
   */
  const openSend = (as: "email" | "whatsapp") => {
    setChannel(as);
    setSendError("");
    setSendOk("");
    setAttachPdf(true);

    const contactPhone = deal?.contactId
      ? (deal.contactPhone || deal.phone || "")
      : "";
    const recipient =
      as === "email"
        ? company?.email || deal?.contactEmail || ""
        : contactPhone || company?.phone || "";

    setSendTo(recipient);
    setSendSubject(`Factura ${invoice?.number || ""}`.trim());
    setSendMessage(
      `Hola,\n\nTe enviamos la factura ${invoice?.number || ""} por ${currencyExact(
        invoice?.total ?? 0,
        invoice?.currency
      )}.\n\nSaludos,\n${settings.companyName}`
    );
    setSendOpen(true);
  };

  const doSend = async () => {
    if (!id) return;
    if (!sendTo.trim()) {
      setSendError("Escribí el destinatario");
      return;
    }
    setSending(true);
    setSendError("");
    setSendOk("");
    try {
      const res: any = await api.post(`invoices/${id}/send`, {
        channel,
        to: sendTo.trim(),
        subject: sendSubject.trim(),
        message: sendMessage,
        attachPdf,
      });
      setSendOk(
        channel === "email"
          ? `Factura enviada a ${res.data.to}`
          : `Factura enviada por WhatsApp a ${res.data.to}`
      );
      // Reflect the delivery stamp (sentAt/sentVia/status) on screen.
      await load();
      window.setTimeout(() => setSendOpen(false), 1400);
    } catch (e: any) {
      setSendError(e.message || "No se pudo enviar");
    } finally {
      setSending(false);
    }
  };

  const downloadPdf = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await api.post(`invoices/${id}/pdf`, {});
      // The stream endpoint needs the Authorization header, so the blob route
      // is used instead of a plain link.
      const res: any = await fetch(`/api/invoices/${id}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("crm_auth_token") || ""}` },
      });
      if (!res.ok) throw new Error("No se pudo descargar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `factura-${invoice?.number || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "No se pudo generar el PDF");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="card h-64" />
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600 mb-4">{error}</p>
        <Button variant="primary" onClick={() => navigate("/invoices")}>Volver a facturas</Button>
      </div>
    );
  }

  const isPaid = invoice.status === "PAID";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Factura ${invoice.number}`}
        backTo="/invoices"
        backLabel="Todas las facturas"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={`badge ${invoiceStatusBadge[invoice.status] || "badge-neutral"}`}>
              {invoiceStatusLabel[invoice.status] || invoice.status}
            </span>
            {company && (
              <>
                <span aria-hidden="true">·</span>
                <Link to={`/companies/${company.id}`} className="text-primary-600 hover:underline">
                  {company.name}
                </Link>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="primary" onClick={() => setStatusOpen(true)} disabled={busy}>
              Cambiar estado
            </Button>
            <Button variant="secondary" onClick={() => openSend("email")} disabled={busy}>
              Enviar por email
            </Button>
            <Button variant="secondary" onClick={() => openSend("whatsapp")} disabled={busy}>
              Enviar por WhatsApp
            </Button>
            <Button variant="outline" onClick={downloadPdf} disabled={busy}>
              {busy ? "Generando…" : "Descargar PDF"}
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/invoices?edit=${invoice.id}`)}>
              Editar
            </Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Eliminar
            </Button>
          </>
        }
      />

      {error && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-5 grid-cols-1 xl:grid-cols-3">
        {/* Totals */}
        <Panel title="Totales" className="xl:col-span-1">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Base imponible</span>
              <span className="tabular-nums text-slate-900">{currencyExact(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Impuesto</span>
              <span className="tabular-nums text-slate-900">{currencyExact(invoice.tax, invoice.currency)}</span>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="font-semibold text-slate-900">Total</span>
              <span className="text-xl font-semibold tabular-nums text-slate-900">
                {currencyExact(invoice.total, invoice.currency)}
              </span>
            </div>
            {isPaid && invoice.paidAt && (
              <p className="text-xs text-emerald-600 pt-1">Pagada el {fmtDate(invoice.paidAt)}</p>
            )}
          </div>
        </Panel>

        {/* Details */}
        <Panel title="Datos" className="xl:col-span-2">
          <dl>
            <DetailRow label="Número">{invoice.number}</DetailRow>
            <DetailRow label="Estado">{invoiceStatusLabel[invoice.status] || invoice.status}</DetailRow>
            <DetailRow label="Empresa">
              {company ? (
                <Link to={`/companies/${company.id}`} className="text-primary-600 hover:underline">
                  {company.name}
                </Link>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Oportunidad">
              {deal ? (
                <Link to={`/deals/${deal.id}`} className="text-primary-600 hover:underline">
                  {deal.name}
                </Link>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Emisión">{fmtDate(invoice.date)}</DetailRow>
            <DetailRow label="Vencimiento">
              {(() => {
                const overdue =
                  invoice.status !== "PAID" && invoice.dueDate && new Date(invoice.dueDate) < new Date();
                return (
                  <span className={overdue ? "text-red-600" : undefined}>
                    {fmtDate(invoice.dueDate)}
                    {overdue && " · vencida"}
                  </span>
                );
              })()}
            </DetailRow>
            <DetailRow label="Moneda">{invoice.currency}</DetailRow>
            <DetailRow label="Creada">{dateTime(invoice.createdAt)}</DetailRow>
          </dl>
        </Panel>
      </div>

      {/* Status modal */}
      <Modal open={statusOpen} title="Cambiar estado" onClose={() => !busy && setStatusOpen(false)} size="sm">
        <div className="space-y-2">
          {INVOICE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => changeStatus(s)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors disabled:opacity-60 flex items-center justify-between gap-3 ${
                invoice.status === s
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span className={`badge ${invoiceStatusBadge[s]}`}>{invoiceStatusLabel[s]}</span>
              {invoice.status === s && <span className="text-xs text-primary-600">Actual</span>}
            </button>
          ))}
        </div>
      </Modal>

      {/* Send by email / WhatsApp */}
      <Modal
        open={sendOpen}
        title={channel === "email" ? "Enviar factura por email" : "Enviar factura por WhatsApp"}
        onClose={() => setSendOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSendOpen(false)} type="button">
              Cerrar
            </Button>
            <Button variant="primary" onClick={doSend} type="button" disabled={sending || !!sendOk}>
              {sending ? "Enviando…" : sendOk ? "Enviado ✓" : "Enviar"}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            doSend();
          }}
          noValidate
        >
          {sendError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
              {sendError}
            </div>
          )}
          {sendOk && (
            <div
              className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
              role="status"
            >
              {sendOk}
            </div>
          )}

          <Field
            label={channel === "email" ? "Email del cliente" : "Teléfono con WhatsApp"}
            htmlFor="send-to"
            required
            hint={
              channel === "whatsapp"
                ? "Incluí el código de país, ej: +54 9 11 5555-1111"
                : undefined
            }
          >
            <Input
              id="send-to"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder={channel === "email" ? "compras@cliente.com" : "+54 9 11 5555-1111"}
            />
          </Field>

          {channel === "email" && (
            <Field label="Asunto" htmlFor="send-subject" required>
              <Input
                id="send-subject"
                value={sendSubject}
                onChange={(e) => setSendSubject(e.target.value)}
              />
            </Field>
          )}

          <Field label="Mensaje" htmlFor="send-msg">
            <Textarea
              id="send-msg"
              rows={5}
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
            />
          </Field>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              Adjuntar la factura en PDF
              {channel === "whatsapp" && settings.whatsapp?.mode === "cloud" && (
                <span className="block text-xs text-slate-500">
                  Con Cloud API el PDF se comparte como enlace (requiere la URL pública configurada).
                </span>
              )}
            </span>
          </label>

          <p className="text-xs text-slate-400">
            Al enviar, la factura queda registrada con la fecha y el canal de envío.
          </p>
        </form>
      </Modal>

      {/* Delete */}
      <Modal
        open={confirmDelete}
        title="Eliminar factura"
        onClose={() => setConfirmDelete(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} type="button">Cancelar</Button>
            <Button variant="destructive" onClick={remove} type="button">Eliminar</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Vas a eliminar la factura <strong className="text-slate-900">{invoice.number}</strong>. Esta acción no se
          puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default InvoiceDetailPage;
