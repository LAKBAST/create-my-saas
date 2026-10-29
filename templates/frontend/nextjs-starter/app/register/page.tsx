"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import styles from "../auth.module.css";
import { PRODUCT_NAME } from "../lib/brand";
import { api, ApiError } from "../lib/api";
import { safeNext } from "../lib/safe-next";
import { OAuthButtons } from "../components/oauth-buttons";
import { captureAnalyticsEvent } from "../components/posthog-provider";

export default function RegisterPage() {
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setNext(safeNext(new URLSearchParams(window.location.search).get("next"))), 0); return () => clearTimeout(timer); }, []);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password"));
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("La contraseña debe tener al menos 8 caracteres, una letra y un número.");
      return;
    }
    setError(undefined); setSubmitting(true);
    try {
      await api.register({ name: String(values.get("name")), email: String(values.get("email")), password });
      captureAnalyticsEvent("signup_requested");
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se ha podido crear la cuenta.");
    } finally { setSubmitting(false); }
  }

  return <main className={styles.page}><section className={styles.box}><div className={styles.brand}><span aria-hidden="true">{PRODUCT_NAME.slice(0, 1)}</span>{PRODUCT_NAME}</div><h1>{complete ? "Revisa tu correo" : "Crea tu cuenta"}</h1>{complete ? <><p>Hemos enviado un enlace de verificación a tu correo. Cuando termines, ya puedes iniciar sesión.</p><p className={styles.footer}><Link href={loginHref}>Ir a iniciar sesión</Link></p></> : <><p>Empieza con la base de tu nuevo producto.</p><form className={styles.form} onSubmit={submit}><label>Nombre<input name="name" autoComplete="name" placeholder="Tu nombre" required /></label><label>Correo electrónico<input name="email" type="email" autoComplete="email" placeholder="tu@empresa.com" required /></label><label>Contraseña<input name="password" type="password" autoComplete="new-password" placeholder="8 caracteres, letra y número" required /></label>{error && <p className={styles.error} role="alert">{error}</p>}<button type="submit" disabled={submitting}>{submitting ? "Creando cuenta…" : "Crear cuenta"}</button></form><OAuthButtons /><p className={styles.footer}>¿Ya tienes cuenta? <Link href={loginHref}>Iniciar sesión</Link></p></>}</section></main>;
}
