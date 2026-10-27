"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/app-shell";
import { ProtectedPage } from "../components/protected-page";
import { useAuth } from "../components/auth-provider";
import { api, ApiError } from "../lib/api";
import styles from "../product.module.css";

export default function AccountPage() {
  const router = useRouter();
  const { user, resendVerification, signOut, getAccessToken } = useAuth();
  const [notice, setNotice] = useState<string>();
  const [sending, setSending] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();
  const [changingPassword, setChangingPassword] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const currentPassword = String(values.get("currentPassword") ?? "");
    const newPassword = String(values.get("newPassword") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");
    if (newPassword !== confirmation) { setPasswordError("Las contraseñas nuevas no coinciden."); return; }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) { setPasswordError("La contraseña debe tener al menos 8 caracteres, una letra y un número."); return; }
    setPasswordError(undefined); setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword, getAccessToken());
      await signOut();
      router.replace("/login?passwordChanged=1");
    } catch (cause) {
      setPasswordError(cause instanceof ApiError && cause.code === "INVALID_CREDENTIALS" ? "La contraseña actual no es correcta. Si accedes con Google o GitHub, puedes crear una desde «¿Olvidaste tu contraseña?» en el inicio de sesión." : cause instanceof Error ? cause.message : "No se ha podido cambiar la contraseña.");
    } finally { setChangingPassword(false); }
  }

  async function resend() {
    setSending(true);
    try { await resendVerification(); setNotice("Hemos enviado un nuevo enlace de verificación."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se ha podido reenviar el enlace."); }
    finally { setSending(false); }
  }

  return <ProtectedPage><AppShell><section className={styles.content}>
    <header><p className={styles.eyebrow}>Cuenta</p><h1>Perfil</h1><p className={styles.lead}>Tu identidad y el estado de verificación de esta sesión.</p></header>
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className={styles.panel} aria-labelledby="profile">
      <div className={styles.panelHeader}><div><h2 id="profile">Datos personales</h2><p>Se usan para iniciar sesión y para los avisos de tu cuenta.</p></div></div>
      <dl className={styles.rows}>
        <div><dt>Nombre</dt><dd>{user?.name}</dd><span /></div>
        <div><dt>Correo electrónico</dt><dd>{user?.email}</dd>
          {user?.emailVerified ? <span className="badge badge-success">Verificado</span> : <button type="button" className="btn btn-secondary btn-sm" onClick={() => void resend()} disabled={sending}>{sending ? "Enviando…" : "Reenviar verificación"}</button>}
        </div>
        <div><dt>Estado</dt><dd>{user?.isActive ? "Cuenta activa" : "Cuenta desactivada"}</dd><span className={`badge ${user?.isActive ? "badge-success" : "badge-danger"}`}>{user?.isActive ? "Activa" : "Inactiva"}</span></div>
      </dl>
    </section>
    <section className={styles.panel} aria-labelledby="security">
      <div className={styles.panelHeader}><div><h2 id="security">Seguridad</h2><p>Cambia tu contraseña y vuelve a iniciar sesión en todos tus dispositivos.</p></div></div>
      <form className={styles.securityForm} onSubmit={changePassword}>
        <label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
        <label>Nueva contraseña<input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <label>Confirmar nueva contraseña<input name="confirmation" type="password" autoComplete="new-password" required /></label>
        {passwordError && <p role="alert">{passwordError}</p>}
        <button type="submit" className="btn btn-primary" disabled={changingPassword}>{changingPassword ? "Actualizando…" : "Cambiar contraseña"}</button>
      </form>
    </section>
    <section className={styles.panel} aria-labelledby="session">
      <div className={styles.panelHeader}><div><h2 id="session">Sesión</h2><p>Cierra la sesión en este navegador.</p></div><button type="button" className="btn btn-secondary" onClick={() => void signOut()}>Cerrar sesión</button></div>
    </section>
  </section></AppShell></ProtectedPage>;
}
