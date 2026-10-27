import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import styles from "../auth.module.css";
import { AuthCard } from "../components/auth-card";
import { OAuthButtons } from "../components/oauth-buttons";
import { ApiError } from "../lib/api.client";
import { useAuth } from "../lib/auth-context";
import { privatePageMetadata } from "../lib/seo";

export function meta() { return privatePageMetadata({ title: "Iniciar sesión", description: "Accede a tu espacio de trabajo.", path: "/login" }); }

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(undefined); setPending(true);
    try {
      await signIn(String(data.get("email")), String(data.get("password")));
      const next = search.get("next");
      navigate(next?.startsWith("/") ? next : "/app", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se ha podido iniciar sesión.");
    } finally { setPending(false); }
  }

  return <AuthCard><h1>Inicia sesión</h1><p>Accede a tu espacio de trabajo.</p>{search.has("passwordChanged") && <p className={styles.notice} role="status">Contraseña actualizada. Inicia sesión con la nueva contraseña.</p>}{search.get("registered") && <p className={styles.notice} role="status">Hemos enviado un enlace de verificación a tu correo. Cuando termines, ya puedes iniciar sesión.</p>}<form className={styles.form} onSubmit={submit}><label>Correo electrónico<input name="email" type="email" autoComplete="email" placeholder="tu@empresa.com" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required /></label>{error && <p className={styles.error} role="alert">{error}</p>}<button type="submit" disabled={pending}>{pending ? "Iniciando sesión…" : "Iniciar sesión"}</button></form><OAuthButtons /><p className={styles.footer}><Link to="/forgot-password">¿Has olvidado tu contraseña?</Link></p><p className={styles.footer}>¿Aún no tienes cuenta? <Link to="/register">Crear cuenta</Link></p></AuthCard>;
}
