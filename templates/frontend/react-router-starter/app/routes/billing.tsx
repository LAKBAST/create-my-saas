import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { CreateOrganization } from "../components/create-organization";
import { Icon } from "../components/icons";
import { ProtectedRoute } from "../components/protected-route";
import { api, type BillingConfiguration, type BillingSubscription, type Organization } from "../lib/api.client";
import { useAuth } from "../lib/auth-context";
import { privatePageMetadata } from "../lib/seo";
import styles from "../product.module.css";

function entitlement(limit: number | null) { return limit === null ? "Sin límite" : `${limit} incluidos`; }
const statusLabels: Record<string, { label: string; tone: string }> = {
  active: { label: "Activa", tone: "badge-success" },
  trialing: { label: "En prueba", tone: "badge-accent" },
  past_due: { label: "Pago pendiente", tone: "badge-warning" },
  unpaid: { label: "Impagada", tone: "badge-danger" },
  canceled: { label: "Cancelada", tone: "badge-danger" },
  incomplete: { label: "Incompleta", tone: "badge-warning" },
};

export function meta() { return privatePageMetadata({ title: "Facturación", description: "Gestiona los planes y la suscripción de tu organización.", path: "/billing" }); }

export default function BillingRoute() {
  return <ProtectedRoute><AppShell><Billing /></AppShell></ProtectedRoute>;
}

// Rendered inside ProtectedRoute so its effects run only once the session is restored.
function Billing() {
  const { getAccessToken } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [configuration, setConfiguration] = useState<BillingConfiguration>();
  const [subscription, setSubscription] = useState<BillingSubscription>();
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string>();

  useEffect(() => {
    void (async () => {
      try {
        const nextOrganizations = await api.organizations(getAccessToken());
        const requestedId = new URLSearchParams(window.location.search).get("organizationId");
        setOrganizations(nextOrganizations);
        setOrganizationId(nextOrganizations.find((organization) => organization.id === requestedId)?.id ?? nextOrganizations[0]?.id ?? "");
        if (!nextOrganizations.length) setLoading(false);
      } catch (error) { setNotice(error instanceof Error ? error.message : "No se han podido cargar las organizaciones."); setLoading(false); }
    })();
  }, [getAccessToken]);

  // Loading starts in selectOrganization: this effect only sets state after awaiting.
  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        const token = getAccessToken();
        const [nextConfiguration, nextSubscription] = await Promise.all([api.billingConfiguration(organizationId, token), api.billingSubscription(organizationId, token)]);
        setConfiguration(nextConfiguration); setSubscription(nextSubscription);
      } catch (error) { setNotice(error instanceof Error ? error.message : "No se ha podido cargar la facturación."); }
      finally { setLoading(false); }
    })();
  }, [organizationId, getAccessToken]);

  function selectOrganization(id: string) {
    setLoading(true); setNotice(undefined); setOrganizationId(id);
  }

  async function redirect(kind: "checkout" | "portal", priceId?: string) {
    if (!organizationId) return;
    setPending(priceId ?? kind); setNotice(undefined);
    try {
      const token = getAccessToken();
      const result = kind === "checkout" && priceId ? await api.createCheckout(organizationId, priceId, token) : await api.createPortal(organizationId, token);
      if (result.url) { window.location.assign(result.url); return; }
      setNotice(result.reason ?? "La facturación de Stripe todavía no está configurada.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se ha podido abrir Stripe."); }
    finally { setPending(undefined); }
  }

  const status = subscription ? statusLabels[subscription.status] ?? { label: subscription.status, tone: "" } : undefined;
  const renewal = subscription?.currentPeriodEnd ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(subscription.currentPeriodEnd)) : "Sin fecha de renovación";

  return <section className={styles.content}>
    <header className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>Facturación</p><h1>Planes y suscripción</h1><p className={styles.lead}>Elige un plan para tu organización. El pago y la gestión de la suscripción se completan de forma segura en Stripe.</p></div>
      {organizations.length > 1 && <label className="field">Organización<select value={organizationId} onChange={(event) => selectOrganization(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {!loading && !organizationId && <CreateOrganization onCreated={(organization) => { setOrganizations([organization]); selectOrganization(organization.id); }} />}
    {subscription && status && <section className={styles.panel} aria-labelledby="current-plan">
      <div className={styles.panelHeader}>
        <div><h2 id="current-plan">Plan actual: {subscription.plan}</h2><p>{subscription.cancelAtPeriodEnd ? `Se cancela el ${renewal}` : subscription.currentPeriodEnd ? `Se renueva el ${renewal}` : renewal} · {subscription.seats} plaza{subscription.seats === 1 ? "" : "s"}</p></div>
        <span className={`badge ${status.tone}`}>{status.label}</span>
      </div>
      <dl className={styles.rows}><div><dt>Gestión</dt><dd>Cambia de plan, actualiza el método de pago o descarga facturas.</dd>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void redirect("portal")} disabled={!configuration?.configured || Boolean(pending)}>{pending === "portal" ? "Abriendo…" : "Gestionar suscripción"}</button></div></dl>
    </section>}
    {loading && organizationId && <p className={styles.lead}>Cargando facturación…</p>}
    {!loading && configuration?.configured && <>
      <h2 className={styles.sectionTitle}>Planes disponibles</h2>
      <div className={styles.grid}>{configuration.plans.map((plan) => {
        const current = subscription?.plan === plan.name;
        return <article className={`${styles.card} ${current ? styles.featured : ""}`} key={plan.priceId}>
          <p>{current ? "Tu plan" : "Plan"}</p><h2>{plan.name}</h2>
          <ul>{Object.entries(plan.entitlements).map(([key, limit]) => <li key={key}><strong><Icon name="check" size={15} style={{ color: "var(--success)", verticalAlign: "-3px", marginRight: 6 }} />{key}</strong><span>{entitlement(limit)}</span></li>)}</ul>
          <button type="button" onClick={() => void redirect("checkout", plan.priceId)} disabled={Boolean(pending) || current}>{current ? "Plan actual" : pending === plan.priceId ? "Redirigiendo…" : "Elegir este plan"}</button>
        </article>;
      })}</div>
    </>}
    {!loading && configuration && !configuration.configured && <div className={styles.empty}><div><Icon name="billing" size={22} /></div><h2>Facturación no configurada</h2><p>Configura Stripe y los planes permitidos en el backend para habilitar Checkout.</p></div>}
  </section>;
}
