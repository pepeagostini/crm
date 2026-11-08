import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Table } from "../components/Table";
import { PageHeader, Panel, EmptyHint } from "../components/Page";
import { DetailRow } from "../components/Form";
import {
  currency,
  date as fmtDate,
  invoiceStatusLabel,
  invoiceStatusBadge,
  badgeFor,
} from "../lib/format";
import { useSettings } from "../hooks/useSettings";

export const CompanyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { stageLabel, stageBadge } = useSettings();
  const navigate = useNavigate();

  const [company, setCompany] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [companyRes, dealsRes, invoicesRes, activitiesRes, contactsRes]: any[] =
        await Promise.all([
          api.get(`companies/${id}`).catch(() => null),
          api.get("deals"),
          api.get("invoices"),
          api.get("activities"),
          api.get(`contacts?companyId=${id}`).catch(() => null),
        ]);

      if (!companyRes || !companyRes.data) {
        setError("Esta empresa ya no existe o fue eliminada.");
        setCompany(null);
        return;
      }

      setCompany(companyRes.data);
      setDeals((dealsRes?.data || []).filter((d: any) => d.companyId === id));
      setInvoices((invoicesRes?.data || []).filter((i: any) => i.companyId === id));
      setActivities(
        (activitiesRes?.data || []).filter((a: any) => a.companyId === id)
      );
      setContacts(contactsRes?.data || []);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar la empresa");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
    else load();
  }, [user, load, navigate]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="card h-56" />
        <div className="card h-40" />
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600 mb-4">{error}</p>
        <Button variant="primary" onClick={() => navigate("/companies")}>
          Volver a empresas
        </Button>
      </div>
    );
  }

  const totalPipeline = deals
    .filter((d) => d.stage !== "LOST")
    .reduce((s, d) => s + (d.value || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={company.name}
        backTo="/companies"
        backLabel="Todas las empresas"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={`badge ${badgeFor(company.status || "ACTIVE")}`}>
              {company.status === "INACTIVE" ? "Inactiva" : "Activa"}
            </span>
            {company.industry && <span>{company.industry}</span>}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => navigate(`/deals?new=1&companyId=${id}`)}
            >
              + Oportunidad
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/companies?edit=${id}`)}>
              Editar
            </Button>
          </>
        }
      />

      {error && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800" role="alert">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Oportunidades</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{deals.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Pipeline activo</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">
            {currency(totalPipeline)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Facturas</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{invoices.length}</p>
        </div>
      </div>

      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        {/* Company info */}
        <Panel title="Datos de la empresa">
          <dl>
            <DetailRow label="Email">
              {company.email ? (
                <a href={`mailto:${company.email}`} className="text-primary-600 hover:underline">
                  {company.email}
                </a>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Teléfono">
              {company.phone ? (
                <a href={`tel:${company.phone}`} className="text-primary-600 hover:underline">
                  {company.phone}
                </a>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Industria">{company.industry || "—"}</DetailRow>
            <DetailRow label="Dirección">{company.address || "—"}</DetailRow>
            <DetailRow label="Descripción">{company.description || "—"}</DetailRow>
            <DetailRow label="Creada">{fmtDate(company.createdAt)}</DetailRow>
          </dl>
        </Panel>

        {/* Contacts */}
        <Panel
          title="Contactos"
          action={
            <Button size="sm" variant="outline" onClick={() => navigate(`/contacts?new=1&companyId=${id}`)}>
              + Contacto
            </Button>
          }
        >
          {contacts.length === 0 ? (
            <EmptyHint message="Sin contactos registrados para esta empresa." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/contacts/${c.id}`}
                        className="font-medium text-slate-900 hover:text-primary-600 text-sm"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {c.role || "—"}
                        {c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Activities */}
        <Panel
          title="Actividades"
          action={
            <Button size="sm" variant="outline" onClick={() => navigate(`/activities?new=1&companyId=${id}`)}>
              + Registrar
            </Button>
          }
        >

          {activities.length === 0 ? (
            <EmptyHint message="Sin actividades registradas para esta empresa." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.slice(0, 6).map((a) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/activities/${a.id}`}
                        className="font-medium text-slate-900 hover:text-primary-600 text-sm"
                      >
                        {a.title}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {a.type === "call"
                          ? "Llamada"
                          : a.type === "email"
                          ? "Email"
                          : a.type === "meeting"
                          ? "Reunión"
                          : "Nota"}{" "}
                        · {fmtDate(a.date)}
                      </p>
                    </div>
                    {a.outcome && (
                      <span className={`badge ${badgeFor(a.outcome)} shrink-0`}>
                        {a.outcome}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Deals */}
      <Panel title="Oportunidades">
        <Table
          data={deals}
          columns={[
            { key: "name", label: "Oportunidad" },
            { key: "value", label: "Valor", align: "right" },
            { key: "stage", label: "Etapa" },
            { key: "closeDate", label: "Cierre" },
          ]}
          renderCell={(item, key) =>
            key === "name" ? (
              <Link to={`/deals/${item.id}`} className="text-primary-600 hover:underline font-medium">
                {item.name}
              </Link>
            ) : key === "value" ? (
              currency(item.value, item.currency)
            ) : key === "stage" ? (
              <span className={`badge ${stageBadge(item.stage)}`}>
                {stageLabel(item.stage)}
              </span>
            ) : key === "closeDate" ? (
              fmtDate(item.closeDate)
            ) : undefined
          }
          actions={[
            { label: "Ver", onClick: (i) => navigate(`/deals/${i.id}`), variant: "secondary" },
          ]}
          emptyMessage="Esta empresa aún no tiene oportunidades."
        />
      </Panel>

      {/* Invoices */}
      <Panel title="Facturas">
        <Table
          data={invoices}
          columns={[
            { key: "number", label: "Número" },
            { key: "total", label: "Total", align: "right" },
            { key: "status", label: "Estado" },
            { key: "dueDate", label: "Vencimiento" },
          ]}
          renderCell={(item, key) =>
            key === "number" ? (
              <Link to={`/invoices/${item.id}`} className="text-primary-600 hover:underline font-medium">
                {item.number}
              </Link>
            ) : key === "total" ? (
              currency(item.total, item.currency)
            ) : key === "status" ? (
              <span className={`badge ${invoiceStatusBadge[item.status] || "badge-neutral"}`}>
                {invoiceStatusLabel[item.status] || item.status}
              </span>
            ) : key === "dueDate" ? (
              fmtDate(item.dueDate)
            ) : undefined
          }
          actions={[
            { label: "Ver", onClick: (i) => navigate(`/invoices/${i.id}`), variant: "secondary" },
          ]}
          emptyMessage="Esta empresa aún no tiene facturas."
        />
      </Panel>
    </div>
  );
};

export default CompanyDetailPage;
