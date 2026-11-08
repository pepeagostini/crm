import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";
import { Field, Input, Select } from "../components/Form";
import {
  currencyExact,
  date as fmtDate,
  toDateInput,
  INVOICE_STATUSES,
  invoiceStatusLabel,
  invoiceStatusBadge,
} from "../lib/format";

const todayISO = () => toDateInput(new Date());
const plusDays = (n: number) => toDateInput(new Date(Date.now() + n * 86400000));

const emptyForm = {
  number: "",
  companyId: "",
  dealId: "",
  date: todayISO(),
  dueDate: plusDays(30),
  subtotal: "",
  tax: "",
  currency: "USD",
  status: "DRAFT",
};

export const InvoicesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [invoices, setInvoices] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<Array<{ description: string; quantity: string; unitPrice: string }>>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<any>(null);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const [invRes, compRes, dealRes]: any[] = await Promise.all([
        api.get("invoices"),
        api.get("companies"),
        api.get("deals"),
      ]);
      setInvoices(invRes.data || []);
      setCompanies(compRes.data || []);
      setDeals(dealRes.data || []);
    } catch (e: any) {
      setLoadError(e.message || "No se pudieron cargar las facturas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    const isNew = searchParams.get("new");

    if (isNew) {
      setEditing(null);
      setForm({
        ...emptyForm,
        number: nextNumber(invoices),
        companyId: searchParams.get("companyId") || "",
        dealId: searchParams.get("dealId") || "",
      });
      setItems([]);
      setFormError("");
      setModalOpen(true);
    } else if (editId) {
      const found = invoices.find((i) => i.id === editId);
      if (found) {
        setEditing(found);
        setForm({
          number: found.number || "",
          companyId: found.companyId || "",
          dealId: found.dealId || "",
          date: toDateInput(found.date),
          dueDate: toDateInput(found.dueDate),
          subtotal: String(found.subtotal ?? ""),
          tax: String(found.tax ?? ""),
          currency: found.currency || "USD",
          status: found.status || "DRAFT",
        });
        setFormError("");
        setModalOpen(true);
      }
    } else {
      setModalOpen(false);
    }
  }, [searchParams, invoices]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
    const next = new URLSearchParams(searchParams);
    ["new", "edit", "companyId", "dealId"].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  const set = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const itemsSubtotal = Number(
    items
      .map((it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))
      .reduce((a, b) => a + b, 0)
  );

  const subtotalNum = items.length > 0 ? itemsSubtotal : (Number(form.subtotal) || 0);
  const taxNum = items.length > 0
    ? Math.round((subtotalNum * 21) / 100 * 100) / 100
    : (Number(form.tax) || 0);
  const totalNum = subtotalNum + taxNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.number.trim()) return setFormError("El número de factura es obligatorio");
    if (!form.companyId) return setFormError("Selecciona una empresa");

    setSaving(true);
    try {
      const payload = {
        ...form,
        subtotal: subtotalNum,
        tax: taxNum,
        total: totalNum,
        dealId: form.dealId || null,
        items: items.filter((it) => it.description.trim()).length > 0 ? items : undefined,
      };

      if (editing) {
        const res: any = await api.patch(`invoices/${editing.id}`, payload);
        setInvoices((list) => list.map((i) => (i.id === editing.id ? res.data : i)));
      } else {
        const res: any = await api.post("invoices", payload);
        setInvoices((list) => [res.data, ...list]);
      }
      closeModal();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar la factura");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (invoice: any, status: string) => {
    try {
      const res: any = await api.patch(`invoices/${invoice.id}/status`, { status });
      setInvoices((list) => list.map((i) => (i.id === invoice.id ? res.data : i)));
    } catch (err: any) {
      setLoadError(err.message || "No se pudo actualizar el estado");
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`invoices/${toDelete.id}`);
      setInvoices((list) => list.filter((i) => i.id !== toDelete.id));
      setToDelete(null);
    } catch (err: any) {
      setLoadError(err.message || "No se pudo eliminar");
      setToDelete(null);
    }
  };

  const companyName = (id?: string) => companies.find((c) => c.id === id)?.name || "—";

  const filtered = invoices.filter((i) => {
    const matchStatus = statusFilter === "ALL" || i.status === statusFilter;
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      i.number?.toLowerCase().includes(q) ||
      companyName(i.companyId).toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const totalInvoiced = filtered.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = filtered
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + (i.total || 0), 0);

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <div>
            <p className="text-xs text-slate-500">Facturas</p>
            <p className="text-xl font-semibold text-slate-900">{invoices.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total facturado</p>
            <p className="text-xl font-semibold text-slate-900">{currencyExact(totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Cobrado</p>
            <p className="text-xl font-semibold text-emerald-600">{currencyExact(totalPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pendiente</p>
            <p className="text-xl font-semibold text-amber-600">
              {currencyExact(totalInvoiced - totalPaid)}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.set("new", "1");
            setSearchParams(next);
          }}
        >
          + Nueva factura
        </Button>
      </div>

      {loadError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-3" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={load} className="underline shrink-0">Reintentar</button>
        </div>
      )}

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="inv-search" className="sr-only">Buscar facturas</label>
          <Input
            id="inv-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número o empresa…"
          />
        </div>
        <div className="sm:w-52">
          <label htmlFor="inv-status" className="sr-only">Filtrar por estado</label>
          <Select id="inv-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Todos los estados</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>{invoiceStatusLabel[s]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="card p-4">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : (
          <Table
            data={filtered}
            columns={[
              { key: "number", label: "Número" },
              { key: "companyId", label: "Empresa" },
              { key: "total", label: "Total", align: "right" },
              { key: "status", label: "Estado" },
              { key: "dueDate", label: "Vencimiento" },
            ]}
            renderCell={(item, key) => {
              if (key === "number")
                return <span className="font-medium text-slate-900">{item.number}</span>;
              if (key === "companyId") {
                const name = companyName(item.companyId);
                return name === "—" ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(`/companies/${item.companyId}`)}
                    className="text-primary-600 hover:underline text-left"
                  >
                    {name}
                  </button>
                );
              }
              if (key === "total")
                return <span className="tabular-nums">{currencyExact(item.total, item.currency)}</span>;
              if (key === "status")
                return (
                  <span className={`badge ${invoiceStatusBadge[item.status] || "badge-neutral"}`}>
                    {invoiceStatusLabel[item.status] || item.status}
                  </span>
                );
              if (key === "dueDate") {
                const overdue =
                  item.status !== "PAID" && item.dueDate && new Date(item.dueDate) < new Date();
                return (
                  <span className={overdue ? "text-red-600 font-medium" : undefined}>
                    {fmtDate(item.dueDate)}
                  </span>
                );
              }
              return undefined;
            }}
            actions={[
              { label: "Ver", onClick: (i) => navigate(`/invoices/${i.id}`), variant: "secondary" },
              {
                label: "Marcar pagada",
                onClick: (i) => changeStatus(i, "PAID"),
                variant: "outline",
                showCondition: (i) => i.status !== "PAID",
              },
              {
                label: "Editar",
                onClick: (i) => {
                  const next = new URLSearchParams(searchParams);
                  next.set("edit", i.id);
                  setSearchParams(next);
                },
                variant: "outline",
              },
              { label: "Eliminar", onClick: (i) => setToDelete(i), variant: "destructive" },
            ]}
            emptyMessage={
              search || statusFilter !== "ALL"
                ? "Ninguna factura coincide con los filtros"
                : "Aún no hay facturas. Crea la primera con «+ Nueva factura»."
            }
          />
        )}
      </div>

      {/* Create / edit */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar factura" : "Nueva factura"}
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} type="button">Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit as any} type="button" disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear factura"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Número"
              htmlFor="i-number"
              required
              error={formError && !form.number.trim() ? "Obligatorio" : ""}
            >
              <Input
                id="i-number"
                value={form.number}
                onChange={set("number")}
                placeholder="F-2026-001"
                invalid={!!formError && !form.number.trim()}
              />
            </Field>
            <Field
              label="Empresa"
              htmlFor="i-company"
              required
              error={formError && !form.companyId ? "Selecciona una empresa" : ""}
            >
              <Select
                id="i-company"
                value={form.companyId}
                onChange={set("companyId")}
                invalid={!!formError && !form.companyId}
              >
                <option value="">— Seleccionar —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Fecha emisión" htmlFor="i-date">
              <Input id="i-date" type="date" value={form.date} onChange={set("date")} />
            </Field>
            <Field label="Vencimiento" htmlFor="i-due">
              <Input id="i-due" type="date" value={form.dueDate} onChange={set("dueDate")} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Base" htmlFor="i-sub">
              <Input id="i-sub" type="number" min="0" step="0.01" value={form.subtotal} onChange={set("subtotal")} placeholder="0.00" />
            </Field>
            <Field label="Impuesto" htmlFor="i-tax">
              <Input id="i-tax" type="number" min="0" step="0.01" value={form.tax} onChange={set("tax")} placeholder="0.00" />
            </Field>
            <Field label="Total" htmlFor="i-total" hint="Calculado">
              <Input id="i-total" value={totalNum.toFixed(2)} readOnly className="bg-slate-50 text-slate-600" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Moneda" htmlFor="i-cur">
              <Select id="i-cur" value={form.currency} onChange={set("currency")}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="MXN">MXN</option>
                <option value="ARS">ARS</option>
                <option value="COP">COP</option>
                <option value="CLP">CLP</option>
                <option value="PEN">PEN</option>
                <option value="VES">VES</option>
                <option value="UYU">UYU</option>
                <option value="BOB">BOB</option>
                <option value="DOP">DOP</option>
                <option value="GTQ">GTQ</option>
                <option value="HNL">HNL</option>
                <option value="NIO">NIO</option>
                <option value="CRC">CRC</option>
                <option value="PAB">PAB</option>
              </Select>
            </Field>
            <Field label="Estado" htmlFor="i-status">
              <Select id="i-status" value={form.status} onChange={set("status")}>
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>{invoiceStatusLabel[s]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Oportunidad" htmlFor="i-deal" hint="Opcional">
              <Select id="i-deal" value={form.dealId} onChange={set("dealId")}>
                <option value="">— Ninguna —</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          {items.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Servicios / Conceptos</h4>
              <div className="space-y-2" id="items-list">
                {items.map((it, idx) => (
                  <div key={idx} className="flex gap-3 items-baseline">
                    <Input
                      type="text"
                      value={it.description}
                      onChange={(e) =>
                        setItems((fs) =>
                          fs.map((f, i) => (i === idx ? { ...f, description: e.target.value } : f))
                        )
                      }
                      placeholder="Descripción del servicio"
                      className="flex-1 min-w-0"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.25"
                      value={it.quantity}
                      onChange={(e) =>
                        setItems((fs) =>
                          fs.map((f, i) => (i === idx ? { ...f, quantity: e.target.value } : f))
                        )
                      }
                      className="w-24"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) =>
                        setItems((fs) =>
                          fs.map((f, i) =>
                            i === idx ? { ...f, unitPrice: e.target.value } : f)
                        )
                      }
                      className="w-32"
                    />
                    <span className="text-sm text-slate-500">
                      {Number(it.quantity || 0) * Number(it.unitPrice || 0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems((fs) => fs.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:underline text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {items.length < 5 && (
                  <button
                    type="button"
                    onClick={() =>
                      setItems((fs) =>
                        fs.concat({
                          description: "",
                          quantity: "1",
                          unitPrice: "",
                        })
                      )
                    }
                    className="text-sm text-primary-600 hover:underline"
                  >
                    + Añadir línea
                  </button>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal servicios</span>
                  <span>{Number(
                    items
                      .map((it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))
                      .reduce((a, b) => a + b, 0)
                  ).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Impuesto</span>
                  <span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.tax}
                      onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))}
                      className="w-24"
                    />
                  </span>
                </div>
                <div className="flex justify-between text-sm font-medium text-slate-900">
                  <span>Total</span>
                  <span>
                    {Number(
                      items
                        .map((it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))
                        .reduce((a, b) => a + b, 0) +
                      (Number(form.tax) || 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Servicios / Conceptos</h4>
              <p className="text-sm text-slate-500">
                Agrega líneas de servicios para desglosar los conceptos de la factura.
              </p>
            </div>
          )}

          {items.length > 0 && (
            <input
              type="hidden"
              id="i-subtotal"
              name="subtotal"
              value={Number(
                items
                  .map((it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))
                  .reduce((a, b) => a + b, 0)
              ).toFixed(2)}
            />
          )}

          {items.length === 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Base" htmlFor="i-sub">
                <Input
                  id="i-sub"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subtotal}
                  onChange={set("subtotal")}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Impuesto" htmlFor="i-tax">
                <Input
                  id="i-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.tax}
                  onChange={set("tax")}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Total" htmlFor="i-total" hint="Calculado">
                <Input
                  id="i-total"
                  value={totalNum.toFixed(2)}
                  readOnly
                  className="bg-slate-50 text-slate-600"
                />
              </Field>
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Base" htmlFor="i-sub" hint="Calculado desde las líneas">
                <Input
                  id="i-sub"
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly
                  value={Number(
                    items
                      .map((it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))
                      .reduce((a, b) => a + b, 0)
                  ).toFixed(2)}
                />
              </Field>
              <Field label="Impuesto" htmlFor="i-tax">
                <Input
                  id="i-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.tax}
                  onChange={set("tax")}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Total" htmlFor="i-total" hint="Calculado">
                <Input
                  id="i-total"
                  value={totalNum.toFixed(2)}
                  readOnly
                  className="bg-slate-50 text-slate-600"
                />
              </Field>
            </div>
          )}
        </form>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!toDelete}
        title="Eliminar factura"
        onClose={() => setToDelete(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)} type="button">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} type="button">Eliminar</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Vas a eliminar la factura <strong className="text-slate-900">{toDelete?.number}</strong>. Esta acción no
          se puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

/** F-YYYY-NNN based on the highest existing number. */
function nextNumber(list: any[]): string {
  const year = new Date().getFullYear();
  const max = list.reduce((acc, i) => {
    const m = /(\d+)$/.exec(i.number || "");
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `F-${year}-${String(max + 1).padStart(3, "0")}`;
}

export default InvoicesPage;
