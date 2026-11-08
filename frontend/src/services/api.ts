const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

/** Session-expired hook — set by AuthProvider so we can redirect without importing React. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  onUnauthorized = handler;
};

// Backend messages are English; the UI is Spanish. Map the ones users can see.
const message_es: Record<string, string> = {
  "Invalid credentials": "Correo o contraseña incorrectos",
  "Session expired": "Tu sesión ha expirado. Inicia sesión de nuevo.",
  "Invalid token": "Tu sesión no es válida. Inicia sesión de nuevo.",
  "Authentication required": "Inicia sesión para continuar",
  "Account disabled": "Esta cuenta está desactivada",
  "Account no longer exists": "Esta cuenta ya no existe",
  "Admin access required": "Se requiere acceso de administrador",
  "Name, email and password required": "Nombre, correo y contraseña son obligatorios",
  "Email and password required": "Correo y contraseña son obligatorios",
  "Password must be at least 6 characters": "La contraseña debe tener al menos 6 caracteres",
  "Email already registered": "Este correo ya está registrado",
  "Company name required": "El nombre de la empresa es obligatorio",
  "Deal name required": "El nombre de la oportunidad es obligatorio",
  "Invoice number and company required": "El número de factura y la empresa son obligatorios",
  "Type and title required": "El tipo y el título son obligatorios",
  "Company not found": "Empresa no encontrada",
  "Deal not found": "Oportunidad no encontrada",
  "Invoice not found": "Factura no encontrada",
  "Activity not found": "Actividad no encontrada",
};

const translate = (message: string) => message_es[message] || message;

// Read the token on every request — not once at module load,
// otherwise requests made right after login carry no Authorization header.
const authHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("crm_auth_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const request = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/${endpoint}`, {
      ...options,
      headers: authHeaders(),
      credentials: "omit",
    });
  } catch {
    // Network failure — do not treat as a session problem.
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = translate(errorData.message || `Request failed (${response.status})`);

    // 401/403 on a protected route = the session is gone. Drop it and let the
    // route guard send the user back to /login instead of looping on errors.
    if (response.status === 401 || response.status === 403) {
      const hadToken = !!localStorage.getItem("crm_auth_token");
      if (hadToken && endpoint !== "auth/login") {
        localStorage.removeItem("crm_auth_token");
        onUnauthorized?.();
      }
    }

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const api = {
  get: <T = any>(endpoint: string) => request<T>(endpoint, { method: "GET" }),
  post: <T = any, D = any>(endpoint: string, data: D) =>
    request<T>(endpoint, { method: "POST", body: JSON.stringify(data) }),
  put: <T = any, D = any>(endpoint: string, data: D) =>
    request<T>(endpoint, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T = any, D = any>(endpoint: string, data: D) =>
    request<T>(endpoint, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T = any>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
};

export const setAuthToken = (token: string) => {
  localStorage.setItem("crm_auth_token", token);
};

export const removeAuthToken = () => {
  localStorage.removeItem("crm_auth_token");
};
