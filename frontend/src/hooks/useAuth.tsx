import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";
import { setUnauthorizedHandler } from "../services/api";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (token: string) => User | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Decode JWT payload in browser
const decodeJwt = (token: string): any => {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error decoding JWT:", error);
    return null;
  }
};

const userFromToken = (token: string | null): User | null => {
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload) return null;
  return {
    id: String(payload.sub || payload.id || payload.email || ""),
    name: payload.name || "Usuario",
    email: payload.email || "",
    role: payload.role || "VENDOR",
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialise synchronously from localStorage so the very first render is
  // already authenticated. A useEffect-based init caused a one-frame flash
  // that triggered the redirect back to /login right after signing in.
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem("crm_auth_token");
    const parsed = userFromToken(token);
    if (!parsed && token) localStorage.removeItem("crm_auth_token");
    return parsed;
  });

  const login = useCallback((token: string): User | null => {
    localStorage.setItem("crm_auth_token", token);
    const parsed = userFromToken(token);
    setUser(parsed);
    return parsed;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("crm_auth_token");
    localStorage.removeItem("crm_user");
    setUser(null);
  }, []);

  // If any request comes back 401/403, api.ts clears the token and calls this.
  // Re-reading localStorage here is a no-op when we are already signed out, so
  // it never fights with an explicit logout.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (localStorage.getItem("crm_auth_token")) {
        localStorage.removeItem("crm_auth_token");
      }
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: !!user, user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
