import { AppShell } from "../components/app-shell";
import { Icon } from "../components/icons";
import { ProtectedPage } from "../components/protected-page";
import styles from "../product.module.css";

export default function SettingsPage() {
  return <ProtectedPage><AppShell><section className={styles.content}>
    <header><p className={styles.eyebrow}>Configuración</p><h1>Espacio de trabajo</h1><p className={styles.lead}>Ajustes comunes que cualquier producto puede necesitar.</p></header>
    <div className={styles.empty}>
      <div><Icon name="settings" size={22} /></div>
      <h2>Aún no hay ajustes</h2>
      <p>Añade aquí preferencias del producto, integraciones o equipos cuando tu SaaS los necesite. Edita <code>app/settings/page.tsx</code>.</p>
    </div>
  </section></AppShell></ProtectedPage>;
}
