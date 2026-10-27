import { AppShell } from "../components/app-shell";
import { Icon } from "../components/icons";
import { ProtectedRoute } from "../components/protected-route";
import { privatePageMetadata } from "../lib/seo";
import styles from "../product.module.css";

export function meta() { return privatePageMetadata({ title: "Configuración", description: "Ajustes de tu espacio de trabajo.", path: "/settings" }); }

export default function Settings() {
  return <ProtectedRoute><AppShell><section className={styles.content}>
    <header><p className={styles.eyebrow}>Configuración</p><h1>Espacio de trabajo</h1><p className={styles.lead}>Ajustes comunes que cualquier producto puede necesitar.</p></header>
    <div className={styles.empty}>
      <div><Icon name="settings" size={22} /></div>
      <h2>Aún no hay ajustes</h2>
      <p>Añade aquí preferencias e integraciones del producto cuando tu SaaS los necesite. Edita <code>app/routes/settings.tsx</code>.</p>
    </div>
  </section></AppShell></ProtectedRoute>;
}
