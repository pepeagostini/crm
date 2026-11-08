import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";
import { Field, Input, Textarea, Select } from "../components/Form";
import { badgeFor } from "../lib/format";

interface Company {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: string;
  createdAt?: string;
}

const emptyForm = {
  name: "",
  industry: "",
  email: "",
  phone: "",
  address: "",
  description: "",
};

export const CompaniesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");

  // Modal state — driven by ?new=1 / ?edit=<id> so links and back button work
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Company | null>(null);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const load = async () => {
    try {
      setLoadError("");
      const res: any = await api.get("companies");
      setCompanies(res.data || []);
    } catch (error: any) {
      setLoadError(error.message || "No se pudieron cargar las empresas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sync modal with the URL
  useEffect(() => {
    const editId = searchParams.get("edit");
    const isNew = searchParams.get("new");

    if (isNew) {
      setEditing(null);
      setForm(emptyForm);
      setFormError("");
      setModalOpen(true);
    } else if (editId) {
      const found = companies.find((c) => c.id === editId);
      if (found) {
        setEditing(found);
        setForm({
          name: found.name || "",
          industry: found.industry || "",
          email: found.email || "",
          phone: found.phone || "",
          address: found.address || "",
          description: found.description || "",
        });
        setFormError("");
        setModalOpen(true);
      }
    } else {
      setModalOpen(false);
    }
  }, [searchParams, companies]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("edit");
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

    setSaving(true);
    try {
      if (editing) {
        const res: any = await api.patch(`companies/${editing.id}`, form);
        setCompanies((list) =>
          list.map((c) => (c.id === editing.id ? res.data : c))
        );
      } else {
        const res: any = await api.post("companies", form);
        setCompanies((list) => [res.data, ...list]);
      }
      closeModal();
    } catch (error: any) {
      setFormError(error.message || "No se pudo guardar la empresa");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`companies/${toDelete.id}`);
      setCompanies((list) => list.filter((c) => c.id !== toDelete.id));
      setToDelete(null);
    } catch (error: any) {
      setLoadError(error.message || "No se pudo eliminar");
      setToDelete(null);
    }
  };

  const filtered = companies.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [c.name, c.email, c.industry, c.phone, c.address]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {companies.length} empresa{companies.length !== 1 ? "s" : ""}
            {filtered.length !== companies.length && ` · ${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.set("new", "1");
            setSearchParams(next);
          }}
          variant="primary"
        >
          + Nueva empresa
        </Button>
      </div>

      {loadError && (
        <div
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-3"
          role="alert"
        >
          <span>{loadError}</span>
          <button type="button" onClick={load} className="underline shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {/* Search */}
      <div className="card p-4">
        <label htmlFor="company-search" className="sr-only">
          Buscar empresas
        </label>
        <Input
          id="company-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, industria o teléfono…"
          className="max-w-md"
        />
      </div>

      {/* Table */}
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
              { key: "name", label: "Nombre" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Teléfono" },
              { key: "industry", label: "Industria" },
              { key: "status", label: "Estado" },
            ]}
            renderCell={(item, key) =>
              key === "status" ? (
                <span className={`badge ${badgeFor(item.status || "ACTIVE")}`}>
                  {item.status === "INACTIVE" ? "Inactiva" : "Activa"}
                </span>
              ) : key === "email" && item.email ? (
                <a
                  href={`mailto:${item.email}`}
                  className="text-primary-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.email}
                </a>
              ) : undefined
            }
            actions={[
              {
                label: "Ver",
                onClick: (item: any) => navigate(`/companies/${item.id}`),
                variant: "secondary",
              },
              {
                label: "Editar",
                onClick: (item: any) => {
                  const next = new URLSearchParams(searchParams);
                  next.set("edit", item.id);
                  setSearchParams(next);
                },
                variant: "outline",
              },
              {
                label: "Eliminar",
                onClick: (item: any) => setToDelete(item),
                variant: "destructive",
              },
            ]}
            emptyMessage={
              search
                ? "Ninguna empresa coincide con la búsqueda"
                : "Aún no hay empresas. Crea la primera con «+ Nueva empresa»."
            }
          />
        )}
      </div>

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar empresa" : "Nueva empresa"}
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} type="button">
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSubmit as any} type="button" disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear empresa"}
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

          <Field label="Nombre" htmlFor="c-name" required error={!form.name.trim() && formError ? "El nombre es obligatorio" : ""}>
            <Input
              id="c-name"
              value={form.name}
              onChange={set("name")}
              placeholder="Ej: Acme S.L."
              invalid={!!formError && !form.name.trim()}
              autoComplete="organization"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" htmlFor="c-email">
              <Input
                id="c-email"
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="contacto@empresa.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Teléfono" htmlFor="c-phone">
              <Input
                id="c-phone"
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="+34 600 000 000"
                autoComplete="tel"
              />
            </Field>
          </div>

          <Field label="Industria" htmlFor="c-industry">
            <Input
              id="c-industry"
              value={form.industry}
              onChange={set("industry")}
              placeholder="Ej: Retail, Tecnología, Salud…"
            />
          </Field>

          <Field label="Dirección" htmlFor="c-address">
            <Input
              id="c-address"
              value={form.address}
              onChange={set("address")}
              placeholder="Calle, ciudad, CP"
              autoComplete="street-address"
            />
          </Field>

          <Field label="Descripción" htmlFor="c-desc" hint="Opcional — notas internas sobre la cuenta.">
            <Textarea
              id="c-desc"
              value={form.description}
              onChange={set("description")}
              placeholder="Qué hace la empresa, quién decide, etc."
            />
          </Field>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!toDelete}
        title="Eliminar empresa"
        onClose={() => setToDelete(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)} type="button">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} type="button">
              Eliminar
            </Button>
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

export default CompaniesPage;
