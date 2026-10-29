"use client";

import Link from "next/link";
import { AppShell } from "../components/app-shell";
import { useAuth } from "../components/auth-provider";
import { Icon, type IconName } from "../components/icons";
import { ProtectedPage } from "../components/protected-page";
import styles from "../product.module.css";

const shortcuts: Array<{ href: string; icon: IconName; label: string; title: string; text: string }> = [
  { href: "/billing", icon: "billing", label: "Facturación", title: "Planes y pagos", text: "Elige un plan y gestiona tu suscripción." },
  { href: "/account", icon: "user", label: "Cuenta", title: "Tu perfil", text: "Revisa tus datos y el estado de verificación del correo." },
  { href: "/settings", icon: "settings", label: "Configuración", title: "Espacio de trabajo", text: "Preferencias e integraciones de tu producto." },
];

function Home() {
  const { user } = useAuth();
  const steps = [
    { done: true, title: "Cuenta creada", text: "La sesión y las rutas protegidas ya funcionan." },
    { done: Boolean(user?.emailVerified), title: "Verifica tu correo", text: "Necesario para recuperar la contraseña y recibir avisos.", href: "/account" },
    { done: false, title: "Elige un plan", text: "Activa tu facturación con Stripe.", href: "/billing" },
    { done: false, title: "Construye tu producto", text: "Sustituye esta página por el panel principal de tu SaaS." },
  ];
  return <section className={styles.content}>
    <header>
      <p className={styles.eyebrow}>Inicio</p>
      <h1>Tu base de producto</h1>
      <p className={styles.lead}>Hola{user?.name ? `, ${user.name}` : ""}. Autenticación, gestión de cuenta y facturación ya están listas: empieza por lo que hace único a tu SaaS.</p>
    </header>
    <section className={styles.panel} aria-labelledby="getting-started">
      <div className={styles.panelHeader}><div><h2 id="getting-started">Primeros pasos</h2><p>{steps.filter((step) => step.done).length} de {steps.length} completados</p></div></div>
      <ol className={styles.steps}>{steps.map((step) => <li key={step.title}>
        <span className={`${styles.stepIcon} ${step.done ? styles.stepDone : ""}`}>{step.done ? <Icon name="check" size={15} /> : null}</span>
        <div><strong>{step.title}</strong><span>{step.text}</span></div>
        {!step.done && step.href && <Link className="btn btn-secondary btn-sm" href={step.href}>Abrir</Link>}
      </li>)}</ol>
    </section>
    <div className={styles.grid}>{shortcuts.map((item) => <article className={styles.card} key={item.href}>
      <div className={styles.cardIcon}><Icon name={item.icon} /></div>
      <p>{item.label}</p><strong>{item.title}</strong><span>{item.text}</span>
      <Link href={item.href}>Abrir {item.label.toLowerCase()} →</Link>
    </article>)}</div>
  </section>;
}

export default function HomePage() { return <ProtectedPage><AppShell><Home /></AppShell></ProtectedPage>; }
