import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();

  // Already signed in → never render the login form again
  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response: any = await api.post("auth/login", { email, password });

      if (response.success && response.token) {
        // Push the token into the auth context so the whole app re-renders
        // as authenticated — writing localStorage alone left the context stale
        // and the router bounced straight back to /login.
        const user = login(response.token);
        if (!user) {
          setError("No se pudo leer la sesión. Intenta de nuevo.");
          return;
        }
        navigate("/", { replace: true });
      } else {
        setError(response.message || "Credenciales inválidas");
      }
    } catch (err: any) {
      setError(err.message || "Error inesperado. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar relative overflow-hidden flex-col justify-between p-12">
        {/* Decorative glow */}
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary-600/30 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-40 -right-24 w-96 h-96 rounded-full bg-primary-500/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-xl">
            C
          </div>
          <span className="text-white text-xl font-semibold">CRM Pro</span>
        </div>

        <div className="relative">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Gestiona tus ventas
            <br />
            <span className="text-primary-400">de forma profesional</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-md">
            Pipeline de oportunidades, contactos, facturación y reportes — todo
            en un solo lugar para tu equipo.
          </p>
        </div>

        <div className="relative flex gap-8 text-slate-400 text-sm">
          <div>
            <p className="text-white text-2xl font-semibold">5-20</p>
            <p>usuarios por equipo</p>
          </div>
          <div>
            <p className="text-white text-2xl font-semibold">100%</p>
            <p>en la nube</p>
          </div>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-lg">
              C
            </div>
            <span className="text-xl font-semibold text-slate-900">CRM Pro</span>
          </div>

          <div className="card p-8">
            <h1 className="text-2xl font-semibold text-slate-900 mb-1">
              Bienvenido de nuevo
            </h1>
            <p className="text-slate-500 text-sm mb-6">
              Inicia sesión para acceder a tu panel
            </p>

            {error && (
              <div
                className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="field-label">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field-input"
                  placeholder="tu@empresa.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="field-label">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
                data-cta="submit"
              >
                {loading ? "Iniciando sesión…" : "Iniciar sesión"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            © {new Date().getFullYear()} CRM Pro — Sistema de gestión para
            pequeñas empresas
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
