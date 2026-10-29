import { PublicPlans } from "../components/public-plans";
import { Link } from "react-router";
import { Icon, type IconName } from "../components/icons";
import { PRODUCT_NAME } from "../lib/brand";
import { publicPageMetadata } from "../lib/seo";
import styles from "../landing.module.css";

export function meta() {
  return publicPageMetadata({
    title: PRODUCT_NAME,
    description: "Base reutilizable para lanzar tu próximo SaaS con autenticación y rutas protegidas.",
    path: "/",
  });
}

const features: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "user", title: "Sesión segura", text: "Refresh cookies HttpOnly y access token sólo en memoria." },
  { icon: "building", title: "Espacios y equipos", text: "Espacio personal, organizaciones con invitaciones y roles, o ambos, según el modelo de producto." },
  { icon: "billing", title: "Facturación", text: "Planes, Checkout y portal de cliente de Stripe a través del backend." },
];

export default function Home() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} to="/"><span aria-hidden="true">{PRODUCT_NAME.slice(0, 1)}</span>{PRODUCT_NAME}</Link>
      <nav aria-label="Acceso"><Link className="btn btn-ghost" to="/login">Iniciar sesión</Link><Link className="btn btn-primary" to="/register">Crear cuenta</Link></nav>
    </header>
    <main className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>React Router · Framework mode</p>
        <h1>Construye el producto, no otra base de autenticación.</h1>
        <p className={styles.lead}>Sesión de navegador, rutas protegidas y recuperación de cuenta ya están resueltas. Aquí empieza el dominio de tu SaaS.</p>
        <div className={styles.actions}><Link className="btn btn-primary" to="/register">Empezar ahora <Icon name="arrow" size={16} /></Link><Link className="btn btn-secondary" to="/login">Ya tengo una cuenta</Link></div>
      </section>
      <section className={styles.features} aria-label="Incluido">{features.map((feature) => <article className={styles.feature} key={feature.title}>
        <div className={styles.featureIcon}><Icon name={feature.icon} /></div>
        <strong>{feature.title}</strong><span>{feature.text}</span>
      </article>)}</section>
      <PublicPlans />
    </main>
  </div>;
}
