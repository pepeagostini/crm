import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./hooks/useAuth";
import { SettingsProvider } from "./hooks/useSettings";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import InstallPage from "./pages/InstallPage";
import { NeedsInstall } from "./components/NeedsInstall";

// Pages are small enough that lazy-loading only adds a flash, so they stay static.
import DashboardPage from "./pages/DashboardPage";
import CompaniesPage from "./pages/CompaniesPage";
import CompanyDetailPage from "./pages/CompanyDetailPage";
import DealsPage from "./pages/DealsPage";
import DealDetailPage from "./pages/DealDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import ActivityDetailPage from "./pages/ActivityDetailPage";
import SettingsPage from "./pages/SettingsPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import ContactsPage from "./pages/ContactsPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import TasksPage from "./pages/TasksPage";
import HelpPage from "./pages/HelpPage";

const container = document.getElementById("root");
if (!container) {
  console.error("Root element not found");
  throw new Error("Root element not found");
}
const root = createRoot(container);

const Loading: React.FC<{ label?: string }> = ({ label = "Cargando…" }) => (
  <div className="flex items-center justify-center py-20 text-slate-500">
    <svg
      className="w-5 h-5 mr-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
    {label}
  </div>
);

const load = (node: React.ReactNode) => (
  <Suspense fallback={<Loading />}>{node}</Suspense>
);

const router = createBrowserRouter([
  {
    // Install lives OUTSIDE the app shell too: it is the only page reachable
    // before a database is configured.
    path: "/install",
    element: <InstallPage />,
  },
  {
    // Login lives OUTSIDE the app shell: it must never be painted
    // inside the dashboard layout.
    path: "/login",
    element: <NeedsInstall><LoginPage /></NeedsInstall>,
  },
  {
    path: "/",
    element: (
      <NeedsInstall>
        <RequireAuth>
          <Layout />
        </RequireAuth>
      </NeedsInstall>
    ),
    children: [
      { index: true, element: load(<DashboardPage />) },
      { path: "companies", element: load(<CompaniesPage />) },
      { path: "companies/:id", element: load(<CompanyDetailPage />) },
      { path: "deals", element: load(<DealsPage />) },
      { path: "deals/:id", element: load(<DealDetailPage />) },
      { path: "invoices", element: load(<InvoicesPage />) },
      { path: "invoices/:id", element: load(<InvoiceDetailPage />) },
      { path: "activities", element: load(<ActivitiesPage />) },
      { path: "activities/:id", element: load(<ActivityDetailPage />) },
      { path: "contacts", element: load(<ContactsPage />) },
      { path: "contacts/:id", element: load(<ContactDetailPage />) },
      { path: "tasks", element: load(<TasksPage />) },
      { path: "settings", element: load(<SettingsPage />) },
      { path: "settings/users", element: load(<UsersPage />) },
      { path: "reports", element: load(<ReportsPage />) },
      { path: "help", element: load(<HelpPage />) },
      { path: "dashboard", element: <Navigate to="/" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <RouterProvider router={router} />
      </SettingsProvider>
    </AuthProvider>
  </React.StrictMode>
);
