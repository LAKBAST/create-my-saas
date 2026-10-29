"use client";

import { PublicPlans } from "./public-plans";
import Link from "next/link";
import { Icon, type IconName } from "./icons";
import { PRODUCT_NAME } from "../lib/brand";
import styles from "../landing.module.css";

const features: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "user", title: "Sesión segura", text: "Refresh cookies HttpOnly y access token sólo en memoria." },
  { icon: "building", title: "Organizaciones", text: "Equipos, invitaciones y roles por organización desde el primer día." },
  { icon: "billing", title: "Facturación", text: "Planes, Checkout y portal de cliente de Stripe a través del backend." },
];

export default function Home() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/"><span aria-hidden="true">{PRODUCT_NAME.slice(0, 1)}</span>{PRODUCT_NAME}</Link>
      <nav aria-label="Acceso"><Link className="btn btn-ghost" href="/login">Iniciar sesión</Link><Link className="btn btn-primary" href="/register">Crear cuenta</Link></nav>
    </header>
    <main className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Next.js · SaaS</p>
        <h1>Construye el producto, no otra base de autenticación.</h1>
        <p className={styles.lead}>Sesión de navegador, rutas protegidas y recuperación de cuenta ya están resueltas. Aquí empieza el dominio de tu SaaS.</p>
        <div className={styles.actions}><Link className="btn btn-primary" href="/register">Empezar ahora <Icon name="arrow" size={16} /></Link><Link className="btn btn-secondary" href="/login">Ya tengo una cuenta</Link></div>
      </section>
      <section className={styles.features} aria-label="Incluido">{features.map((feature) => <article className={styles.feature} key={feature.title}>
        <div className={styles.featureIcon}><Icon name={feature.icon} /></div>
        <strong>{feature.title}</strong><span>{feature.text}</span>
      </article>)}</section>
      <PublicPlans />
    </main>
  </div>;
}
