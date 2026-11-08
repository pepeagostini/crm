import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/companies",
    label: "Empresas",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h4a2 2 0 0 1 2 2v10" />
        <path d="M9 7h2M9 11h2M9 15h2" />
      </svg>
    ),
  },
  {
    to: "/deals",
    label: "Oportunidades",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 17l6-6 4 4 7-7" />
        <path d="M14 8h6v6" />
      </svg>
    ),
  },
  {
    to: "/tasks",
    label: "Tareas",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M9 11l3 3 8-8" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    to: "/contacts",
    label: "Contactos",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
      </svg>
    ),
  },
  {
    to: "/invoices",
    label: "Facturas",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    to: "/activities",
    label: "Actividades",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    to: "/reports",
    label: "Reportes",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 4 3 5-6" />
      </svg>
    ),
  },
  {
    to: "/help",
    label: "Ayuda",
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.2 9.2a2.8 2.8 0 0 1 5.5.8c0 1.9-2.8 2.8-2.8 2.8" strokeLinecap="round" />
        <path d="M12 17.2h.01" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Ajustes",
    adminOnly: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/companies": "Empresas",
  "/deals": "Oportunidades",
  "/invoices": "Facturas",
  "/activities": "Actividades",
  "/contacts": "Contactos",
  "/tasks": "Tareas",
  "/settings": "Ajustes",
  "/settings/users": "Usuarios",
  "/reports": "Reportes",
  "/help": "Ayuda",
  "/login": "Iniciar sesión",
};

const Layout: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [pendingTasks, setPendingTasks] = useState(0);

  // Pending task count for the sidebar badge.
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    api
      .get<any>("tasks")
      .then((r) => {
        if (alive) setPendingTasks((r.data || []).filter((t: any) => t.status !== "done").length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAuthenticated, location.pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const isAdmin = user?.role === "ADMIN";
  const title = pageTitles[location.pathname] || "CRM Pro";

  // RequireAuth already guarantees a session; this is a last-resort guard so
  // the shell never renders an empty main area.
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* ========== Sidebar ========== */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-sidebar text-slate-300
          transition-transform duration-200 ease-out
          lg:sticky lg:top-0 lg:bottom-auto lg:h-screen lg:translate-x-0 lg:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Navegación principal"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 h-16 shrink-0 px-5 border-b border-white/10">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-lg">
            C
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-white font-semibold text-[15px] truncate">CRM Pro</p>
            <p className="text-slate-400 text-xs truncate">Gestión comercial</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-active text-white"
                    : "hover:bg-sidebar-hover hover:text-white"
                }`
              }
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
              {item.to === "/tasks" && pendingTasks > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary-600 text-white text-xs font-semibold">
                  {pendingTasks}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User card — normal flow at the bottom (mt-auto), no absolute positioning */}
        <div className="shrink-0 mt-auto p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-primary-500/20 text-primary-300 flex items-center justify-center font-semibold text-sm">
              {(user?.name || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">
                {user?.name || "Usuario"}
              </p>
              <p className="text-slate-400 text-xs truncate">{user?.email}</p>
            </div>
            {isAdmin && (
              <span
                className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-primary-500/20 text-primary-300"
                title="Rol de usuario"
              >
                Admin
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ========== Main column ========== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header className="h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between gap-3 px-4 lg:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile menu button */}
            <button
              type="button"
              className="lg:hidden shrink-0 p-2 -ml-2 rounded-lg hover:bg-slate-100"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={sidebarOpen}
            >
              <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sidebarOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAdmin && (
              <span className="badge badge-info hidden md:inline-flex" title="Rol de usuario">
                Administrador
              </span>
            )}
            <button
              type="button"
              onClick={logout}
              className="btn btn-secondary btn-sm whitespace-nowrap"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Page content */}
        <main id="main" className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
