import { useState, type FormEvent } from "react";
import { api, ApiError, type Organization } from "../lib/api.client";
import { useAuth } from "../lib/auth-context";
import { Icon } from "./icons";
import styles from "../product.module.css";

/** Lowercase, accent-free and hyphenated, as the API's slug pattern requires. */
export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160);
}

const SLUG_TAKEN = new Set(["SLUG_ALREADY_EXISTS", "ORGANIZATION_SLUG_ALREADY_EXISTS"]);

// Shown wherever a page needs an organization and the user has none yet.
export function CreateOrganization({ onCreated }: { onCreated: (organization: Organization) => void }) {
  const { getAccessToken } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const slug = slugify(name);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (slug.length < 3) { setError("El nombre debe tener al menos 3 letras o números."); return; }
    setError(undefined); setSubmitting(true);
    const create = (candidate: string) => api.createOrganization({ name: name.trim(), slug: candidate }, getAccessToken());
    try {
      // Slugs are unique across every customer, so a taken one gets a short suffix.
      onCreated(await create(slug).catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.code && SLUG_TAKEN.has(cause.code)) return create(`${slug.slice(0, 150)}-${Math.random().toString(36).slice(2, 7)}`);
        throw cause;
      }));
    }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No se ha podido crear la organización."); }
    finally { setSubmitting(false); }
  }

  return <section className={styles.panel} aria-labelledby="create-organization">
    <div className={styles.panelHeader}><div><h2 id="create-organization">Crea tu organización</h2><p>Una organización reúne a las personas de un equipo y su facturación. Créala si quieres contratar para un equipo o invitar a otras personas.</p></div><span className={styles.cardIcon} style={{ margin: 0 }}><Icon name="building" /></span></div>
    <form onSubmit={submit} style={{ display: "grid", gap: 14, padding: "18px 20px" }}>
      <label className="field">Nombre de la organización<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mi empresa" maxLength={160} required autoComplete="organization" /></label>
      {slug && <small style={{ color: "var(--muted)", fontSize: 12.5 }}>Identificador: <code>{slug}</code></small>}
      {error && <p className="notice notice-danger" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div><button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Creando…" : "Crear organización"}</button></div>
    </form>
  </section>;
}
