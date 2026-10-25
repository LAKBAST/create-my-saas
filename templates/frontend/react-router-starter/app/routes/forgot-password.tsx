import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import styles from "../auth.module.css";
import { AuthCard } from "../components/auth-card";
import { ApiError, api } from "../lib/api.client";
import { privatePageMetadata } from "../lib/seo";

export function meta() { return privatePageMetadata({ title: "Recuperar cuenta", description: "Solicita un enlace para restablecer tu contraseña.", path: "/forgot-password" }); }

export default function ForgotPassword() {
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    setError(undefined); setPending(true);
    try { await api.requestPasswordReset(email); setSent(true); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se ha podido solicitar el restablecimiento."); } finally { setPending(false); }
  }

  return <AuthCard><h1>Restablece tu contraseña</h1>{sent ? <p role="status">Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.</p> : <><p>Te enviaremos un enlace de un solo uso.</p><form className={styles.form} onSubmit={submit}><label>Correo electrónico<input name="email" type="email" autoComplete="email" placeholder="tu@empresa.com" required /></label>{error && <p className={styles.error} role="alert">{error}</p>}<button type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar enlace"}</button></form></>}<p className={styles.footer}><Link to="/login">Volver a iniciar sesión</Link></p></AuthCard>;
}
