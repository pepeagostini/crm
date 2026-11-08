import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSettings, Stage } from "../hooks/useSettings";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { Field, Input, Select, Textarea, DetailRow } from "../components/Form";
import { api } from "../services/api";

const CURRENCIES = [
  { code: "USD", label: "USD — Dólar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "MXN", label: "MXN — Peso mexicano" },
  { code: "ARS", label: "ARS — Peso argentino" },
  { code: "COP", label: "COP — Peso colombiano" },
  { code: "CLP", label: "CLP — Peso chileno" },
  { code: "PEN", label: "PEN — Sol peruano" },
  { code: "VES", label: "VES — Bolívar venezolano" },
  { code: "UYU", label: "UYU — Peso uruguayo" },
  { code: "BOB", label: "BOB — Boliviano" },
  { code: "DOP", label: "DOP — Peso dominicano" },
  { code: "GTQ", label: "GTQ — Quetzal guatemalteco" },
  { code: "HNL", label: "HNL — Lempira hondureño" },
  { code: "NIO", label: "NIO — Córdoba nicaragüense" },
  { code: "CRC", label: "CRC — Colón costarricense" },
  { code: "PAB", label: "PAB — Balboa panameño" },
];

const TABS = [
  { id: "general", label: "General" },
  { id: "pipeline", label: "Pipeline" },
  { id: "team", label: "Equipo" },
  { id: "delivery", label: "Envío" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings, save, reload, error: settingsError } = useSettings();

  const [tab, setTab] = useState<TabId>("general");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // General form
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [currency, setCurrency] = useState(settings.currency);
  const [taxRate, setTaxRate] = useState(String(settings.taxRate));
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix);

  // Company identity (invoice PDF header)
  const [address, setAddress] = useState(settings.address || "");
  const [companyPhone, setCompanyPhone] = useState(settings.phone || "");
  const [companyEmail, setCompanyEmail] = useState(settings.email || "");
  const [taxId, setTaxId] = useState(settings.taxId || "");
  const [website, setWebsite] = useState(settings.website || "");
  const [invoiceNotes, setInvoiceNotes] = useState(settings.invoiceNotes || "");

  // Delivery tab
  const [smtp, setSmtp] = useState(settings.smtp);
  const [whatsapp, setWhatsapp] = useState(settings.whatsapp);
  const [publicUrl, setPublicUrl] = useState(settings.publicUrl || "");
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [testResult, setTestResult] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Pipeline form (local copy so edits are discardable)
  const [stages, setStages] = useState<Stage[]>(settings.stages);
  const [stageError, setStageError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  // Re-sync local forms whenever the server copy changes
  useEffect(() => {
    setCompanyName(settings.companyName);
    setCurrency(settings.currency);
    setTaxRate(String(settings.taxRate));
    setInvoicePrefix(settings.invoicePrefix);
    setStages(settings.stages);
    setAddress(settings.address || "");
    setCompanyPhone(settings.phone || "");
    setCompanyEmail(settings.email || "");
    setTaxId(settings.taxId || "");
    setWebsite(settings.website || "");
    setInvoiceNotes(settings.invoiceNotes || "");
    setSmtp(settings.smtp);
    setWhatsapp(settings.whatsapp);
    setPublicUrl(settings.publicUrl || "");
  }, [settings]);

  if (!user) return null;

  const flash = (kind: "ok" | "err", text: string) => {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage(null), 5000);
  };

  // ---------------------------------------------------------------- General
  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await save({
        companyName: companyName.trim(),
        currency,
        taxRate: Number(taxRate),
        invoicePrefix: invoicePrefix.trim() || "F-",
        address: address.trim(),
        phone: companyPhone.trim(),
        email: companyEmail.trim(),
        taxId: taxId.trim(),
        website: website.trim(),
        invoiceNotes: invoiceNotes.trim(),
      });
      flash("ok", "Configuración general guardada");
    } catch (err: any) {
      flash("err", err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- Pipeline
  const updateStage = (index: number, patch: Partial<Stage>) =>
    setStages((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const moveStage = (index: number, delta: number) =>
    setStages((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addStage = () =>
    setStages((list) => [
      ...list,
      {
        id: "", // server assigns a slug
        label: `Etapa ${list.length + 1}`,
        probability: 50,
        color: "#64748b",
      },
    ]);

  const removeStage = (index: number) => setStages((list) => list.filter((_, i) => i !== index));

  const savePipeline = async () => {
    setStageError("");
    if (stages.length === 0) {
      setStageError("Debe haber al menos una etapa");
      return;
    }
    if (stages.some((s) => !s.label.trim())) {
      setStageError("Todas las etapas necesitan un nombre");
      return;
    }
    setSaving(true);
    try {
      await save({ stages });
      flash("ok", "Pipeline actualizado");
    } catch (err: any) {
      setStageError(err.message || "No se pudo guardar el pipeline");
      flash("err", err.message || "No se pudo guardar el pipeline");
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------ UI
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Ajustes</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAdmin
            ? "Configuración de la cuenta, el pipeline y el equipo."
            : "Solo un administrador puede modificar la configuración."}
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={`p-3 rounded-lg text-sm border ${
            message.kind === "ok"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}
      {settingsError && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800" role="alert">
          {settingsError}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200" role="tablist" aria-label="Secciones de ajustes">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ============================ GENERAL ============================ */}
      {tab === "general" && (
        <form onSubmit={saveGeneral} className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Datos generales</h2>

          <Field label="Nombre de la empresa" htmlFor="s-company" required>
            <Input
              id="s-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={!isAdmin}
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Moneda por defecto" htmlFor="s-currency" hint="Usada en facturas y reportes">
              <Select
                id="s-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!isAdmin}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="IVA por defecto (%)"
              htmlFor="s-tax"
              hint="Se aplica al crear facturas"
            >
              <Input
                id="s-tax"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                disabled={!isAdmin}
              />
            </Field>
          </div>

          <Field label="Prefijo de factura" htmlFor="s-prefix" hint="Ej: F- → F-2026-001">
            <Input
              id="s-prefix"
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value)}
              disabled={!isAdmin}
              maxLength={12}
            />
          </Field>

          <div className="border-t border-slate-200 pt-5 mt-1">
            <h3 className="font-medium text-slate-900 mb-1">Datos para la factura PDF</h3>
            <p className="text-sm text-slate-500 mb-4">
              Aparecen en el encabezado del PDF que se le envía al cliente.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Dirección" htmlFor="s-address">
                  <Input
                    id="s-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Av. Corrientes 1234, CABA"
                  />
                </Field>
              </div>
              <Field label="Teléfono" htmlFor="s-phone">
                <Input
                  id="s-phone"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="+54 11 4321-8888"
                />
              </Field>
              <Field label="CUIT / CIF" htmlFor="s-taxid">
                <Input
                  id="s-taxid"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="30-12345678-9"
                />
              </Field>
              <Field label="Email de la empresa" htmlFor="s-company-email">
                <Input
                  id="s-company-email"
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="facturacion@miempresa.com"
                />
              </Field>
              <Field label="Sitio web" htmlFor="s-website">
                <Input
                  id="s-website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="https://miempresa.com"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notas del pie de factura" htmlFor="s-inv-notes" hint="Opcional">
                  <Textarea
                    id="s-inv-notes"
                    rows={2}
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Transferir a la cuenta 123-456. Gracias por su compra."
                  />
                </Field>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="flex justify-end pt-2">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          )}
        </form>
      )}

      {/* ============================ PIPELINE ============================ */}
      {tab === "pipeline" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Etapas del pipeline</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  El orden aquí es el orden de las columnas. No puedes eliminar etapas que
                  tengan oportunidades.
                </p>
              </div>
              {isAdmin && (
                <Button type="button" variant="secondary" size="sm" onClick={addStage}>
                  + Añadir etapa
                </Button>
              )}
            </div>

            {stageError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
                {stageError}
              </div>
            )}

            <ul className="space-y-2">
              {stages.map((stage, i) => (
                <li
                  key={stage.id || `new-${i}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
                >
                  {/* order buttons */}
                  <div className="flex items-center gap-1 shrink-0 order-2 sm:order-1">
                    <button
                      type="button"
                      onClick={() => moveStage(i, -1)}
                      disabled={!isAdmin || i === 0}
                      aria-label={`Mover ${stage.label} arriba`}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStage(i, 1)}
                      disabled={!isAdmin || i === stages.length - 1}
                      aria-label={`Mover ${stage.label} abajo`}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>

                  {/* colour */}
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => updateStage(i, { color: e.target.value })}
                    disabled={!isAdmin}
                    aria-label={`Color de ${stage.label}`}
                    className="order-1 sm:order-2 w-9 h-9 shrink-0 rounded cursor-pointer border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed"
                  />

                  {/* label */}
                  <div className="flex-1 min-w-0 order-3">
                    <label htmlFor={`stage-label-${i}`} className="sr-only">
                      Nombre de la etapa {i + 1}
                    </label>
                    <Input
                      id={`stage-label-${i}`}
                      value={stage.label}
                      onChange={(e) => updateStage(i, { label: e.target.value })}
                      disabled={!isAdmin}
                      maxLength={30}
                    />
                  </div>

                  {/* probability */}
                  <div className="w-full sm:w-32 order-4">
                    <label htmlFor={`stage-prob-${i}`} className="sr-only">
                      Probabilidad de {stage.label}
                    </label>
                    <div className="relative">
                      <Input
                        id={`stage-prob-${i}`}
                        type="number"
                        min="0"
                        max="100"
                        value={stage.probability}
                        onChange={(e) =>
                          updateStage(i, { probability: Number(e.target.value) || 0 })
                        }
                        disabled={!isAdmin}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>

                  {/* remove */}
                  <button
                    type="button"
                    onClick={() => removeStage(i)}
                    disabled={!isAdmin}
                    aria-label={`Eliminar etapa ${stage.label}`}
                    className="order-5 p-2 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 shrink-0 self-start sm:self-auto"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>

            {isAdmin && (
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmReset(true)}
                >
                  Descartar cambios
                </Button>
                <Button type="button" variant="primary" onClick={savePipeline} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar pipeline"}
                </Button>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Vista previa</h2>
            <p className="text-sm text-slate-500">Así es como verá el equipo el pipeline.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {stages.map((s, i) => (
                <span
                  key={s.id || `prev-${i}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {s.label || "Sin nombre"}
                  <span className="opacity-80">{s.probability}%</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================= EQUIPO ============================= */}
      {/* ============================ DELIVERY ============================ */}
      {tab === "delivery" && (
        <div className="space-y-5">
          {!isAdmin && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Solo un administrador puede ver y modificar la configuración de envío.
            </div>
          )}

          <p className="text-sm text-slate-500">
            Configurá cómo se envían las facturas a tus clientes. Las contraseñas se guardan cifradas y nunca se
            muestran completas.
          </p>

          {/* ---------------- Email (SMTP) ---------------- */}
          <form
            className="card p-5 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setTestResult(null);
              try {
                await save({ smtp, publicUrl: publicUrl.trim() });
                flash("ok", "Configuración de email guardada");
              } catch (err: any) {
                flash("err", err.message || "No se pudo guardar");
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Envío por email (SMTP)</h2>
                <p className="text-sm text-slate-500">
                  Usá el servidor de correo de tu proveedor. Gmail: smtp.gmail.com · puerto 465.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isAdmin || testingSmtp || !smtp.host}
                onClick={async () => {
                  setTestingSmtp(true);
                  setTestResult(null);
                  try {
                    // Persist first so the test runs against exactly these values.
                    await save({ smtp });
                    const res: any = await api.post("settings/smtp/test", {});
                    setTestResult({ kind: "ok", text: res.data?.detail || "Conexión correcta" });
                  } catch (err: any) {
                    setTestResult({ kind: "err", text: err.message || "No se pudo probar la conexión" });
                  } finally {
                    setTestingSmtp(false);
                  }
                }}
              >
                {testingSmtp ? "Probando…" : "Probar conexión"}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Servidor" htmlFor="s-smtp-host" required>
                <Input
                  id="s-smtp-host"
                  value={smtp.host}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                />
              </Field>
              <Field label="Puerto" htmlFor="s-smtp-port" required>
                <Input
                  id="s-smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={String(smtp.port)}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
                />
              </Field>
              <Field label="Usuario" htmlFor="s-smtp-user">
                <Input
                  id="s-smtp-user"
                  value={smtp.user}
                  disabled={!isAdmin}
                  autoComplete="off"
                  onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                  placeholder="facturacion@miempresa.com"
                />
              </Field>
              <Field
                label="Contraseña"
                htmlFor="s-smtp-pass"
                hint={smtp.password ? "Guardada. Escribí para cambiarla." : "Se guarda cifrada"}
              >
                <Input
                  id="s-smtp-pass"
                  type="password"
                  value={smtp.password}
                  disabled={!isAdmin}
                  autoComplete="new-password"
                  onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                  placeholder="••••••••"
                />
              </Field>
              <Field label="Seguridad" htmlFor="s-smtp-secure">
                <Select
                  id="s-smtp-secure"
                  value={smtp.secure}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, secure: e.target.value as any })}
                >
                  <option value="ssl">SSL/TLS (puerto 465)</option>
                  <option value="starttls">STARTTLS (puerto 587)</option>
                  <option value="none">Sin cifrado</option>
                </Select>
              </Field>
              <Field label="Remitente" htmlFor="s-smtp-from" hint="Email que verá el cliente">
                <Input
                  id="s-smtp-from"
                  type="email"
                  value={smtp.from}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
                  placeholder="facturacion@miempresa.com"
                />
              </Field>
              <Field label="Nombre del remitente" htmlFor="s-smtp-fromname">
                <Input
                  id="s-smtp-fromname"
                  value={smtp.fromName}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })}
                  placeholder="Mi Empresa S.A."
                />
              </Field>
              <Field label="Responder a" htmlFor="s-smtp-reply" hint="Opcional">
                <Input
                  id="s-smtp-reply"
                  type="email"
                  value={smtp.replyTo}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, replyTo: e.target.value })}
                  placeholder="ventas@miempresa.com"
                />
              </Field>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-400">
                Las claves se cifran con una clave derivada de JWT_SECRET.
              </p>
              <Button type="submit" variant="primary" size="sm" disabled={!isAdmin || saving}>
                {saving ? "Guardando…" : "Guardar email"}
              </Button>
            </div>
          </form>

          {/* ---------------- WhatsApp ---------------- */}
          <form
            className="card p-5 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setTestResult(null);
              try {
                await save({ whatsapp, publicUrl: publicUrl.trim() });
                flash("ok", "Configuración de WhatsApp guardada");
              } catch (err: any) {
                flash("err", err.message || "No se pudo guardar");
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Envío por WhatsApp</h2>
                <p className="text-sm text-slate-500">
                  Evolution API es la opción recomendada: sin costo por mensaje. Cloud API es la oficial de Meta.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isAdmin || testingWhatsapp}
                onClick={async () => {
                  setTestingWhatsapp(true);
                  setTestResult(null);
                  try {
                    await save({ whatsapp });
                    const res: any = await api.post("settings/whatsapp/test", {});
                    setTestResult({ kind: "ok", text: res.data?.detail || "Conexión correcta" });
                  } catch (err: any) {
                    setTestResult({ kind: "err", text: err.message || "No se pudo probar la conexión" });
                  } finally {
                    setTestingWhatsapp(false);
                  }
                }}
              >
                {testingWhatsapp ? "Probando…" : "Probar conexión"}
              </Button>
            </div>

            <fieldset disabled={!isAdmin}>
              <legend className="field-label mb-2">Proveedor</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    whatsapp.mode === "evolution"
                      ? "border-primary-500 ring-2 ring-primary-100 bg-primary-50/40"
                      : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="wa-mode"
                    className="mt-0.5"
                    checked={whatsapp.mode === "evolution"}
                    onChange={() => setWhatsapp({ ...whatsapp, mode: "evolution" })}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">Evolution API</span>
                    <span className="block text-xs text-slate-500">
                      Autoalojada, sin costo por mensaje. Adjunta el PDF.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    whatsapp.mode === "cloud"
                      ? "border-primary-500 ring-2 ring-primary-100 bg-primary-50/40"
                      : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="wa-mode"
                    className="mt-0.5"
                    checked={whatsapp.mode === "cloud"}
                    onChange={() => setWhatsapp({ ...whatsapp, mode: "cloud" })}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">Cloud API (Meta)</span>
                    <span className="block text-xs text-slate-500">
                      Oficial y escalable. Comparte el PDF como enlace.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {whatsapp.mode === "evolution" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="URL de Evolution API" htmlFor="s-wa-url" required>
                  <Input
                    id="s-wa-url"
                    value={whatsapp.url}
                    disabled={!isAdmin}
                    onChange={(e) => setWhatsapp({ ...whatsapp, url: e.target.value })}
                    placeholder="http://localhost:8080"
                  />
                </Field>
                <Field label="Instancia" htmlFor="s-wa-instance" required>
                  <Input
                    id="s-wa-instance"
                    value={whatsapp.instance}
                    disabled={!isAdmin}
                    onChange={(e) => setWhatsapp({ ...whatsapp, instance: e.target.value })}
                    placeholder="crm"
                  />
                </Field>
                <Field
                  label="API Key"
                  htmlFor="s-wa-apikey"
                  required
                  hint={whatsapp.apiKey ? "Guardada cifrada" : ""}
                >
                  <Input
                    id="s-wa-apikey"
                    type="password"
                    value={whatsapp.apiKey}
                    disabled={!isAdmin}
                    autoComplete="new-password"
                    onChange={(e) => setWhatsapp({ ...whatsapp, apiKey: e.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone Number ID" htmlFor="s-wa-phoneid" required>
                  <Input
                    id="s-wa-phoneid"
                    value={whatsapp.phoneNumberId}
                    disabled={!isAdmin}
                    onChange={(e) => setWhatsapp({ ...whatsapp, phoneNumberId: e.target.value })}
                  />
                </Field>
                <Field
                  label="Token de acceso"
                  htmlFor="s-wa-token"
                  required
                  hint={whatsapp.token ? "Guardado cifrado" : ""}
                >
                  <Input
                    id="s-wa-token"
                    type="password"
                    value={whatsapp.token}
                    disabled={!isAdmin}
                    autoComplete="new-password"
                    onChange={(e) => setWhatsapp({ ...whatsapp, token: e.target.value })}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    label="URL pública del CRM"
                    htmlFor="s-public-url"
                    hint="Necesaria para compartir el PDF por enlace en Cloud API"
                  >
                    <Input
                      id="s-public-url"
                      type="url"
                      value={publicUrl}
                      disabled={!isAdmin}
                      onChange={(e) => setPublicUrl(e.target.value)}
                      placeholder="https://crm.miempresa.com"
                    />
                  </Field>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-400">
                Los secretos se guardan cifrados y no se devuelven al navegador.
              </p>
              <Button type="submit" variant="primary" size="sm" disabled={!isAdmin || saving}>
                {saving ? "Guardando…" : "Guardar WhatsApp"}
              </Button>
            </div>
          </form>

          {testResult && (
            <div
              role="alert"
              className={`p-3 rounded-lg border text-sm ${
                testResult.kind === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {testResult.text}
            </div>
          )}
        </div>
      )}

      {tab === "team" && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Equipo y roles</h2>
          <p className="text-sm text-slate-500 mb-4">
            La gestión completa de usuarios está en esta sección.
          </p>

          <dl>
            <DetailRow label="Tu rol">
              <span className={`badge ${isAdmin ? "badge-info" : "badge-neutral"}`}>
                {isAdmin ? "Administrador" : "Vendedor"}
              </span>
            </DetailRow>
            <DetailRow label="Puedes gestionar">
              {isAdmin
                ? "Configuración general, pipeline y usuarios"
                : "Solo lectura — contacta a un administrador"}
            </DetailRow>
            <DetailRow label="Etapas activas">{settings.stages.length}</DetailRow>
            <DetailRow label="Moneda">{settings.currency}</DetailRow>
          </dl>

          <div className="mt-4 pt-4 border-t border-slate-200 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => reload()}>
              Recargar configuración
            </Button>
            {isAdmin && (
              <Button type="button" variant="primary" onClick={() => navigate("/settings/users")}>
                Gestionar usuarios →
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Discard changes */}
      <Modal
        open={confirmReset}
        title="Descartar cambios"
        onClose={() => setConfirmReset(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={() => {
                setStages(settings.stages);
                setStageError("");
                setConfirmReset(false);
              }}
            >
              Descartar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Se perderán las modificaciones sin guardar del pipeline.
        </p>
      </Modal>
    </div>
  );
};

export default SettingsPage;
