"use client";

import { useCallback, useEffect, useState, type ReactNode, type FormEvent } from "react";
import { AppShell } from "../components/app-shell";
import { ProtectedPage } from "../components/protected-page";
import { useAuth } from "../components/auth-provider";
import { useAdminAccess } from "../components/admin-access";
import { ApiError, api, type AdminOverview, type AdminPage, type AdminQuery, type AdminUser, type AdminOrganization, type AdminSubscription } from "../lib/api";
import product from "../product.module.css";
import styles from "./page.module.css";

const formatNumber = (value: number) => new Intl.NumberFormat("es-ES").format(value);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "No se han podido cargar los datos.";
const forbidden = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status);

type Column<T> = { label: string; render: (item: T) => ReactNode };
const userColumns: Column<AdminUser>[] = [
  { label: "Usuario", render: (user) => <><strong>{user.name}</strong><small>{user.email}</small></> },
  { label: "Estado de cuenta", render: (user) => user.isActive ? "Habilitada" : "Desactivada" },
  { label: "Correo", render: (user) => user.emailVerified ? "Verificado" : "Sin verificar" },
  { label: "Alta (UTC)", render: (user) => formatDate(user.createdAt) },
];
const organizationColumns: Column<AdminOrganization>[] = [
  { label: "Organización", render: (organization) => <><strong>{organization.name}</strong><small>{organization.slug}</small></> },
  { label: "Miembros", render: (organization) => formatNumber(organization.memberCount) },
  { label: "Alta (UTC)", render: (organization) => formatDate(organization.createdAt) },
];
const subscriptionColumns: Column<AdminSubscription>[] = [
  { label: "Organización", render: (subscription) => <><strong>{subscription.organizationName}</strong><small>{subscription.organizationId}</small></> },
  { label: "Plan", render: (subscription) => subscription.plan },
  { label: "Estado", render: (subscription) => <>{subscription.status}{subscription.cancelAtPeriodEnd && <small>Cancelación programada</small>}</> },
  { label: "Plazas", render: (subscription) => formatNumber(subscription.seats) },
  { label: "Proveedor", render: (subscription) => subscription.provider },
  { label: "Fin del periodo (UTC)", render: (subscription) => formatDate(subscription.currentPeriodEnd) },
];

function Listing<T extends { id: string }>({ label, columns, load, refresh, onForbidden }: {
  label: string; columns: Column<T>[];
  load: (query: AdminQuery, token: string, signal?: AbortSignal) => Promise<AdminPage<T>>;
  refresh: number; onForbidden: () => void;
}) {
  const { getAccessToken } = useAuth();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState<AdminQuery>({ page: 1, pageSize: 25, search: "" });
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([query, refresh, retry]);
  const [result, setResult] = useState<{ key: string; data?: AdminPage<T>; error?: string }>();
  const current = result?.key === key ? result : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void load(query, getAccessToken(), controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (forbidden(error)) onForbidden();
      setResult({ key, error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [getAccessToken, key, load, onForbidden, query]);

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery({ ...query, search: draft.trim(), page: 1 });
  }

  return <section className={product.panel} aria-labelledby="records-heading">
    <div className={product.panelHeader}><h2 id="records-heading">{label}</h2></div>
    <form className={styles.search} onSubmit={search}>
      <label className="field">Buscar {label.toLowerCase()}<input type="search" maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
      <button type="submit" className="btn btn-secondary">Buscar</button>
    </form>
    {!current && <p className={styles.status} role="status">Cargando {label.toLowerCase()}…</p>}
    {current?.error && <div className={styles.status} role="alert"><p>{current.error}</p><button type="button" className="btn btn-secondary" onClick={() => setRetry((value) => value + 1)}>Reintentar consulta</button></div>}
    {current?.data && <>
      {current.data.items.length === 0 ? <p className={styles.status} role="status">No hay {label.toLowerCase()} para esta consulta.</p> : <div className={styles.tableContainer} tabIndex={0} role="region" aria-label={`Tabla de ${label.toLowerCase()}`}><table className={styles.table}>
        <caption className={styles.caption}>{label}: página {current.data.page}</caption>
        <thead><tr>{columns.map((column) => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead>
        <tbody>{current.data.items.map((item) => <tr key={item.id}>{columns.map((column) => <td key={column.label}>{column.render(item)}</td>)}</tr>)}</tbody>
      </table></div>}
      <div className={styles.pagination}>
        <span role="status">{formatNumber(current.data.total)} resultados · Página {current.data.page} de {Math.max(1, Math.ceil(current.data.total / current.data.pageSize))}</span>
        <div><button type="button" className="btn btn-secondary btn-sm" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Anterior</button><button type="button" className="btn btn-secondary btn-sm" disabled={query.page * current.data.pageSize >= current.data.total} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Siguiente</button></div>
      </div>
    </>}
  </section>;
}

function Overview({ days, refresh, onForbidden }: { days: number; refresh: number; onForbidden: () => void }) {
  const { getAccessToken } = useAuth();
  const key = `${days}:${refresh}`;
  const [result, setResult] = useState<{ key: string; data?: AdminOverview; error?: string }>();
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    const controller = new AbortController();
    void api.adminOverview(days, getAccessToken(), controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (forbidden(error)) onForbidden();
      setResult({ key, error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [days, getAccessToken, key, onForbidden]);
  if (!current) return <p role="status">Cargando estadísticas…</p>;
  if (current.error) return <p className="notice notice-danger" role="alert">{current.error} Usa Actualizar para volver a intentarlo.</p>;
  const overview = current.data!;
  const metrics = [
    { label: "Usuarios registrados", value: overview.totalUsers, detail: `${formatNumber(overview.newUsers)} altas en ${overview.periodDays} días` },
    { label: "Cuentas habilitadas", value: overview.enabledUsers, detail: "Estado de la cuenta" },
    { label: "Correos verificados", value: overview.verifiedUsers, detail: "Usuarios con correo confirmado" },
    { label: "Organizaciones", value: overview.totalOrganizations, detail: `${formatNumber(overview.newOrganizations)} nuevas en ${overview.periodDays} días` },
    { label: "Suscripciones", value: overview.totalSubscriptions, detail: "Todos los planes y estados" },
  ];
  return <>
    <div className={styles.metrics}>{metrics.map((metric) => <article className={styles.metric} key={metric.label}><h2>{metric.label}</h2><strong>{formatNumber(metric.value)}</strong><p>{metric.detail}</p></article>)}</div>
    <div className={styles.breakdowns}>
      {[{ title: "Suscripciones por estado", values: overview.subscriptionsByStatus.map((item) => ({ label: item.status, count: item.count })) }, { title: "Suscripciones por plan", values: overview.subscriptionsByPlan.map((item) => ({ label: item.plan, count: item.count })) }].map((group) => <section className={product.panel} key={group.title}><div className={product.panelHeader}><h2>{group.title}</h2></div>{group.values.length === 0 ? <p className={styles.status}>Sin suscripciones registradas.</p> : <dl className={styles.breakdown}>{group.values.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{formatNumber(item.count)}</dd></div>)}</dl>}</section>)}
    </div>
  </>;
}

function Administration() {
  const [refresh, setRefresh] = useState(0);
  const access = useAdminAccess(refresh);
  const [days, setDays] = useState(30);
  const [section, setSection] = useState("users");
  const revoke = useCallback(() => window.dispatchEvent(new Event("platform-admin-access-revoked")), []);

  if (!access) return <p role="status">Comprobando acceso de administración…</p>;
  if (access.status !== "allowed") return <section className={product.empty}>
    <h1>{access.status === "unsupported" ? "Administración no disponible" : access.status === "error" ? "No se pudo comprobar el acceso" : "Acceso restringido"}</h1>
    <p>{access.status === "unsupported" ? "Este backend no ofrece el panel de administración global." : access.status === "error" ? access.message : "Necesitas una cuenta verificada con un permiso de administración global. Ser administrador de una organización no concede este acceso."}</p>
    <button className="btn btn-secondary" type="button" onClick={() => setRefresh((value) => value + 1)}>Reintentar</button>
  </section>;

  return <div className={product.content}>
    <header className={product.pageHeader}><div><p className={product.eyebrow}>Administración</p><h1>Administración global</h1><p className={product.lead}>Usuarios, organizaciones y suscripciones de toda la plataforma.</p></div><button type="button" className="btn btn-secondary" onClick={() => setRefresh((value) => value + 1)}>Actualizar</button></header>
    <div className={styles.summaryHeader}><h2>Resumen</h2><label className="field">Periodo de altas<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option><option value={365}>Últimos 365 días</option></select></label></div>
    <Overview days={days} refresh={refresh} onForbidden={revoke} />
    <p className={styles.note}>Las altas corresponden al periodo seleccionado; los totales y las suscripciones reflejan el estado actual. Las cuentas habilitadas no miden actividad de uso ni las suscripciones equivalen a ingresos cobrados.</p>
    <nav className={styles.sections} aria-label="Consultas de administración">{[{ key: "users", label: "Usuarios" }, { key: "organizations", label: "Organizaciones" }, { key: "subscriptions", label: "Suscripciones" }].map((item) => <button className={`btn ${section === item.key ? "btn-primary" : "btn-secondary"}`} type="button" key={item.key} aria-pressed={section === item.key} onClick={() => setSection(item.key)}>{item.label}</button>)}</nav>
    {section === "users" && <Listing key="users" label="Usuarios" columns={userColumns} load={api.adminUsers} refresh={refresh} onForbidden={revoke} />}
    {section === "organizations" && <Listing key="organizations" label="Organizaciones" columns={organizationColumns} load={api.adminOrganizations} refresh={refresh} onForbidden={revoke} />}
    {section === "subscriptions" && <Listing key="subscriptions" label="Suscripciones" columns={subscriptionColumns} load={api.adminSubscriptions} refresh={refresh} onForbidden={revoke} />}
  </div>;
}

function AdminContent() {
  const { user } = useAuth();
  return <AppShell><Administration key={user?.id} /></AppShell>;
}

export default function AdminPage() { return <ProtectedPage><AdminContent /></ProtectedPage>; }
