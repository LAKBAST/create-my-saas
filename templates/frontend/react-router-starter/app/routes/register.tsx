import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import styles from "../auth.module.css";
import { AuthCard } from "../components/auth-card";
import { OAuthButtons } from "../components/oauth-buttons";
import { captureAnalyticsEvent } from "../components/posthog-provider";
import { ApiError, api } from "../lib/api.client";
import { privatePageMetadata } from "../lib/seo";

export function meta() { return privatePageMetadata({ title: "Crear cuenta", description: "Crea una cuenta para acceder al producto.", path: "/register" }); }

export default function Register() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setError("La contraseña debe tener al menos 8 caracteres, una letra y un número."); return; }
    setError(undefined); setPending(true);
    try {
      await api.register({ name: String(data.get("name")), email: String(data.get("email")), password: String(data.get("password")) });
      captureAnalyticsEvent("signup_requested");
      navigate("/login?registered=1", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se ha podido crear la cuenta.");
    } finally { setPending(false); }
  }

  return <AuthCard><h1>Crea tu cuenta</h1><p>Empieza con la base de tu nuevo producto.</p><form className={styles.form} onSubmit={submit}><label>Nombre<input name="name" autoComplete="name" placeholder="Tu nombre" required /></label><label>Correo electrónico<input name="email" type="email" autoComplete="email" placeholder="tu@empresa.com" required /></label><label>Contraseña<input name="password" type="password" autoComplete="new-password" placeholder="8 caracteres, letra y número" minLength={8} required /></label>{error && <p className={styles.error} role="alert">{error}</p>}<button type="submit" disabled={pending}>{pending ? "Creando cuenta…" : "Crear cuenta"}</button></form><OAuthButtons /><p className={styles.footer}>¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link></p></AuthCard>;
}
