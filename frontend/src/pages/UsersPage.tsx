import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";
import { Field, Input, Select } from "../components/Form";

interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "VENDOR";
  active?: boolean;
  createdAt?: string;
}

const emptyForm = { name: "", email: "", password: "", role: "VENDOR" };

export const UsersPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toToggle, setToToggle] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "VENDOR", password: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [toDelete, setToDelete] = useState<User | null>(null);

  useEffect(() => {
    if (!user) { navigate("/login", { replace: true }); return; }
    if (user.role !== "ADMIN") { navigate("/", { replace: true }); return; }
  }, [user, navigate]);

  const load = async () => {
    try {
      setError("");
      const res: any = await api.get("users");
      setUsers(res.data || []);
    } catch (e: any) {
      setError(e.message || "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "ADMIN") load();
  }, [user]);

  const set = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError("Nombre, email y contraseña son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res: any = await api.post("users", form);
      setUsers((list) => [...list, res.data]);
      setModalOpen(false);
      setForm(emptyForm);
    } catch (err: any) {
      setFormError(err.message || "No se pudo crear el usuario");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!toToggle) return;
    try {
      const res: any = await api.patch(`users/${toToggle.id}`, { active: toToggle.active === false });
      setUsers((list) => list.map((u) => (u.id === toToggle.id ? res.data : u)));
      setToToggle(null);
    } catch (err: any) {
      setError(err.message || "No se pudo actualizar");
      setToToggle(null);
    }
  };

  const setRole = async (u: User, role: "ADMIN" | "VENDOR") => {
    try {
      const res: any = await api.patch(`users/${u.id}`, { role });
      setUsers((list) => list.map((x) => (x.id === u.id ? res.data : x)));
    } catch (err: any) {
      setError(err.message || "No se pudo cambiar el rol");
    }
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, password: "" });
    setEditError("");
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditError("");
    if (!editForm.name.trim()) {
      setEditError("El nombre es obligatorio");
      return;
    }
    setEditSaving(true);
    try {
      const payload: any = { name: editForm.name, role: editForm.role };
      if (editForm.password) payload.password = editForm.password;
      const res: any = await api.patch(`users/${editing.id}`, payload);
      setUsers((list) => list.map((x) => (x.id === editing.id ? res.data : x)));
      setEditOpen(false);
      setEditing(null);
    } catch (err: any) {
      setEditError(err.message || "No se pudo guardar");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`users/${toDelete.id}`);
      setUsers((list) => list.filter((u) => u.id !== toDelete.id));
      setToDelete(null);
    } catch (err: any) {
      setError(err.message || "No se pudo eliminar");
      setToDelete(null);
    }
  };

  if (!user || user.role !== "ADMIN") return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Usuarios y roles</h1>
          <p className="text-sm text-slate-500">{users.length} usuario{users.length !== 1 ? "s" : ""}</p>
        </div>
        <Button variant="primary" onClick={() => { setForm(emptyForm); setFormError(""); setModalOpen(true); }}>+ Nuevo usuario</Button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">{error}</div>}

      <div className="card p-4">
        {loading ? (
          <div className="space-y-3 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-lg" />)}</div>
        ) : (
          <Table
            data={users}
            columns={[
              { key: "name", label: "Nombre" },
              { key: "email", label: "Email" },
              { key: "role", label: "Rol" },
              { key: "active", label: "Estado" },
            ]}
            renderCell={(item, key) => {
              if (key === "role") {
                return (
                  <Select value={item.role} onChange={(e) => setRole(item, e.target.value as any)} className="w-36" aria-label={`Rol de ${item.name}`}>
                    <option value="VENDOR">Vendedor</option>
                    <option value="ADMIN">Administrador</option>
                  </Select>
                );
              }
              if (key === "active") {
                return item.active === false ? (
                  <span className="badge badge-danger">Inactivo</span>
                ) : (
                  <span className="badge badge-success">Activo</span>
                );
              }
              return undefined;
            }}
            actions={[
              { label: "Editar", onClick: (item: any) => openEdit(item), variant: "outline" },
              { label: "Act./Desact.", onClick: (item: any) => setToToggle(item), variant: "outline" },
              { label: "Eliminar", onClick: (item: any) => setToDelete(item), variant: "destructive" },
            ]}
            emptyMessage="No hay usuarios"
          />
        )}
      </div>

      <Modal open={modalOpen} title="Nuevo usuario" onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} type="button">Cancelar</Button>
            <Button variant="primary" onClick={handleCreate as any} type="button" disabled={saving}>{saving ? "Creando…" : "Crear usuario"}</Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          {formError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">{formError}</div>}
          <Field label="Nombre" htmlFor="u-name" required>
            <Input id="u-name" value={form.name} onChange={set("name")} placeholder="Ej: Ana Gómez" />
          </Field>
          <Field label="Email" htmlFor="u-email" required>
            <Input id="u-email" type="email" value={form.email} onChange={set("email")} placeholder="ana@empresa.com" />
          </Field>
          <Field label="Contraseña" htmlFor="u-password" required>
            <Input id="u-password" type="password" value={form.password} onChange={set("password")} placeholder="Mínimo 6 caracteres" />
          </Field>
          <Field label="Rol" htmlFor="u-role">
            <Select id="u-role" value={form.role} onChange={set("role")}>
              <option value="VENDOR">Vendedor</option>
              <option value="ADMIN">Administrador</option>
            </Select>
          </Field>
        </form>
      </Modal>

      <Modal open={!!toToggle} title={toToggle?.active === false ? "Reactivar usuario" : "Desactivar usuario"} onClose={() => setToToggle(null)} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToToggle(null)} type="button">Cancelar</Button>
            <Button variant="primary" onClick={toggleActive} type="button">{toToggle?.active === false ? "Reactivar" : "Desactivar"}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {toToggle?.active === false
            ? <>Vas a reactivar a <strong>{toToggle?.name}</strong>. Podrá iniciar sesión de nuevo.</>
            : <>Vas a desactivar a <strong>{toToggle?.name}</strong>. No podrá iniciar sesión hasta que lo reactives.</>}
        </p>
      </Modal>

      <Modal open={editOpen} title="Editar usuario" onClose={() => { setEditOpen(false); setEditing(null); }}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setEditOpen(false); setEditing(null); }} type="button">Cancelar</Button>
            <Button variant="primary" onClick={handleEdit as any} type="button" disabled={editSaving}>{editSaving ? "Guardando…" : "Guardar cambios"}</Button>
          </>
        }
      >
        <form onSubmit={handleEdit} className="space-y-4" noValidate>
          {editError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">{editError}</div>}
          <Field label="Nombre" htmlFor="e-name" required>
            <Input id="e-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email" htmlFor="e-email">
            <Input id="e-email" value={editForm.email} disabled />
          </Field>
          <Field label="Rol" htmlFor="e-role">
            <Select id="e-role" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as any }))}>
              <option value="VENDOR">Vendedor</option>
              <option value="ADMIN">Administrador</option>
            </Select>
          </Field>
          <Field label="Nueva contraseña (opcional)" htmlFor="e-password" hint="Déjalo vacío para no cambiarla">
            <Input id="e-password" type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
          </Field>
        </form>
      </Modal>

      <Modal open={!!toDelete} title="Eliminar usuario" onClose={() => setToDelete(null)} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)} type="button">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} type="button">Eliminar</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Vas a eliminar a <strong className="text-slate-900">{toDelete?.name}</strong> ({toDelete?.email}). Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default UsersPage;
