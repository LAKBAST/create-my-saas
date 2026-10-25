import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import styles from "../auth.module.css";
import { AuthCard } from "../components/auth-card";
import { ApiError, api } from "../lib/api.client";
import { privatePageMetadata } from "../lib/seo";

export function meta() { return privatePageMetadata({ title: "Restablecer contraseña", description: "Elige una contraseña nueva para tu cuenta.", path: "/reset-password" }); }

export default function ResetPassword() {
  const [search] = useSearchParams();
  const token = search.get("token");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const password = String(new FormData(event.currentTarget).get("password"));
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setError("La contraseña debe tener al menos 8 caracteres, una letra y un número."); return; }
    setError(undefined); setPending(true);
    try { await api.resetPassword(token, password); setDone(true); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se ha podido actualizar la contraseña."); } finally { setPending(false); }
  }

  return <AuthCard><h1>Nueva contraseña</h1>{!token ? <><p className={styles.error} role="alert">El enlace no incluye un token de recuperación válido.</p><p className={styles.footer}><Link to="/forgot-password">Solicitar un enlace nuevo</Link></p></> : done ? <><p role="status">Tu contraseña se ha actualizado. Inicia sesión con la nueva contraseña.</p><p className={styles.footer}><Link to="/login">Iniciar sesión</Link></p></> : <><p>Elige una contraseña nueva y segura.</p><form className={styles.form} onSubmit={submit}><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" placeholder="8 caracteres, letra y número" minLength={8} required /></label>{error && <p className={styles.error} role="alert">{error}</p>}<button type="submit" disabled={pending}>{pending ? "Actualizando…" : "Actualizar contraseña"}</button></form></>}</AuthCard>;
}
