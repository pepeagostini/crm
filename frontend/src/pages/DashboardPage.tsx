import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import {
  currency,
} from "../lib/format";
import { useSettings } from "../hooks/useSettings";

interface Stats {
  totalCompanies: number;
  totalDeals: number;
  totalInvoices: number;
  totalActivities: number;
  pipelineValue: number;
  wonValue: number;
  invoicedValue: number;
  paidValue: number;
}

const emptyStats: Stats = {
  totalCompanies: 0,
  totalDeals: 0,
  totalInvoices: 0,
  totalActivities: 0,
  pipelineValue: 0,
  wonValue: 0,
  invoicedValue: 0,
  paidValue: 0,
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { stageLabel, stageBadge } = useSettings();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [deals, setDeals] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [compRes, dealRes, invRes, actRes, reportRes, tasksRes]: any[] =
        await Promise.all([
          api.get("companies"),
          api.get("deals"),
          api.get("invoices"),
          api.get("activities"),
          api.get("reports/sales"),
          api.get("tasks"),
        ]);
      setTasks(tasksRes?.data || []);

      const summary = reportRes?.data?.summary || {};
      setStats({
        totalCompanies: compRes?.data?.length || 0,
        totalDeals: dealRes?.data?.length || 0,
        totalInvoices: invRes?.data?.length || 0,
        totalActivities: actRes?.data?.length || 0,
        pipelineValue: summary.totalPipeline || 0,
        wonValue: summary.totalWon || 0,
        invoicedValue: summary.totalInvoiced || 0,
        paidValue: summary.totalPaid || 0,
      });
      setCompanies(compRes?.data || []);
      setDeals(
        ((dealRes?.data || []) as any[])
          .filter((d: any) => d.stage !== "LOST")
          .slice(0, 6)
      );
      setActivities(((actRes?.data || []) as any[]).slice(0, 5));
    } catch (e: any) {
      setError(e.message || "No se pudo cargar el panel");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
    else load();
  }, [user, load, navigate]);

  const companyName = (id?: string) => companies.find((c) => c.id === id)?.name;

  if (!user) return null;

  const kpis = [
    {
      label: "Empresas",
      value: String(stats.totalCompanies),
      to: "/companies",
      tint: "bg-blue-50 text-blue-600",
      icon: (
        <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h4a2 2 0 0 1 2 2v10" />
      ),
    },
    {
      label: "Oportunidades",
      value: String(stats.totalDeals),
      to: "/deals",
      tint: "bg-emerald-50 text-emerald-600",
      icon: <path d="M3 17l6-6 4 4 7-7M14 8h6v6" />,
    },
    {
      label: "Pipeline activo",
      value: currency(stats.pipelineValue),
      to: "/deals",
      tint: "bg-violet-50 text-violet-600",
      icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
    },
    {
      label: "Facturas",
      value: String(stats.totalInvoices),
      to: "/invoices",
      tint: "bg-amber-50 text-amber-600",
      icon: <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 2v6h6M9 13h6M9 17h6" />,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 bg-slate-200 rounded" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card h-28" />
          ))}
        </div>
        <div className="card h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline shrink-0">Reintentar</button>
        </div>
      )}

      {/* Greeting */}
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
          Hola, {user.name?.split(" ")[0] || "Usuario"} 👋
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Resumen de tu actividad comercial
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => navigate(kpi.to)}
            className="card p-5 text-left hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-500">{kpi.label}</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1 truncate tabular-nums">
                  {kpi.value}
                </p>
              </div>
              <div className={`p-2.5 rounded-lg shrink-0 ${kpi.tint}`}>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  {kpi.icon}
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Secondary metrics */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Ganado</p>
          <p className="text-lg font-semibold text-emerald-600 mt-0.5 tabular-nums">{currency(stats.wonValue)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Facturado</p>
          <p className="text-lg font-semibold text-slate-900 mt-0.5 tabular-nums">{currency(stats.invoicedValue)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Cobrado</p>
          <p className="text-lg font-semibold text-slate-900 mt-0.5 tabular-nums">{currency(stats.paidValue)}</p>
        </div>
      </div>

      <div className="grid gap-5 grid-cols-1 xl:grid-cols-3">
        {/* Recent deals */}
        <section className="card xl:col-span-2">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Oportunidades abiertas</h3>
            <Link to="/deals" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Ver todas →
            </Link>
          </header>

          {deals.length === 0 ? (
            <div className="empty-state">
              <p className="text-slate-500 font-medium">No hay oportunidades abiertas</p>
              <p className="text-slate-400 text-sm mt-1">Crea la primera desde el módulo Oportunidades</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {deals.map((d) => (
                <li key={d.id}>
                  <Link
                    to={`/deals/${d.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{d.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {companyName(d.companyId) || "Sin empresa"} · {(d.probability ?? 0)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`badge ${stageBadge(d.stage)}`}>
                        {stageLabel(d.stage)}
                      </span>
                      <span className="text-sm font-medium text-slate-900 tabular-nums">
                        {currency(d.value, d.currency)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent activities */}
        <section className="card">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Últimas actividades</h3>
            <Link to="/activities" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Ver →
            </Link>
          </header>

          {activities.length === 0 ? (
            <div className="empty-state">
              <p className="text-slate-500 text-sm">Sin actividad registrada</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/activities/${a.id}`}
                    className="block px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {a.type === "call" ? "Llamada" : a.type === "email" ? "Email" : a.type === "meeting" ? "Reunión" : "Nota"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* My tasks today */}
        <section className="card xl:col-span-3">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Mis tareas</h3>
            <Link to="/tasks" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Ver todas →
            </Link>
          </header>
          {tasks.filter((t) => t.status !== "done").length === 0 ? (
            <div className="empty-state">
              <p className="text-slate-500 text-sm">No tienes tareas pendientes 🎉</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks
                .filter((t) => t.status !== "done")
                .slice(0, 5)
                .map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <Link to="/tasks" className="text-sm font-medium text-slate-900 hover:text-primary-600 truncate">
                      {t.title}
                    </Link>
                    <span className="text-xs text-slate-500 shrink-0">
                      {t.dueDate ? t.dueDate : "Sin fecha"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
