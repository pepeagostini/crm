import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { PageHeader, Panel, EmptyHint } from "../components/Page";
import { DetailRow } from "../components/Form";
import {
  currency,
  date as fmtDate,
  dateTime,
} from "../lib/format";
import { useSettings } from "../hooks/useSettings";

export const DealDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { stages, stageLabel, stageBadge, stageProbability, stageIndex } = useSettings();
  const navigate = useNavigate();

  const [deal, setDeal] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stageOpen, setStageOpen] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [dealRes, activitiesRes, invoicesRes]: any[] = await Promise.all([
        api.get(`deals/${id}`).catch(() => null),
        api.get("activities"),
        api.get("invoices"),
      ]);

      if (!dealRes || !dealRes.data) {
        setError("Esta oportunidad ya no existe o fue eliminada.");
        setDeal(null);
        return;
      }

      const d = dealRes.data;
      setDeal(d);
      setActivities(
        (activitiesRes?.data || []).filter((a: any) => a.dealId === id || a.companyId === d.companyId)
      );
      setInvoices((invoicesRes?.data || []).filter((i: any) => i.dealId === id));

      if (d.companyId) {
        const c: any = await api.get(`companies/${d.companyId}`).catch(() => null);
        setCompany(c?.data || null);
      } else {
        setCompany(null);
      }
    } catch (e: any) {
      setError(e.message || "No se pudo cargar la oportunidad");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
    else load();
  }, [user, load, navigate]);

  const changeStage = async (stage: string) => {
    if (!id) return;
    setStageBusy(true);
    try {
      const res: any = await api.patch(`deals/${id}/status`, { stage });
      setDeal(res.data);
      setStageOpen(false);
    } catch (e: any) {
      setError(e.message || "No se pudo cambiar la etapa");
    } finally {
      setStageBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    try {
      await api.delete(`deals/${id}`);
      navigate("/deals", { replace: true });
    } catch (e: any) {
      setError(e.message || "No se pudo eliminar");
      setConfirmDelete(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-72 bg-slate-200 rounded" />
        <div className="card h-56" />
        <div className="card h-40" />
      </div>
    );
  }

  if (error && !deal) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600 mb-4">{error}</p>
        <Button variant="primary" onClick={() => navigate("/deals")}>
          Volver a oportunidades
        </Button>
      </div>
    );
  }

  const progress = stageProbability(deal.stage) ?? deal.probability ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={deal.name}
        backTo="/deals"
        backLabel="Todas las oportunidades"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={`badge ${stageBadge(deal.stage)}`}>
              {stageLabel(deal.stage)}
            </span>
            <span className="tabular-nums">{progress}% probabilidad</span>
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
            <Button variant="primary" onClick={() => setStageOpen(true)} disabled={stageBusy}>
              Cambiar etapa
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/deals?edit=${deal.id}`)}>
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

      {/* Stage progress */}
      <div className="card p-5">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-500">Progreso de etapa</span>
          <span className="font-semibold text-slate-900 tabular-nums">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              deal.stage === "LOST"
                ? "bg-red-500"
                : deal.stage === "WINNING"
                ? "bg-emerald-500"
                : "bg-primary-600"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
          {stages.map((st, i) => (
            <li key={st.id} className="text-center">
              <span
                className={`block text-[11px] leading-tight px-1 py-1.5 rounded ${
                  st.id === deal.stage
                    ? "bg-primary-600 text-white font-semibold"
                    : i < stageIndex(deal.stage) && deal.stage !== "LOST"
                    ? "bg-primary-50 text-primary-700"
                    : "bg-slate-50 text-slate-400"
                }`}
              >
                {st.label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        {/* Details */}
        <Panel title="Datos de la oportunidad">
          <dl>
            <DetailRow label="Valor">{currency(deal.value, deal.currency)}</DetailRow>
            <DetailRow label="Probabilidad">{progress}%</DetailRow>
            <DetailRow label="Etapa">{stageLabel(deal.stage)}</DetailRow>
            <DetailRow label="Empresa">
              {company ? (
                <Link to={`/companies/${company.id}`} className="text-primary-600 hover:underline">
                  {company.name}
                </Link>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Cierre estimado">{fmtDate(deal.closeDate)}</DetailRow>
            <DetailRow label="Estado">
              {deal.status === "WON"
                ? "Ganada"
                : deal.status === "LOST"
                ? "Perdida"
                : "Activa"}
            </DetailRow>
            <DetailRow label="Descripción">{deal.description || "—"}</DetailRow>
            <DetailRow label="Creada">{dateTime(deal.createdAt)}</DetailRow>
          </dl>
        </Panel>

        {/* Invoices */}
        <Panel
          title="Facturas"
          action={
            <Button size="sm" variant="outline" onClick={() => navigate(`/invoices?new=1&dealId=${deal.id}`)}>
              + Factura
            </Button>
          }
        >
          {invoices.length === 0 ? (
            <EmptyHint message="Sin facturas vinculadas a esta oportunidad." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <li key={inv.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <Link to={`/invoices/${inv.id}`} className="text-sm font-medium text-primary-600 hover:underline">
                    {inv.number}
                  </Link>
                  <span className="text-sm text-slate-700 tabular-nums">
                    {currency(inv.total, inv.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Activities */}
      <Panel title="Actividades">
        {activities.length === 0 ? (
          <EmptyHint
            message="Sin actividades registradas."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate(`/activities?new=1&dealId=${deal.id}${deal.companyId ? `&companyId=${deal.companyId}` : ""}`)
                }
              >
                + Registrar actividad
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {activities.map((a) => (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/activities/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600 text-sm">
                      {a.title}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">{dateTime(a.date)}</p>
                    {a.description && (
                      <p className="text-sm text-slate-600 mt-1">{a.description}</p>
                    )}
                  </div>
                  {a.outcome && <span className="badge badge-neutral shrink-0">{a.outcome}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Stage modal */}
      <Modal
        open={stageOpen}
        title="Cambiar etapa"
        onClose={() => !stageBusy && setStageOpen(false)}
        size="sm"
      >
        <div className="space-y-2">
          {stages.map((st) => (
            <button
              key={st.id}
              type="button"
              disabled={stageBusy}
              onClick={() => changeStage(st.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 disabled:opacity-60 ${
                deal.stage === st.id
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

      {/* Delete confirm */}
      <Modal
        open={confirmDelete}
        title="Eliminar oportunidad"
        onClose={() => setConfirmDelete(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} type="button">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove} type="button">
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Vas a eliminar <strong className="text-slate-900">{deal.name}</strong>. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
};

export default DealDetailPage;
