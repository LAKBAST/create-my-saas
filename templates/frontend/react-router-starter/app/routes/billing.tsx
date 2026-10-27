import { useEffect, useRef, useState } from "react";
import { AppShell } from "../components/app-shell";
import { CreateOrganization } from "../components/create-organization";
import { Icon } from "../components/icons";
import { ProtectedRoute } from "../components/protected-route";
import { api, type BillingConfiguration, type BillingSubscription, type Organization, type WorkspaceContext } from "../lib/api.client";
import { useAuth } from "../lib/auth-context";
import { privatePageMetadata } from "../lib/seo";
import styles from "../product.module.css";

import { formatBillingPrice } from "../lib/billing-price";

function entitlement(limit: number | null) { return limit === null ? "Sin límite" : `${limit} incluidos`; }
const statusLabels: Record<string, { label: string; tone: string }> = {
  active: { label: "Activa", tone: "badge-success" },
  trialing: { label: "En prueba", tone: "badge-accent" },
  past_due: { label: "Pago pendiente", tone: "badge-warning" },
  unpaid: { label: "Impagada", tone: "badge-danger" },
  canceled: { label: "Cancelada", tone: "badge-danger" },
  incomplete: { label: "Incompleta", tone: "badge-warning" },
};

export function meta() { return privatePageMetadata({ title: "Facturación", description: "Gestiona tu plan personal o el de tus equipos.", path: "/billing" }); }

export default function BillingRoute() {
  const { user } = useAuth();
  return <ProtectedRoute><AppShell><Billing key={user?.id} /></AppShell></ProtectedRoute>;
}

// Rendered inside ProtectedRoute so its effects run only once the session is restored.
function Billing() {
  const { getAccessToken } = useAuth();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [workspace, setWorkspace] = useState<WorkspaceContext>();
  const [showCreate, setShowCreate] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [configuration, setConfiguration] = useState<BillingConfiguration>();
  const [subscription, setSubscription] = useState<BillingSubscription>();
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await api.workspaceContext(getAccessToken());
        if (cancelled) return;
        const nextOrganizations = [...(context.personalWorkspace ? [context.personalWorkspace] : []), ...context.teams];
        const requestedId = new URLSearchParams(window.location.search).get("organizationId");
        setWorkspace(context);
        setOrganizations(nextOrganizations);
        setOrganizationId(nextOrganizations.find((organization) => organization.id === requestedId)?.id ?? nextOrganizations[0]?.id ?? "");
        if (!nextOrganizations.length) setLoading(false);
      } catch (error) { if (!cancelled) { setNotice(error instanceof Error ? error.message : "No se ha podido preparar tu espacio de trabajo."); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [getAccessToken]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = getAccessToken();
        const [nextConfiguration, nextSubscription] = await Promise.all([api.billingConfiguration(organizationId, token), api.billingSubscription(organizationId, token)]);
        if (cancelled) return;
        setConfiguration(nextConfiguration); setSubscription(nextSubscription);
      } catch (error) { if (!cancelled) setNotice(error instanceof Error ? error.message : "No se ha podido cargar la facturación."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [organizationId, getAccessToken]);

  function selectOrganization(id: string) {
    setLoading(true); setNotice(undefined); setConfiguration(undefined); setSubscription(undefined); setOrganizationId(id);
  }

  async function redirect(kind: "checkout" | "portal", priceId?: string) {
    if (!organizationId) return;
    setPending(priceId ?? kind); setNotice(undefined);
    try {
      const token = getAccessToken();
      const result = kind === "checkout" && priceId ? await api.createCheckout(organizationId, priceId, token) : await api.createPortal(organizationId, token);
      if (!mounted.current) return;
      if (result.url) { window.location.assign(result.url); return; }
      setNotice(result.reason ?? "La facturación de Stripe todavía no está configurada.");
    } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : "No se ha podido abrir Stripe."); }
    finally { if (mounted.current) setPending(undefined); }
  }

  const personal = Boolean(workspace?.personalWorkspace && workspace.personalWorkspace.id === organizationId);
  const canCreateTeam = workspace && workspace.model !== "individual";
  const status = subscription ? statusLabels[subscription.status] ?? { label: subscription.status, tone: "" } : undefined;
  const renewal = subscription?.currentPeriodEnd ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(subscription.currentPeriodEnd)) : "Sin fecha de renovación";

  return <section className={styles.content}>
    <header className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>Facturación</p><h1>Planes y suscripción</h1><p className={styles.lead}>{personal ? "Gestiona tu plan personal." : "Elige un plan para tu equipo."} El pago y la gestión se completan de forma segura en Stripe.</p></div>
      {workspace?.model !== "individual" && organizations.length > 1 && <label className="field">Espacio de facturación<select value={organizationId} disabled={Boolean(pending)} onChange={(event) => selectOrganization(event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.id === workspace?.personalWorkspace?.id ? "Personal" : organization.name}</option>)}</select></label>}
    </header>
    {!loading && workspace && !workspace.billingSupported && <p className="notice">Este backend no incluye facturación.</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {workspace?.model === "mixed" && <p className="notice">Tu plan personal y el de cada equipo se contratan y cancelan por separado.</p>}
    {canCreateTeam && !loading && organizationId && <button type="button" className="btn btn-secondary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Cerrar creación de equipo" : "Crear un equipo"}</button>}
    {canCreateTeam && !loading && (!organizationId || showCreate) && <CreateOrganization onCreated={(organization) => { setOrganizations((current) => [...current, organization]); setWorkspace((current) => current ? { ...current, teams: [...current.teams, organization] } : current); setShowCreate(false); selectOrganization(organization.id); }} />}
    {subscription && status && <section className={styles.panel} aria-labelledby="current-plan">
      <div className={styles.panelHeader}>
        <div><h2 id="current-plan">Plan actual: {subscription.plan}</h2><p>{subscription.cancelAtPeriodEnd ? `Se cancela el ${renewal}` : subscription.currentPeriodEnd ? `Se renueva el ${renewal}` : renewal}{!personal && <> · {subscription.seats} plaza{subscription.seats === 1 ? "" : "s"}</>}</p></div>
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
          {plan.price && <p>{formatBillingPrice(plan.price)}</p>}
          <ul>{Object.entries(plan.entitlements).map(([key, limit]) => <li key={key}><strong><Icon name="check" size={15} style={{ color: "var(--success)", verticalAlign: "-3px", marginRight: 6 }} />{plan.labels[key] ?? key}</strong><span>{entitlement(limit)}</span></li>)}</ul>
          <button type="button" onClick={() => void redirect("checkout", plan.priceId)} disabled={Boolean(pending) || current}>{current ? "Plan actual" : pending === plan.priceId ? "Redirigiendo…" : "Elegir este plan"}</button>
        </article>;
      })}</div>
    </>}
    {!loading && configuration && !configuration.configured && <div className={styles.empty}><div><Icon name="billing" size={22} /></div><h2>Facturación no configurada</h2><p>Configura Stripe y los planes permitidos en el backend para habilitar Checkout.</p></div>}
  </section>;
}
