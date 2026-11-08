import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";
import { Field, Input, Select, Textarea } from "../components/Form";
import {
  dateTime,
  ACTIVITY_TYPES,
  activityTypeLabel,
  activityTypeBadge,
} from "../lib/format";

const OUTCOMES = ["pending", "completed", "no_answer", "rescheduled", "interested", "not_interested"];
const outcomeLabel: Record<string, string> = {
  pending: "Pendiente",
  completed: "Completada",
  no_answer: "Sin respuesta",
  rescheduled: "Reprogramada",
  interested: "Interesado",
  not_interested: "No interesado",
};
const outcomeBadge: Record<string, string> = {
  pending: "badge-warning",
  completed: "badge-success",
  no_answer: "badge-warning",
  rescheduled: "badge-warning",
  interested: "badge-success",
  not_interested: "badge-danger",
};

const emptyForm = {
  type: "call",
  title: "",
  description: "",
  companyId: "",
  dealId: "",
  contactId: "",
  durationMinutes: "",
  outcome: "pending",
};

export const ActivitiesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activities, setActivities] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<any>(null);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const [actRes, compRes, dealRes, contactRes]: any[] = await Promise.all([
        api.get("activities"),
        api.get("companies"),
        api.get("deals"),
        api.get("contacts"),
      ]);
      setActivities(actRes.data || []);
      setCompanies(compRes.data || []);
      setDeals(dealRes.data || []);
      setContacts(contactRes.data || []);
    } catch (e: any) {
      setLoadError(e.message || "No se pudieron cargar las actividades");
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
        companyId: searchParams.get("companyId") || "",
        dealId: searchParams.get("dealId") || "",
      });
      setFormError("");
      setModalOpen(true);
    } else if (editId) {
      const found = activities.find((a) => a.id === editId);
      if (found) {
        setEditing(found);
        setForm({
          type: found.type || "call",
          title: found.title || "",
          description: found.description || "",
          companyId: found.companyId || "",
          dealId: found.dealId || "",
          contactId: found.contactId || "",
          durationMinutes: found.durationMinutes != null ? String(found.durationMinutes) : "",
          outcome: found.outcome || "pending",
        });
        setFormError("");
        setModalOpen(true);
      }
    } else {
      setModalOpen(false);
    }
  }, [searchParams, activities]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim()) return setFormError("El título es obligatorio");

    setSaving(true);
    try {
      const payload = {
        ...form,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        companyId: form.companyId || null,
        dealId: form.dealId || null,
        contactId: form.contactId || null,
      };

      if (editing) {
        const res: any = await api.patch(`activities/${editing.id}`, payload);
        setActivities((list) => list.map((a) => (a.id === editing.id ? res.data : a)));
      } else {
        const res: any = await api.post("activities", payload);
        setActivities((list) => [res.data, ...list]);
      }
      closeModal();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar la actividad");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`activities/${toDelete.id}`);
      setActivities((list) => list.filter((a) => a.id !== toDelete.id));
      setToDelete(null);
    } catch (err: any) {
      setLoadError(err.message || "No se pudo eliminar");
      setToDelete(null);
    }
  };

  const companyName = (id?: string) => companies.find((c) => c.id === id)?.name;

  const filtered = activities.filter((a) => {
    const matchType = typeFilter === "ALL" || a.type === typeFilter;
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      a.title?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      (companyName(a.companyId) || "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-500">
          {activities.length} actividad{activities.length !== 1 ? "es" : ""}
          {filtered.length !== activities.length && ` · ${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          variant="primary"
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.set("new", "1");
            setSearchParams(next);
          }}
        >
          + Nueva actividad
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
          <label htmlFor="act-search" className="sr-only">Buscar actividades</label>
          <Input
            id="act-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, nota o empresa…"
          />
        </div>
        <div className="sm:w-52">
          <label htmlFor="act-type" className="sr-only">Filtrar por tipo</label>
          <Select id="act-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">Todos los tipos</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{activityTypeLabel[t]}</option>
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
              { key: "type", label: "Tipo" },
              { key: "title", label: "Título" },
              { key: "companyId", label: "Empresa" },
              { key: "date", label: "Fecha" },
              { key: "outcome", label: "Resultado" },
            ]}
            renderCell={(item, key) => {
              if (key === "type")
                return (
                  <span className={`badge ${activityTypeBadge[item.type] || "badge-neutral"}`}>
                    {activityTypeLabel[item.type] || item.type}
                  </span>
                );
              if (key === "title")
                return <span className="font-medium text-slate-900">{item.title}</span>;
              if (key === "companyId") {
                const name = companyName(item.companyId);
                return name ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/companies/${item.companyId}`)}
                    className="text-primary-600 hover:underline text-left"
                  >
                    {name}
                  </button>
                ) : (
                  <span className="text-slate-400">—</span>
                );
              }
              if (key === "date") return dateTime(item.date);
              if (key === "outcome")
                return item.outcome ? (
                  <span className={`badge ${outcomeBadge[item.outcome] || "badge-neutral"}`}>
                    {outcomeLabel[item.outcome] || item.outcome}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                );
              return undefined;
            }}
            actions={[
              { label: "Ver", onClick: (a) => navigate(`/activities/${a.id}`), variant: "secondary" },
              {
                label: "Editar",
                onClick: (a) => {
                  const next = new URLSearchParams(searchParams);
                  next.set("edit", a.id);
                  setSearchParams(next);
                },
                variant: "outline",
              },
              { label: "Eliminar", onClick: (a) => setToDelete(a), variant: "destructive" },
            ]}
            emptyMessage={
              search || typeFilter !== "ALL"
                ? "Ninguna actividad coincide con los filtros"
                : "Sin actividades registradas. Registra la primera interacción."
            }
          />
        )}
      </div>

      {/* Create / edit */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar actividad" : "Nueva actividad"}
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} type="button">Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit as any} type="button" disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear actividad"}
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
            <Field label="Tipo" htmlFor="a-type">
              <Select id="a-type" value={form.type} onChange={set("type")}>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>{activityTypeLabel[t]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Resultado" htmlFor="a-outcome">
              <Select id="a-outcome" value={form.outcome} onChange={set("outcome")}>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>{outcomeLabel[o]}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Título"
            htmlFor="a-title"
            required
            error={formError && !form.title.trim() ? "El título es obligatorio" : ""}
          >
            <Input
              id="a-title"
              value={form.title}
              onChange={set("title")}
              placeholder="Ej: Llamada de seguimiento"
              invalid={!!formError && !form.title.trim()}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Empresa" htmlFor="a-company">
              <Select id="a-company" value={form.companyId} onChange={set("companyId")}>
                <option value="">— Ninguna —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Duración (min)" htmlFor="a-duration">
              <Input id="a-duration" type="number" min="0" value={form.durationMinutes} onChange={set("durationMinutes")} placeholder="15" />
            </Field>
            <Field label="Contacto" htmlFor="a-contact">
              <Select id="a-contact" value={form.contactId} onChange={set("contactId")}>
                <option value="">— Ninguno —</option>
                {contacts
                  .filter((c) => !form.companyId || c.companyId === form.companyId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </Select>
            </Field>
          </div>

          <Field label="Oportunidad" htmlFor="a-deal" hint="Opcional">
            <Select id="a-deal" value={form.dealId} onChange={set("dealId")}>
              <option value="">— Ninguna —</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Notas" htmlFor="a-desc">
            <Textarea
              id="a-desc"
              value={form.description}
              onChange={set("description")}
              placeholder="Qué se trató, acuerdos, siguiente paso…"
            />
          </Field>
        </form>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!toDelete}
        title="Eliminar actividad"
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
          Vas a eliminar <strong className="text-slate-900">{toDelete?.title}</strong>. Esta acción no se puede
          deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default ActivitiesPage;
