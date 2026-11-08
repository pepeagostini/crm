import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { PageHeader, Panel } from "../components/Page";
import { DetailRow } from "../components/Form";
import { date as fmtDate } from "../lib/format";

export const ContactDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [contact, setContact] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get(`contacts/${id}`).catch(() => null);
      if (!res || !res.data) {
        setError("Este contacto ya no existe o fue eliminado.");
        setContact(null);
        return;
      }
      const c = res.data;
      setContact(c);
      if (c.companyId) {
        const comp: any = await api.get(`companies/${c.companyId}`).catch(() => null);
        setCompany(comp?.data || null);
      } else {
        setCompany(null);
      }
    } catch (e: any) {
      setError(e.message || "No se pudo cargar el contacto");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
    else load();
  }, [user, load, navigate]);

  const handleDelete = async () => {
    if (!contact) return;
    try {
      await api.delete(`contacts/${contact.id}`);
      navigate("/contacts", { replace: true });
    } catch (e: any) {
      setError(e.message || "No se pudo eliminar");
      setConfirmDelete(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="card h-56" />
      </div>
    );
  }

  if (error && !contact) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600 mb-4">{error}</p>
        <Button variant="primary" onClick={() => navigate("/contacts")}>Volver a contactos</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={contact.name}
        backTo="/contacts"
        backLabel="Todos los contactos"
        subtitle={contact.role ? <span>{contact.role}</span> : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`/contacts?edit=${contact.id}`)}>Editar</Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Eliminar</Button>
          </>
        }
      />

      {error && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800" role="alert">{error}</div>
      )}

      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        <Panel title="Datos de contacto">
          <dl>
            <DetailRow label="Email">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="text-primary-600 hover:underline">{contact.email}</a>
              ) : "—"}
            </DetailRow>
            <DetailRow label="Teléfono">
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="text-primary-600 hover:underline">{contact.phone}</a>
              ) : "—"}
            </DetailRow>
            <DetailRow label="Cargo">{contact.role || "—"}</DetailRow>
            <DetailRow label="Empresa">
              {company ? (
                <Link to={`/companies/${company.id}`} className="text-primary-600 hover:underline">{company.name}</Link>
              ) : "—"}
            </DetailRow>
            <DetailRow label="Creado">{fmtDate(contact.createdAt)}</DetailRow>
          </dl>
        </Panel>

        <Panel title="Notas">
          <p className="text-sm text-slate-600 whitespace-pre-wrap">
            {contact.notes || "Sin notas."}
          </p>
        </Panel>
      </div>

      <Modal
        open={confirmDelete}
        title="Eliminar contacto"
        onClose={() => setConfirmDelete(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} type="button">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} type="button">Eliminar</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Vas a eliminar <strong className="text-slate-900">{contact?.name}</strong>. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default ContactDetailPage;
