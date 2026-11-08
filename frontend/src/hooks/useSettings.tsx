import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { api } from "../services/api";
import { stageBadgeFor } from "../lib/format";
import { useAuth } from "./useAuth";

export interface Stage {
  id: string;
  label: string;
  probability: number;
  color: string;
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  /** Masked by the backend; sending it back unchanged keeps the stored secret. */
  password: string;
  secure: "none" | "starttls" | "ssl";
  from: string;
  fromName: string;
  replyTo: string;
}

export interface WhatsappSettings {
  mode: "evolution" | "cloud";
  url: string;
  instance: string;
  apiKey: string;
  phoneNumberId: string;
  token: string;
}

export interface Settings {
  companyName: string;
  currency: string;
  taxRate: number;
  invoicePrefix: string;
  stages: Stage[];
  // Company identity — rendered on the invoice PDF
  address: string;
  phone: string;
  email: string;
  taxId: string;
  website: string;
  invoiceNotes: string;
  /** Public base URL, needed to share PDF links through WhatsApp Cloud API. */
  publicUrl: string;
  smtp: SmtpSettings;
  whatsapp: WhatsappSettings;
}

/** Fallback used on first paint so forms never render with an empty stage list. */
const FALLBACK: Settings = {
  companyName: "CRM Pro",
  currency: "USD",
  taxRate: 21,
  invoicePrefix: "F-",
  address: "",
  phone: "",
  email: "",
  taxId: "",
  website: "",
  invoiceNotes: "",
  publicUrl: "",
  smtp: {
    host: "",
    port: 587,
    user: "",
    password: "",
    secure: "ssl",
    from: "",
    fromName: "",
    replyTo: "",
  },
  whatsapp: {
    mode: "evolution",
    url: "",
    instance: "",
    apiKey: "",
    phoneNumberId: "",
    token: "",
  },
  stages: [
    { id: "PROSPECTING", label: "Prospección", probability: 10, color: "#64748b" },
    { id: "QUALIFIED", label: "Calificado", probability: 30, color: "#0284c7" },
    { id: "PROPOSAL", label: "Propuesta", probability: 50, color: "#2563eb" },
    { id: "NEGOTIATION", label: "Negociación", probability: 70, color: "#d97706" },
    { id: "WINNING", label: "Ganado", probability: 90, color: "#16a34a" },
    { id: "LOST", label: "Perdido", probability: 0, color: "#dc2626" },
  ],
};

interface SettingsContextType {
  settings: Settings;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<void>;
  /** Ordered stage ids — replacement for the hardcoded STAGES list. */
  stages: Stage[];
  /** label for a stage id — falls back to the raw id if it was removed. */
  stageLabel: (id?: string | null) => string;
  stageColor: (id?: string | null) => string;
  stageBadge: (id?: string | null) => string;
  /** undefined when the stage id is unknown, so callers can fall back. */
  stageProbability: (id?: string | null) => number | undefined;
  stage: (id?: string | null) => Stage | undefined;
  /** Position in the pipeline, or -1 when the stage no longer exists. */
  stageIndex: (id?: string | null) => number;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<Settings>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setSettings(FALLBACK);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get("settings");
      if (res?.data) setSettings({ ...FALLBACK, ...res.data });
    } catch (e: any) {
      // Keep the fallback so the app stays usable; surface the reason.
      setError(e.message || "No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(
    async (patch: Partial<Settings>) => {
      const res: any = await api.put("settings", patch);
      if (res?.data) setSettings({ ...FALLBACK, ...res.data });
    },
    []
  );

  const value = useMemo<SettingsContextType>(() => {
    const byId = new Map(settings.stages.map((s) => [s.id, s]));
    const indexOf = (id?: string | null) =>
      id ? settings.stages.findIndex((s) => s.id === id) : -1;
    return {
      settings,
      loading,
      error,
      reload,
      save,
      stages: settings.stages,
      stage: (id) => (id ? byId.get(id) : undefined),
      stageIndex: indexOf,
      stageLabel: (id) => (id ? byId.get(id)?.label || id : "—"),
      stageColor: (id) => (id ? byId.get(id)?.color || "#64748b" : "#64748b"),
      stageBadge: (id) => stageBadgeFor(id, byId.get(id || "")?.probability),
      stageProbability: (id) => byId.get(id || "")?.probability,
    };
  }, [settings, loading, error, reload, save]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export default SettingsProvider;
