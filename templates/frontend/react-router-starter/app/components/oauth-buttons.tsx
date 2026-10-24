import { useEffect, useState } from "react";
import { api, ApiError, type OAuthProvider } from "../lib/api.client";

export function OAuthButtons() {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<OAuthProvider>();
  // Only providers with credentials on the backend get a button.
  const [available, setAvailable] = useState<OAuthProvider[]>([]);
  useEffect(() => { let current = true; void api.oauthProviders().then((providers) => { if (current) setAvailable(providers); }); return () => { current = false; }; }, []);
  async function start(provider: OAuthProvider) {
    setError(undefined); setPending(provider);
    try { await api.beginOAuth(provider); }
    catch (cause) { setPending(undefined); setError(cause instanceof ApiError ? cause.message : "No se ha podido iniciar sesión con este proveedor."); }
  }
  if (!available.length) return null;
  return <div className="oauth" aria-label="Acceder con un proveedor externo">
    <p className="divider"><span>o continúa con</span></p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="oauth-actions">{available.includes("google") && <button type="button" className="secondary-button" disabled={Boolean(pending)} onClick={() => void start("google")}>{pending === "google" ? "Abriendo Google…" : "Google"}</button>}{available.includes("github") && <button type="button" className="secondary-button" disabled={Boolean(pending)} onClick={() => void start("github")}>{pending === "github" ? "Abriendo GitHub…" : "GitHub"}</button>}</div>
  </div>;
}
