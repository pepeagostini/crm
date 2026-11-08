import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";

/**
 * Redirects to /install while the CRM has no database configured.
 *
 * The check runs once per mount and is deliberately forgiving: if the status
 * endpoint cannot be reached we render the children, because blocking the whole
 * app on a network hiccup would be worse than showing a warning.
 */
export const NeedsInstall: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "unreachable">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.get("install/status");
        const configured = Boolean(res.data?.configured);
        if (cancelled) return;
        if (!configured) {
          navigate("/install", { replace: true });
          return;
        }
        setState("ready");
      } catch {
        if (!cancelled) setState("unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-500">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
            <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span>Comprobando la configuración…</span>
        </div>
      </div>
    );
  }

  // The status call failed: show a hint plus a manual retry rather than a blank page.
  if (state === "unreachable") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="card p-6 max-w-md text-center">
          <h1 className="text-base font-semibold text-slate-900 mb-2">No se pudo contactar con el servidor</h1>
          <p className="text-sm text-slate-600 mb-4">
            Asegúrate de que el backend esté ejecutándose en el puerto 4000 y vuelve a intentarlo.
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
              onClick={() => {
                window.location.href = "/install";
              }}
            >
              Ir al instalador
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default NeedsInstall;