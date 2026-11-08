import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { Button } from "../components/Button";
import { Field, Input } from "../components/Form";

/** Shape of one credential descriptor returned by GET /api/install/status. */
type ProviderField = {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean";
  default?: string | number | boolean;
  placeholder?: string;
  hint?: string;
};

type Provider = {
  id: string;
  label: string;
  description: string;
  needsServer: boolean;
  fields: ProviderField[];
};

type Step = 1 | 2 | 3;

const STEP_LABELS = ["Base de datos", "Credenciales", "Instalar"] as const;

/**
 * Quick database installation wizard.
 *
 * Three steps: pick the engine, fill in the credentials, run the install.
 * The backend creates the database, the schema and the admin account, so the
 * admin never touches a terminal or a schema file.
 */
export const InstallPage: React.FC = () => {
  const navigate = useNavigate();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("sqlite");
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [migrateExisting, setMigrateExisting] = useState(true);

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState("");
  const [installResult, setInstallResult] = useState<any>(null);
  const [alreadyConfigured, setAlreadyConfigured] = useState<{ provider: string; url: string } | null>(null);

  // Load the provider catalogue and find out if we can migrate existing data.
  useEffect(() => {
    (async () => {
      try {
        const res: any = await api.get("install/status");
        const data = res.data || {};
        if (data.configured) {
          setAlreadyConfigured({ provider: data.provider, url: data.url });
        }
        setProviders(data.providers || []);
      } catch (err: any) {
        setError(err.message || "No se pudo contactar con el servidor");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const provider = useMemo(
    () => providers.find((p) => p.id === providerId) || null,
    [providers, providerId]
  );

  /** Seeds the form with each provider's defaults whenever the engine changes. */
  const applyDefaults = useCallback((next: Provider | null) => {
    if (!next) return;
    const seeded: Record<string, string | number | boolean> = {};
    for (const field of next.fields) {
      seeded[field.key] =
        field.type === "boolean" ? Boolean(field.default) : (field.default ?? "");
    }
    setValues(seeded);
    setTestResult("");
    setError("");
    setFieldErrors({});
  }, []);

  useEffect(() => {
    if (provider && Object.keys(values).length === 0) applyDefaults(provider);
  }, [provider, values, applyDefaults]);

  const selectProvider = (id: string) => {
    setProviderId(id);
    applyDefaults(providers.find((p) => p.id === id) || null);
  };

  const set = (key: string, value: string | boolean) => setValues((v) => ({ ...v, [key]: value }));

  const payload = useCallback(
    () => ({ provider: providerId, ...values }),
    [providerId, values]
  );

  // ---- Step 2: validate the credentials against the real server ----
  const runTest = async () => {
    setTesting(true);
    setError("");
    setFieldErrors({});
    setTestResult("");
    try {
      const res: any = await api.post("install/test", payload());
      setTestResult(res.data?.detail || "Conexión correcta");
      setStep(3);
    } catch (err: any) {
      setError(err.message || "No se pudo probar la conexión");
      if (err.fields) setFieldErrors(err.fields);
    } finally {
      setTesting(false);
    }
  };

  // ---- Step 3: create the database ----
  const runInstall = async () => {
    setInstalling(true);
    setError("");
    setFieldErrors({});
    try {
      const res: any = await api.post("install/run", { ...payload(), migrateExisting });
      setInstallResult(res.data || {});
    } catch (err: any) {
      setError(err.message || "No se pudo completar la instalación");
      if (err.fields) setFieldErrors(err.fields);
    } finally {
      setInstalling(false);
    }
  };

  if (loading) {
    return (
      <Centered>
        <p className="text-slate-500">Cargando instalador…</p>
      </Centered>
    );
  }

  // Already installed: never let the wizard overwrite a working database.
  if (alreadyConfigured) {
    return (
      <Centered>
        <div className="w-full max-w-lg card p-8">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">El CRM ya está instalado</h1>
          <p className="text-sm text-slate-600 mb-4">
            La base de datos actual es <strong>{alreadyConfigured.provider}</strong> y responde en{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{alreadyConfigured.url}</code>.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Para cambiarla de nuevo, define <code className="text-xs">CRM_DB_PROVIDER</code> y{" "}
            <code className="text-xs">DATABASE_URL</code> en el archivo <code className="text-xs">.env</code> del
            backend y reinicia el servidor.
          </p>
          <Button variant="primary" onClick={() => navigate("/login")}>
            Ir al inicio de sesión
          </Button>
        </div>
      </Centered>
    );
  }

  if (installResult) {
    const counts = installResult.counts || {};
    const total = Object.values(counts).reduce((a: any, b: any) => a + Number(b || 0), 0) as number;
    const skipped = installResult.skipped || [];
    return (
      <Centered>
        <div className="w-full max-w-lg card p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <h1 className="text-xl font-semibold text-slate-900">Instalación completada</h1>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            La base de datos <strong>{installResult.provider}</strong> se creó correctamente con {total} registro
            {total === 1 ? "" : "s"}
            {installResult.migrated ? " migrados desde el almacenamiento anterior" : ""}.
          </p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-6">
            {Object.entries(counts).map(([key, value]) => (
              <div key={key} className="flex justify-between border-b border-slate-100 py-1">
                <dt className="text-slate-500 capitalize">{key}</dt>
                <dd className="tabular-nums font-medium text-slate-900">{String(value)}</dd>
              </div>
            ))}
          </dl>

          {skipped.length > 0 && (
            <div className="mb-6 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <strong>{skipped.length} registro(s)</strong> no se pudieron guardar por datos duplicados. El resto
              del CRM funciona con normalidad.
            </div>
          )}

          <p className="text-sm text-slate-500 mb-5">
            Ya puedes iniciar sesión con el usuario administrador por defecto.
          </p>
          <Button variant="primary" onClick={() => navigate("/login")}>
            Ir al inicio de sesión
          </Button>
        </div>
      </Centered>
    );
  }

  const canContinue = provider && (!provider.needsServer || hasRequiredFields(provider, values));

  return (
    <Centered>
      <div className="w-full max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Instalación del CRM</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configura el almacenamiento en menos de un minuto. El sistema crea la base de datos, las tablas y el
            usuario administrador por ti.
          </p>
        </header>

        {/* Stepper */}
        <ol className="flex items-center gap-2 mb-6" aria-label="Progreso de la instalación">
          {STEP_LABELS.map((label, index) => {
            const n = (index + 1) as Step;
            const state = step === n ? "current" : step > n ? "done" : "todo";
            return (
              <li key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    state === "current"
                      ? "bg-primary-600 text-white"
                      : state === "done"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {state === "done" ? "✓" : n}
                </span>
                <span
                  className={`text-sm hidden sm:inline ${
                    state === "current" ? "text-slate-900 font-medium" : "text-slate-500"
                  }`}
                >
                  {label}
                </span>
                {n < 3 && <span aria-hidden="true" className="flex-1 h-px bg-slate-200 ml-1" />}
              </li>
            );
          })}
        </ol>

        {error && (
          <div
            className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Step 1 — choose the engine */}
        {step === 1 && (
          <section className="card p-5">
            <h2 className="text-base font-medium text-slate-900 mb-1">¿Dónde guardamos los datos?</h2>
            <p className="text-sm text-slate-500 mb-4">
              Si no tienes claro cuál elegir, empieza con SQLite: no necesita servidor ni credenciales.
            </p>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Base de datos">
              {providers.map((p) => {
                const active = p.id === providerId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectProvider(p.id)}
                    className={`text-left p-4 rounded-lg border transition ${
                      active
                        ? "border-primary-500 ring-2 ring-primary-100 bg-primary-50/40"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{p.label}</span>
                      {!p.needsServer && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          Sin configurar
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-500 mt-1">{p.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end mt-6">
              <Button
                variant="primary"
                onClick={() => setStep(2)}
                disabled={!provider}
              >
                Continuar
              </Button>
            </div>
          </section>
        )}

        {/* Step 2 — credentials */}
        {step === 2 && provider && (
          <section className="card p-5">
            <h2 className="text-base font-medium text-slate-900 mb-1">
              {provider.needsServer ? "Credenciales de conexión" : "Ubicación del archivo"}
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              {provider.needsServer
                ? `Completa los datos de tu servidor ${provider.label}. Si la base de datos todavía no existe, el sistema la crea por ti.`
                : "SQLite guarda todo en un único archivo. Puedes cambiar la ruta si quieres."}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {provider.fields.map((field) => {
                if (field.type === "boolean") {
                  return (
                    <label key={field.key} className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={Boolean(values[field.key])}
                        onChange={(e) => set(field.key, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      {field.label}
                    </label>
                  );
                }
                return (
                  <div
                    key={field.key}
                    className={field.type === "password" || field.key === "host" ? "sm:col-span-2" : ""}
                  >
                    <Field
                      label={field.label}
                      htmlFor={`f-${field.key}`}
                      hint={field.hint}
                      error={fieldErrors[field.key] || ""}
                    >
                      <Input
                        id={`f-${field.key}`}
                        type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
                        value={String(values[field.key] ?? "")}
                        placeholder={field.placeholder}
                        invalid={!!fieldErrors[field.key]}
                        onChange={(e) => set(field.key, e.target.value)}
                        autoComplete={field.type === "password" ? "new-password" : "off"}
                      />
                    </Field>
                  </div>
                );
              })}
            </div>

            <label className="flex items-start gap-2 mt-5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={migrateExisting}
                onChange={(e) => setMigrateExisting(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                Importar los datos que ya existen
                <span className="block text-xs text-slate-500">
                  Migra empresas, contactos, oportunidades, facturas, tareas y actividades al almacenamiento nuevo.
                </span>
              </span>
            </label>

            <div className="flex justify-between mt-6">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button variant="primary" onClick={runTest} disabled={!canContinue || testing}>
                {testing ? "Probando…" : "Probar conexión"}
              </Button>
            </div>
          </section>
        )}

        {/* Step 3 — confirm and install */}
        {step === 3 && provider && (
          <section className="card p-5">
            <h2 className="text-base font-medium text-slate-900 mb-1">Todo listo</h2>
            <p className="text-sm text-slate-500 mb-4">
              La conexión funcionó. Al instalar, el sistema creará las tablas, los índices y el usuario
              administrador.
            </p>

            <dl className="rounded-lg bg-slate-50 border border-slate-200 divide-y divide-slate-100 mb-5">
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <dt className="text-slate-500">Base de datos</dt>
                <dd className="font-medium text-slate-900">{provider.label}</dd>
              </div>
              {testResult && (
                <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <dt className="text-slate-500">Conexión</dt>
                  <dd className="text-emerald-700">{testResult}</dd>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <dt className="text-slate-500">Importar datos existentes</dt>
                <dd className="font-medium text-slate-900">{migrateExisting ? "Sí" : "No"}</dd>
              </div>
            </dl>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Atrás
              </Button>
              <Button variant="primary" onClick={runInstall} disabled={installing}>
                {installing ? "Instalando…" : "Instalar ahora"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </Centered>
  );
};

/** Every credential field (except flags) must be filled before continuing. */
function hasRequiredFields(
  provider: Provider,
  values: Record<string, string | number | boolean>
): boolean {
  if (!provider.needsServer) return true;
  return provider.fields
    .filter((f) => f.type !== "boolean")
    .every((f) => String(values[f.key] ?? "").trim() !== "");
}

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 flex items-start justify-center px-4 py-10 sm:py-16">
    {children}
  </div>
);

export default InstallPage;