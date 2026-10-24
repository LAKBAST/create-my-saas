import { useState, type FormEvent } from "react";
import { api, ApiError, type Organization } from "../lib/api.client";
import { useAuth } from "../lib/auth-context";

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

  return <section className="account-card" aria-labelledby="create-organization">
    <h2 id="create-organization">Crea tu organización</h2>
    <p>La facturación y el equipo pertenecen a una organización. Puedes invitar a más personas después.</p>
    <form onSubmit={submit}>
      <label>Nombre de la organización<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mi empresa" maxLength={160} required autoComplete="organization" /></label>
      {slug && <small>Identificador: <code>{slug}</code></small>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="button" disabled={submitting}>{submitting ? "Creando…" : "Crear organización"}</button>
    </form>
  </section>;
}
