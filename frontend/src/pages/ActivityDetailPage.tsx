import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { PageHeader, Panel } from "../components/Page";
import { DetailRow } from "../components/Form";
import {
  dateTime,
  activityTypeLabel,
  activityTypeBadge,
} from "../lib/format";

const outcomeLabel: Record<string, string> = {
  pending: "Pendiente",
  completed: "Completada",
  no_answer: "Sin respuesta",
  rescheduled: "Reprogramada",
  interested: "Interesado",
  not_interested: "No interesado",
};

export const ActivityDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get(`activities/${id}`).catch(() => null);
      if (!res || !res.data) {
        setError("Esta actividad ya no existe o fue eliminada.");
        setActivity(null);
        return;
      }
      const a = res.data;
      setActivity(a);

      const extras = await Promise.all([
        a.companyId ? api.get(`companies/${a.companyId}`).catch(() => null) : null,
        a.dealId ? api.get(`deals/${a.dealId}`).catch(() => null) : null,
      ]);
      setCompany(extras[0]?.data || null);
      setDeal(extras[1]?.data || null);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar la actividad");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
    else load();
  }, [user, load, navigate]);

  const remove = async () => {
    if (!id) return;
    try {
      await api.delete(`activities/${id}`);
      navigate("/activities", { replace: true });
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
        <div className="card h-64" />
      </div>
    );
  }

  if (error && !activity) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600 mb-4">{error}</p>
        <Button variant="primary" onClick={() => navigate("/activities")}>Volver a actividades</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={activity.title}
        backTo="/activities"
        backLabel="Todas las actividades"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={`badge ${activityTypeBadge[activity.type] || "badge-neutral"}`}>
              {activityTypeLabel[activity.type] || activity.type}
            </span>
            <span>{dateTime(activity.date)}</span>
            {activity.outcome && (
              <>
                <span aria-hidden="true">·</span>
                <span className="badge badge-neutral">{outcomeLabel[activity.outcome] || activity.outcome}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`/activities?edit=${activity.id}`)}>
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
        <Panel title="Notas" className="xl:col-span-2">
          {activity.description ? (
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {activity.description}
            </p>
          ) : (
            <p className="text-sm text-slate-400">Sin notas para esta actividad.</p>
          )}
        </Panel>

        <Panel title="Detalles">
          <dl>
            <DetailRow label="Tipo">{activityTypeLabel[activity.type] || activity.type}</DetailRow>
            <DetailRow label="Resultado">
              {activity.outcome ? outcomeLabel[activity.outcome] || activity.outcome : "—"}
            </DetailRow>
            <DetailRow label="Fecha">{dateTime(activity.date)}</DetailRow>
            <DetailRow label="Duración">
              {activity.durationMinutes ? `${activity.durationMinutes} min` : "—"}
            </DetailRow>
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
          </dl>
        </Panel>
      </div>

      <Modal
        open={confirmDelete}
        title="Eliminar actividad"
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
          Vas a eliminar <strong className="text-slate-900">{activity.title}</strong>. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default ActivityDetailPage;
