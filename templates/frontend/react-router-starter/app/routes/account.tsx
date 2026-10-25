import { useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import { ProtectedRoute } from "../components/protected-route";
import { useAuth } from "../lib/auth-context";
import { privatePageMetadata } from "../lib/seo";
import styles from "../product.module.css";

export function meta() { return privatePageMetadata({ title: "Cuenta", description: "Gestiona el perfil de tu cuenta.", path: "/account" }); }

function Account() {
  const { user, resendVerification, signOut } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string>();
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try { await resendVerification(); setNotice("Hemos enviado un nuevo enlace de verificación."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se ha podido reenviar el enlace."); }
    finally { setSending(false); }
  }

  async function logout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return <section className={styles.content}>
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
    <section className={styles.panel} aria-labelledby="session">
      <div className={styles.panelHeader}><div><h2 id="session">Sesión</h2><p>Cierra la sesión en este navegador.</p></div><button type="button" className="btn btn-secondary" onClick={() => void logout()}>Cerrar sesión</button></div>
    </section>
  </section>;
}

export default function AccountRoute() { return <ProtectedRoute><AppShell><Account /></AppShell></ProtectedRoute>; }
