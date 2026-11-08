import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";
import { Field, Input, Select, Textarea } from "../components/Form";
import {
  currency,
  date as fmtDate,
  toDateInput,
} from "../lib/format";
import { useSettings } from "../hooks/useSettings";
import { DealsKanban } from "../components/DealsKanban";

const emptyForm = {
  name: "",
  value: "",
  stage: "PROSPECTING",
  closeDate: "",
  companyId: "",
  contactId: "",
  assignedTo: "",
  description: "",
};

export const DealsPage: React.FC = () => {
  const { user } = useAuth();
  const { stages, stageLabel, stageBadge, stageProbability, stageIndex } = useSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [deals, setDeals] = useState<any[]>([]);
  const [view, setView] = useState<"table" | "board">("table");
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<any>(null);
  const [stageTarget, setStageTarget] = useState<any>(null);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const [dealsRes, companiesRes, contactsRes, usersRes]: any[] = await Promise.all([
        api.get("deals"),
        api.get("companies"),
        api.get("contacts"),
        api.get("users").catch(() => ({ data: [] })),
      ]);
      setDeals(dealsRes.data || []);
      setCompanies(companiesRes.data || []);
      setContacts(contactsRes.data || []);
      setUsers(usersRes.data || []);
    } catch (e: any) {
      setLoadError(e.message || "No se pudieron cargar las oportunidades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Modal driven by the URL (?new=1 / ?edit=<id>)
  useEffect(() => {
    const editId = searchParams.get("edit");
    const isNew = searchParams.get("new");

    if (isNew) {
      setEditing(null);
      const presetCompany = searchParams.get("companyId") || "";
      setForm({ ...emptyForm, companyId: presetCompany });
      setFormError("");
      setModalOpen(true);
    } else if (editId) {
      const found = deals.find((d) => d.id === editId);
      if (found) {
        setEditing(found);
        setForm({
          name: found.name || "",
          value: String(found.value ?? ""),
          stage: found.stage || "PROSPECTING",
          closeDate: toDateInput(found.closeDate),
          companyId: found.companyId || "",
          contactId: found.contactId || "",
          assignedTo: found.assignedTo || "",
          description: found.description || "",
        });
        setFormError("");
        setModalOpen(true);
      }
    } else {
      setModalOpen(false);
    }
  }, [searchParams, deals]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("edit");
    next.delete("companyId");
    setSearchParams(next, { replace: true });
  };

  const set = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }

    const payload = {
      ...form,
      value: Number(form.value) || 0,
      closeDate: form.closeDate || null,
      companyId: form.companyId || null,
      contactId: form.contactId || null,
      assignedTo: form.assignedTo || null,
    };

    setSaving(true);
    try {
      if (editing) {
        const res: any = await api.patch(`deals/${editing.id}`, payload);
        setDeals((list) => list.map((d) => (d.id === editing.id ? res.data : d)));
      } else {
        const res: any = await api.post("deals", payload);
        setDeals((list) => [res.data, ...list]);
      }
      closeModal();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar la oportunidad");
    } finally {
      setSaving(false);
    }
  };

  const handleStageChange = async (deal: any, stage: string) => {
    try {
      const res: any = await api.patch(`deals/${deal.id}/status`, { stage });
      setDeals((list) => list.map((d) => (d.id === deal.id ? res.data : d)));
    } catch (err: any) {
      setLoadError(err.message || "No se pudo cambiar la etapa");
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`deals/${toDelete.id}`);
      setDeals((list) => list.filter((d) => d.id !== toDelete.id));
      setToDelete(null);
    } catch (err: any) {
      setLoadError(err.message || "No se pudo eliminar");
      setToDelete(null);
    }
  };

  const companyName = (companyId?: string | null) =>
    companies.find((c) => c.id === companyId)?.name || "—";

  const filtered = deals.filter((d) => {
    const matchStage = stageFilter === "ALL" || d.stage === stageFilter;
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      d.name?.toLowerCase().includes(q) ||
      companyName(d.companyId).toLowerCase().includes(q);
    return matchStage && matchSearch;
  });

  const totalValue = filtered.reduce((s, d) => s + (d.value || 0), 0);
  const weighted = filtered.reduce(
    (s, d) => s + (d.value || 0) * ((d.probability || stageProbability(d.stage) || 0) / 100),
    0
  );

  if (!user) return null;

  return (
    <div className="space-y-5">
      {/* Header + KPIs */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <div>
            <p className="text-xs text-slate-500">Oportunidades</p>
            <p className="text-xl font-semibold text-slate-900">{deals.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Valor filtrado</p>
            <p className="text-xl font-semibold text-slate-900">{currency(totalValue)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Ponderado</p>
            <p className="text-xl font-semibold text-slate-900">{currency(weighted)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Ganadas</p>
            <p className="text-xl font-semibold text-emerald-600">
              {deals.filter((d) => d.stage === "WINNING").length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden" role="group" aria-label="Cambiar vista">
            <button type="button" onClick={() => setView("table")} className={`px-3 py-1.5 text-sm font-medium ${view === "table" ? "bg-primary-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Lista</button>
            <button type="button" onClick={() => setView("board")} className={`px-3 py-1.5 text-sm font-medium ${view === "board" ? "bg-primary-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Tablero</button>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("new", "1");
              setSearchParams(next);
            }}
          >
            + Nueva oportunidad
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-3" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={load} className="underline shrink-0">Reintentar</button>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="deal-search" className="sr-only">Buscar oportunidades</label>
          <Input
            id="deal-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o empresa…"
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor="deal-stage" className="sr-only">Filtrar por etapa</label>
          <Select id="deal-stage" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="ALL">Todas las etapas</option>
            {stages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-4">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : view === "board" ? (
          <DealsKanban
            deals={filtered}
            companyName={companyName}
            onMove={(dealId, stage, probability) =>
              setDeals((list) =>
                list.map((d) => (d.id === dealId ? { ...d, stage, probability: probability ?? stageProbability(stage) ?? 0 } : d))
              )
            }
          />
        ) : (
          <Table
            data={filtered}
            columns={[
              { key: "name", label: "Oportunidad" },
              { key: "companyId", label: "Empresa" },
              { key: "value", label: "Valor", align: "right" },
              { key: "probability", label: "Prob." },
              { key: "stage", label: "Etapa" },
              { key: "closeDate", label: "Cierre" },
            ]}
            renderCell={(item, key) => {
              if (key === "name")
                return (
                  <span className="font-medium text-slate-900">{item.name}</span>
                );
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
              if (key === "value") return currency(item.value, item.currency);
              if (key === "probability")
                return <span className="tabular-nums">{item.probability ?? 0}%</span>;
              if (key === "stage")
                return (
                  <span className={`badge ${stageBadge(item.stage)}`}>
                    {stageLabel(item.stage)}
                  </span>
                );
              if (key === "closeDate") return fmtDate(item.closeDate);
              return undefined;
            }}
            actions={[
              { label: "Ver", onClick: (i) => navigate(`/deals/${i.id}`), variant: "secondary" },
              {
                label: "Etapa",
                onClick: (i) => setStageTarget(i),
                variant: "outline",
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
              search || stageFilter !== "ALL"
                ? "Ninguna oportunidad coincide con los filtros"
                : "Tu pipeline está vacía. Crea la primera oportunidad."
            }
          />
        )}
      </div>

      {/* Create / edit */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar oportunidad" : "Nueva oportunidad"}
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} type="button">Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit as any} type="button" disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear oportunidad"}
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

          <Field
            label="Nombre"
            htmlFor="d-name"
            required
            error={formError && !form.name.trim() ? "El nombre es obligatorio" : ""}
          >
            <Input
              id="d-name"
              value={form.name}
              onChange={set("name")}
              placeholder="Ej: Renovación anual"
              invalid={!!formError && !form.name.trim()}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Valor" htmlFor="d-value" hint="Sin decimales">
              <Input
                id="d-value"
                type="number"
                min="0"
                step="1"
                value={form.value}
                onChange={set("value")}
                placeholder="0"
              />
            </Field>
            <Field label="Etapa" htmlFor="d-stage">
              <Select id="d-stage" value={form.stage} onChange={set("stage")}>
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label} · {st.probability}%
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Empresa" htmlFor="d-company">
              <Select id="d-company" value={form.companyId} onChange={set("companyId")}>
                <option value="">— Sin empresa —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contacto" htmlFor="d-contact">
              <Select id="d-contact" value={form.contactId} onChange={set("contactId")}>
                <option value="">— Sin contacto —</option>
                {contacts
                  .filter((c) => !form.companyId || c.companyId === form.companyId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Vendedor asignado" htmlFor="d-vendor">
              <Select id="d-vendor" value={form.assignedTo} onChange={set("assignedTo")}>
                <option value="">— Sin asignar —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha de cierre" htmlFor="d-close">
              <Input id="d-close" type="date" value={form.closeDate} onChange={set("closeDate")} />
            </Field>
          </div>

          <Field label="Descripción" htmlFor="d-desc">
            <Textarea
              id="d-desc"
              value={form.description}
              onChange={set("description")}
              placeholder="Contexto, siguiente paso, quién decide…"
            />
          </Field>
        </form>
      </Modal>

      {/* Quick stage change */}
      <Modal
        open={!!stageTarget}
        title={stageTarget ? `Etapa — ${stageTarget.name}` : "Cambiar etapa"}
        onClose={() => setStageTarget(null)}
        size="sm"
      >
        <div className="space-y-2">
          {stages.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                if (stageTarget) handleStageChange(stageTarget, st.id);
                setStageTarget(null);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                stageTarget?.stage === st.id
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span className="font-medium text-sm">{st.label}</span>
              <span className="text-xs text-slate-500">{st.probability}%</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!toDelete}
        title="Eliminar oportunidad"
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
          Vas a eliminar <strong className="text-slate-900">{toDelete?.name}</strong>. Esta acción no se puede
          deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default DealsPage;
