import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { accessTokenLifetime, api, type User } from "./api.client";
import { captureAnalyticsEvent, identifyAnalyticsUser, resetAnalyticsUser } from "../components/posthog-provider";

type AuthStatus = "loading" | "authenticated" | "anonymous";
type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<void>;
  completeOAuth: () => Promise<void>;
  getAccessToken: () => string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const accessToken = useRef<string | null>(null);
  const sessionAttempt = useRef(0);
  // When the access token expires (epoch ms); it is renewed a minute before.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const keepToken = useCallback((token: string | null) => {
    accessToken.current = token;
    const lifetime = token ? accessTokenLifetime(token) : null;
    setExpiresAt(lifetime === null ? null : Date.now() + lifetime * 1000);
  }, []);

  const restoreSession = useCallback(async () => {
    const attempt = ++sessionAttempt.current;
    try {
      const session = await api.refresh();
      if (attempt !== sessionAttempt.current) return;
      keepToken(session.accessToken);
      setUser(session.user);
      setStatus("authenticated");
      identifyAnalyticsUser(session.user.id);
    } catch {
      if (attempt !== sessionAttempt.current) return;
      keepToken(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, [keepToken]);

  useEffect(() => { void Promise.resolve().then(restoreSession); }, [restoreSession]);

  useEffect(() => {
    if (expiresAt === null) return;
    const renew = () => { if (Date.now() >= expiresAt - 60_000) void restoreSession(); };
    // Timers are throttled in background tabs, so also check when the tab is shown.
    const timer = setTimeout(renew, Math.max(expiresAt - 60_000 - Date.now(), 5_000));
    const onVisible = () => { if (document.visibilityState === "visible") renew(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [expiresAt, restoreSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const attempt = ++sessionAttempt.current;
    const session = await api.login({ email, password });
    if (attempt !== sessionAttempt.current) return;
    keepToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
    identifyAnalyticsUser(session.user.id);
    captureAnalyticsEvent("user_signed_in");
  }, [keepToken]);

  const signOut = useCallback(async () => {
    ++sessionAttempt.current;
    try { await api.logout(); } finally {
      keepToken(null);
      setUser(null);
      setStatus("anonymous");
      resetAnalyticsUser();
    }
  }, [keepToken]);

  const resendVerification = useCallback(async () => {
    if (!accessToken.current) throw new Error("La sesión ha caducado. Inicia sesión de nuevo.");
    await api.resendEmailVerification(accessToken.current);
  }, []);

  const completeOAuth = useCallback(async () => { await restoreSession(); }, [restoreSession]);
  const getAccessToken = useCallback(() => {
    if (!accessToken.current) throw new Error("La sesión ha caducado. Inicia sesión de nuevo.");
    return accessToken.current;
  }, []);

  return <AuthContext.Provider value={{ status, user, signIn, signOut, resendVerification, completeOAuth, getAccessToken }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return context;
}
