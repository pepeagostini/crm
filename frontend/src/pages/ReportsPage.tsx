import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { currency, date as fmtDate } from "../lib/format";
import { Button } from "../components/Button";
import { Select } from "../components/Form";
import { Panel } from "../components/Page";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PIE_COLORS = ["#64748b", "#0284c7", "#2563eb", "#d97706", "#16a34a", "#dc2626"];

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [funnel, setFunnel] = useState<any[]>([]);
  const [conversion, setConversion] = useState<any>(null);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [topCompanies, setTopCompanies] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("companies")
      .then((r: any) => setCompanies(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    const qs = companyId ? `?companyId=${companyId}` : "";
    (async () => {
      try {
        const [f, c, m, t, v]: any[] = await Promise.all([
          api.get(`reports/funnel${qs}`),
          api.get(`reports/conversion${qs}`),
          api.get(`reports/monthly${qs}`),
          api.get(`reports/top-companies`),
          api.get(`reports/vendors${qs}`),
        ]);
        setFunnel(f.data || []);
        setConversion(c.data || null);
        setMonthly(m.data || []);
        setTopCompanies(t.data || []);
        setVendors(v.data || []);
      } catch (e: any) {
        setError(e.message || "No se pudieron cargar los reportes");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, navigate, companyId]);

  if (!user) return null;
  if (loading) {
    return <div className="card p-8 text-center text-slate-400">Cargando reportes…</div>;
  }

  const exportCsv = () => {
    const rows = [["type", "labels", "values"]];
    funnel.forEach((s) => rows.push(["funnel", s.label, String(s.value)]));
    monthly.forEach((m) => rows.push(["monthly", m.label, String(m.wonValue)]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reporte-crm.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Reportes</h1>
          <p className="text-sm text-slate-500">Resumen comercial en vivo</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={companyId}
            onChange={(e) => { setLoading(true); setCompanyId(e.target.value); }}
            aria-label="Filtrar por empresa"
            className="w-56"
          >
            <option value="">Todas las empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
        </div>
      </div>

      {companyId && (
        <div className="p-3 rounded-lg bg-primary-50 border border-primary-200 text-sm text-primary-800">
          Mostrando reportes de: <strong>{companies.find((c) => c.id === companyId)?.name}</strong>
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">{error}</div>}

      {/* Conversion summary */}
      {conversion && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Oportunidades abiertas</p><p className="text-2xl font-semibold mt-1">{conversion.open}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Ganadas</p><p className="text-2xl font-semibold mt-1 text-emerald-600">{conversion.won}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Tasa de cierre</p><p className="text-2xl font-semibold mt-1">{conversion.winRate}%</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Ticket medio ganado</p><p className="text-2xl font-semibold mt-1">{currency(conversion.avgWonValue)}</p></div>
        </div>
      )}

      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        <Panel title="Pipeline por etapa">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {funnel.map((entry, i) => (
                    <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Evolución mensual">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="wonValue" name="Ganado" stroke="#16a34a" strokeWidth={2} />
                <Line type="monotone" dataKey="invoicedValue" name="Facturado" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="paidValue" name="Cobrado" stroke="#d97706" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Vendor performance */}
      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        <Panel title="Rendimiento por vendedor (ganado)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendors}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Bar dataKey="wonValue" name="Ganado" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Detalle por vendedor">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-4">Vendedor</th>
                  <th className="py-2 pr-4 text-right">Deals</th>
                  <th className="py-2 pr-4 text-right">Ganados</th>
                  <th className="py-2 pr-4 text-right">Tasa</th>
                  <th className="py-2 text-right">Valor abierto</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.userId} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-medium">{v.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{v.totalDeals}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-emerald-600">{v.wonDeals}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{v.winRate}%</td>
                    <td className="py-2 text-right tabular-nums">{currency(v.openValue)}</td>
                  </tr>
                ))}
                {vendors.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">Sin datos todavía</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        <Panel title="Empresas por volumen (pipeline)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCompanies} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Legend />
                <Bar dataKey="open" name="Pipeline abierto" stackId="a" fill="#2563eb" />
                <Bar dataKey="won" name="Ganado" stackId="a" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Top empresas (tabla)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-4">Empresa</th>
                  <th className="py-2 pr-4 text-right">Abierto</th>
                  <th className="py-2 pr-4 text-right">Ganado</th>
                  <th className="py-2 text-right">Deals</th>
                </tr>
              </thead>
              <tbody>
                {topCompanies.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{currency(c.open)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-emerald-600">{currency(c.won)}</td>
                    <td className="py-2 text-right tabular-nums">{c.openDeals}</td>
                  </tr>
                ))}
                {topCompanies.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">Sin datos todavía</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default ReportsPage;
