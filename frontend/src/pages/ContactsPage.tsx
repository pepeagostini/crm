import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";
import { Field, Input, Textarea, Select } from "../components/Form";

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  notes?: string;
  companyId?: string | null;
  createdAt?: string;
}

interface Company {
  id: string;
  name: string;
}

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  role: "",
  notes: "",
  companyId: "",
};

export const ContactsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("ALL");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Contact | null>(null);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const load = async () => {
    try {
      setLoadError("");
      const [cRes, eRes]: any = [await api.get("contacts"), await api.get("companies")];
      setContacts(cRes.data || []);
      setCompanies(eRes.data || []);
    } catch (error: any) {
      setLoadError(error.message || "No se pudieron cargar los contactos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    const isNew = searchParams.get("new");

    if (isNew) {
      setEditing(null);
      const preselectCompany = searchParams.get("companyId") || "";
      setForm({ ...emptyForm, companyId: preselectCompany });
      setFormError("");
      setModalOpen(true);
    } else if (editId) {
      const found = contacts.find((c) => c.id === editId);
      if (found) {
        setEditing(found);
        setForm({
          name: found.name || "",
          email: found.email || "",
          phone: found.phone || "",
          role: found.role || "",
          notes: found.notes || "",
          companyId: found.companyId || "",
        });
        setFormError("");
        setModalOpen(true);
      }
    } else {
      setModalOpen(false);
    }
  }, [searchParams, contacts]);

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

  const companyName = (id?: string | null) =>
    id ? companies.find((c) => c.id === id)?.name || "—" : "—";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, companyId: form.companyId || null };
      if (editing) {
        const res: any = await api.patch(`contacts/${editing.id}`, payload);
        setContacts((list) => list.map((c) => (c.id === editing.id ? res.data : c)));
      } else {
        const res: any = await api.post("contacts", payload);
        setContacts((list) => [res.data, ...list]);
      }
      closeModal();
    } catch (error: any) {
      setFormError(error.message || "No se pudo guardar el contacto");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`contacts/${toDelete.id}`);
      setContacts((list) => list.filter((c) => c.id !== toDelete.id));
      setToDelete(null);
    } catch (error: any) {
      setLoadError(error.message || "No se pudo eliminar");
      setToDelete(null);
    }
  };

  const filtered = contacts.filter((c) => {
    if (companyFilter !== "ALL" && c.companyId !== companyFilter) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [c.name, c.email, c.phone, c.role, companyName(c.companyId)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-500">
          {contacts.length} contacto{contacts.length !== 1 ? "s" : ""}
          {filtered.length !== contacts.length && ` · ${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.set("new", "1");
            setSearchParams(next);
          }}
          variant="primary"
        >
          + Nuevo contacto
        </Button>
      </div>

      {loadError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-3" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={load} className="underline shrink-0">Reintentar</button>
        </div>
      )}

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <label htmlFor="contact-search" className="sr-only">Buscar contactos</label>
        <Input
          id="contact-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, teléfono o cargo…"
          className="max-w-md"
        />
        <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="sm:w-56" aria-label="Filtrar por empresa">
          <option value="ALL">Todas las empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
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
              { key: "name", label: "Nombre" },
              { key: "role", label: "Cargo" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Teléfono" },
              { key: "company", label: "Empresa" },
            ]}
            renderCell={(item, key) =>
              key === "company" ? (
                item.companyId ? (
                  <Link to={`/companies/${item.companyId}`} className="text-primary-600 hover:underline">
                    {companyName(item.companyId)}
                  </Link>
                ) : (
                  "—"
                )
              ) : key === "email" && item.email ? (
                <a href={`mailto:${item.email}`} className="text-primary-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {item.email}
                </a>
              ) : undefined
            }
            actions={[
              { label: "Ver", onClick: (item: any) => navigate(`/contacts/${item.id}`), variant: "secondary" },
              {
                label: "Editar",
                onClick: (item: any) => {
                  const next = new URLSearchParams(searchParams);
                  next.set("edit", item.id);
                  setSearchParams(next);
                },
                variant: "outline",
              },
              { label: "Eliminar", onClick: (item: any) => setToDelete(item), variant: "destructive" },
            ]}
            emptyMessage={search || companyFilter !== "ALL" ? "Ningún contacto coincide con los filtros" : "Aún no hay contactos. Crea el primero con «+ Nuevo contacto»."}
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? "Editar contacto" : "Nuevo contacto"}
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} type="button">Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit as any} type="button" disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear contacto"}
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

          <Field label="Nombre" htmlFor="ct-name" required>
            <Input id="ct-name" value={form.name} onChange={set("name")} placeholder="Ej: Ana Gómez" autoComplete="name" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" htmlFor="ct-email">
              <Input id="ct-email" type="email" value={form.email} onChange={set("email")} placeholder="ana@empresa.com" autoComplete="email" />
            </Field>
            <Field label="Teléfono" htmlFor="ct-phone">
              <Input id="ct-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+34 600 000 000" autoComplete="tel" />
            </Field>
          </div>

          <Field label="Cargo" htmlFor="ct-role">
            <Input id="ct-role" value={form.role} onChange={set("role")} placeholder="Ej: Directora de compras" />
          </Field>

          <Field label="Empresa" htmlFor="ct-company">
            <Select id="ct-company" value={form.companyId} onChange={set("companyId")}>
              <option value="">Sin empresa</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Notas" htmlFor="ct-notes">
            <Textarea id="ct-notes" value={form.notes} onChange={set("notes")} placeholder="Contexto de la relación, fecha de último contacto, etc." />
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!toDelete}
        title="Eliminar contacto"
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
          Vas a eliminar <strong className="text-slate-900">{toDelete?.name}</strong>. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default ContactsPage;
