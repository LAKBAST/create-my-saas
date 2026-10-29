import { safeNext, takeOAuthNext } from "./safe-next";
import type { User, UserWire, Authentication as Session, AuthenticationWire } from './api-contract';
import { captureAnalyticsEvent, identifyAnalyticsUser, resetAnalyticsUser } from "./posthog";
import { initializeAdmin, clearAdminSession, adminUnavailable } from "./admin";
import { bootstrapWorkspace } from "./workspaces";

const baseUrl = (import.meta.env?.PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const csrfCookieName = import.meta.env?.PUBLIC_CSRF_COOKIE_NAME ?? "csrf_token";
let accessToken: string | null = null;

class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const API_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_EXISTS: "Ya existe una cuenta con este correo electrónico.",
  INVALID_CREDENTIALS: "El correo o la contraseña no son correctos.",
  USER_INACTIVE: "Esta cuenta está desactivada.",
  MISSING_TOKEN: "Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.",
  INVALID_ACCESS_TOKEN: "Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.",
  EXPIRED_TOKEN: "Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.",
  INVALID_REFRESH_TOKEN: "Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.",
  REFRESH_TOKEN_REUSED: "Por seguridad, hemos cerrado tus sesiones. Inicia sesión de nuevo.",
  INVALID_CSRF_TOKEN: "No se ha podido verificar la solicitud. Recarga la página e inténtalo de nuevo.",
  INVALID_RESET_TOKEN: "El enlace de restablecimiento no es válido o ha caducado.",
  INVALID_VERIFICATION_TOKEN: "El enlace de verificación no es válido o ha caducado.",
  INVALID_TOKEN: "El enlace no es válido, ha caducado o ya se ha utilizado.",
  EMAIL_DELIVERY_UNAVAILABLE: "No hemos podido enviar el correo. Inténtalo de nuevo más tarde.",
  OAUTH_PROVIDER_UNAVAILABLE: "Este proveedor de inicio de sesión no está disponible.",
  OAUTH_CALLBACK_INVALID: "La respuesta del proveedor de inicio de sesión no es válida.",
  OAUTH_STATE_INVALID: "El intento de inicio de sesión ha caducado. Vuelve a intentarlo.",
  OAUTH_EMAIL_UNVERIFIED: "El proveedor no ha confirmado tu correo electrónico.",
  OAUTH_PROVIDER_ERROR: "No se ha podido completar el inicio de sesión con este proveedor.",
  VALIDATION_ERROR: "Revisa los datos introducidos e inténtalo de nuevo.",
  HTTP_400: "Revisa los datos introducidos e inténtalo de nuevo.",
  HTTP_422: "Revisa los datos introducidos e inténtalo de nuevo.",
  RATE_LIMITED: "Has realizado demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",
  RATE_LIMIT_UNAVAILABLE: "El servicio no está disponible temporalmente. Inténtalo de nuevo más tarde.",
  SERVICE_NOT_READY: "El servicio no está disponible temporalmente. Inténtalo de nuevo más tarde.",
  INTERNAL_ERROR: "Ha ocurrido un error inesperado. Inténtalo de nuevo más tarde.",
  INTERNAL_SERVER_ERROR: "Ha ocurrido un error inesperado. Inténtalo de nuevo más tarde.",
  MEMBERSHIP_REQUIRED: "Necesitas pertenecer a esta organización para continuar.",
  ORGANIZATION_ACCESS_DENIED: "No tienes permiso para realizar esta acción en la organización.",
  INSUFFICIENT_ROLE: "No tienes permiso para realizar esta acción en la organización.",
  ORGANIZATION_NOT_FOUND: "No se ha encontrado la organización.",
  MEMBERSHIP_NOT_FOUND: "No se ha encontrado al miembro de la organización.",
  INVALID_ORGANIZATION_SLUG: "El identificador de la organización debe contener letras o números.",
  SLUG_ALREADY_EXISTS: "Ese identificador de organización ya está en uso.",
  ORGANIZATION_SLUG_ALREADY_EXISTS: "Ese identificador de organización ya está en uso.",
  INVALID_INVITATION_EMAIL: "Introduce un correo electrónico válido para la invitación.",
  INVALID_INVITATION: "La invitación no es válida o ha caducado.",
  OWNER_ROLE_PROTECTED: "Transfiere la propiedad antes de cambiar o eliminar al propietario.",
  OWNER_REQUIRED: "Transfiere la propiedad antes de eliminar al propietario.",
  OWNERSHIP_TARGET_NOT_ELIGIBLE: "La propiedad solo puede transferirse a otro miembro activo.",
  LAST_ACTIVE_OWNER: "Transfiere la propiedad antes de desactivar esta cuenta.",
  ACTIVE_PERSONAL_SUBSCRIPTION: "Cancela la renovación de tu suscripción personal en Facturación antes de desactivar la cuenta.",
  BILLING_NOT_CONFIGURED: "La facturación todavía no está configurada.",
  BILLING_PRICE_NOT_AVAILABLE: "El plan seleccionado ya no está disponible.",
  BILLING_CUSTOMER_NOT_FOUND: "Contrata primero un plan para acceder al portal de facturación.",
  BILLING_PROVIDER_ERROR: "No se ha podido conectar con el proveedor de pagos. Inténtalo de nuevo más tarde.",
  ENTITLEMENT_REQUIRED: "Tu plan no incluye esta función.",
  ENTITLEMENT_LIMIT_REACHED: "Has alcanzado el límite de uso de tu plan.",
  INVALID_USAGE_RECORD: "Los datos de uso no son válidos.",
  INVALID_ENTITLEMENT_QUANTITY: "La cantidad solicitada no es válida.",
  INVALID_WEBHOOK_SIGNATURE: "No se ha podido verificar la notificación de pago.",
  INVALID_BILLING_WEBHOOK: "La notificación de pago no es válida.",
  BILLING_ORGANIZATION_MISMATCH: "Los datos de facturación no corresponden a esta organización.",
  BILLING_SUBSCRIPTION_MISMATCH: "La organización ya tiene otra suscripción asociada.",
  BILLING_CUSTOMER_MISMATCH: "La organización ya tiene otro cliente de facturación asociado.",
  INVALID_BILLING_CONFIGURATION: "La facturación no está disponible temporalmente.",
};

export function apiErrorMessage(code: string | undefined, status: number): string {
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  if (status === 400 || status === 422) return "Revisa los datos introducidos e inténtalo de nuevo.";
  if (status === 401) return "Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.";
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status === 404) return "No hemos encontrado el recurso solicitado.";
  if (status === 409) return "No se ha podido completar la operación porque los datos han cambiado.";
  if (status === 429) return API_ERROR_MESSAGES.RATE_LIMITED;
  if (status >= 500) return "El servicio no está disponible temporalmente. Inténtalo de nuevo más tarde.";
  return "La operación no se ha podido completar.";
}

function cookie(name: string) {
  return document.cookie.split(";").map((value) => value.trim().split("=", 2)).find(([key]) => key === name)?.[1];
}

function user(value: UserWire): User {
  return { id: String(value.id), name: String(value.name), email: String(value.email), emailVerified: Boolean(value.emailVerified ?? value.email_verified), isActive: Boolean(value.isActive ?? value.is_active) };
}

async function request<T>(path: string, init: Omit<RequestInit, "body"> & { body?: unknown; token?: string | null } = {}) {
  const { body, token, headers, ...options } = init;
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set("content-type", "application/json");
  if (token) requestHeaders.set("authorization", `Bearer ${token}`);
  const csrf = cookie(csrfCookieName);
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(options.method ?? "GET")) requestHeaders.set("x-csrf-token", csrf);
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { ...options, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body), credentials: "include" }); }
  catch { throw new ApiError("No se ha podido conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.", 0, "NETWORK_ERROR"); }
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = result.error as Record<string, unknown> | undefined;
    const code = typeof error?.code === "string" ? error.code : undefined;
    throw new ApiError(apiErrorMessage(code, response.status), response.status, code);
  }
  return result as T;
}

// Refresh tokens rotate on every use and the backend treats a reused one as
// stolen, revoking every session. Calls in this page share one request, and
// other tabs wait on a Web Lock so each refresh sends the rotated cookie.
let refreshInFlight: Promise<Session> | null = null;
let renewalTimer: ReturnType<typeof setTimeout> | undefined;

function restoreSession(): Promise<Session> {
  const refresh = () => request<AuthenticationWire>("/auth/refresh", { method: "POST" });
  const run = (): Promise<AuthenticationWire> => navigator.locks
    // LockManager types wrap the callback's promise, but it resolves to its value.
    ? navigator.locks.request("auth-refresh", refresh) as unknown as Promise<AuthenticationWire>
    : refresh();
  refreshInFlight ??= run().then((result) => {
    accessToken = String(result.accessToken ?? result.access_token);
    scheduleRenewal(accessToken);
    const session = { accessToken, user: user(result.user) } satisfies Session;
    identifyAnalyticsUser(session.user.id);
    return session;
  }).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

/** Seconds until the access token's `exp` claim, or null when it has none. */
function accessTokenLifetime(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp - Date.now() / 1000 : null;
  } catch { return null; }
}

// Renews the access token a minute before it expires so long-open pages keep working.
function scheduleRenewal(token: string) {
  clearTimeout(renewalTimer);
  const lifetime = accessTokenLifetime(token);
  if (lifetime === null) return;
  const expiresAt = Date.now() + lifetime * 1000;
  const renew = () => { if (Date.now() >= expiresAt - 60_000) void restoreSession().catch(() => { accessToken = null; clearAdminSession(); }); };
  renewalTimer = setTimeout(renew, Math.max(expiresAt - 60_000 - Date.now(), 5_000));
  // Timers are throttled in background tabs, so also check when the tab is shown.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && accessToken === token) renew(); });
}

function setStatus(target: Element | null, message: string, error = false) {
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", error);
  target.classList.toggle("success", !error);
}

async function startOAuth(provider: "google" | "github") {
  try {
    const providers = await request<Array<{ provider: string; configured: boolean }>>("/auth/oauth/providers");
    if (!providers.some((item) => item.provider === provider && item.configured)) throw new ApiError("Este proveedor OAuth no está configurado.", 400);
    const result = await request<Record<string, unknown>>(`/auth/oauth/${provider}`);
    if (typeof result.authorizationUrl !== "string") throw new ApiError("El proveedor OAuth no devolvió una URL de autorización.", 502);
    window.location.assign(result.authorizationUrl);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) window.location.assign(`${baseUrl}/auth/oauth/${provider}/start`);
    else throw cause;
  }
}

function completeForm(form: HTMLFormElement, message: string, heading?: string) {
  const status = form.querySelector("[data-form-status]");
  setStatus(status, message);
  form.querySelectorAll<HTMLElement>("label, button[type=submit]").forEach((node) => { node.hidden = true; });
  if (heading) { const title = document.querySelector("h1"); if (title) title.textContent = heading; }
  document.querySelector<HTMLElement>("[data-oauth]")?.setAttribute("hidden", "");
}

function bindForms() {
  document.querySelectorAll<HTMLFormElement>("[data-auth-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const kind = form.dataset.authForm;
    const values = new FormData(form);
    const status = form.querySelector("[data-form-status]");
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (kind === "reset" && !new URLSearchParams(location.search).get("token")) return setStatus(status, "El enlace de restablecimiento no es válido.", true);
    button?.setAttribute("disabled", "true");
    const originalText = button?.textContent ?? "";
    if (button) button.textContent = kind === "login" ? "Iniciando sesión…" : kind === "register" ? "Creando cuenta…" : kind === "forgot" ? "Enviando…" : "Actualizando…";
    try {
      const password = String(values.get("password") ?? "");
      if (["register", "reset"].includes(kind ?? "") && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) throw new Error("La contraseña debe tener al menos 8 caracteres, una letra y un número.");
      if (kind === "login") {
        const result = await request<AuthenticationWire>("/auth/login", { method: "POST", body: { email: values.get("email"), password: values.get("password") } });
        accessToken = String(result.accessToken ?? result.access_token);
        window.location.assign(safeNext(new URLSearchParams(location.search).get("next")) ?? "/app/"); return;
      }
      if (kind === "register") { await request("/auth/register", { method: "POST", body: { name: values.get("name"), email: values.get("email"), password: values.get("password") } }); captureAnalyticsEvent("signup_requested"); completeForm(form, "Revisa tu correo. Hemos enviado un enlace de verificación a tu correo. Cuando termines, ya puedes iniciar sesión.", "Revisa tu correo"); }
      if (kind === "forgot") { await request("/auth/password/reset/request", { method: "POST", body: { email: values.get("email") } }); completeForm(form, "Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña."); }
      if (kind === "reset") { await request("/auth/password/reset/confirm", { method: "POST", body: { token: new URLSearchParams(location.search).get("token"), newPassword: values.get("password") } }); completeForm(form, "Tu contraseña se ha actualizado. Inicia sesión con la nueva contraseña."); }
    } catch (cause) { setStatus(status, cause instanceof Error ? cause.message : "La operación no se ha podido completar.", true); }
    finally { button?.removeAttribute("disabled"); if (button) button.textContent = originalText; }
  }));
}

function bindOAuth() {
  // The sign-in block stays hidden unless the backend has credentials for a provider.
  const block = document.querySelector<HTMLElement>("[data-oauth]");
  if (block) void request<Array<{ provider: string; configured: boolean }>>("/auth/oauth/providers").then((providers) => {
    const configured = new Set(providers.filter((item) => item.configured).map((item) => item.provider));
    block.querySelectorAll<HTMLButtonElement>("[data-oauth-provider]").forEach((button) => { button.hidden = !configured.has(button.dataset.oauthProvider ?? ""); });
    block.hidden = configured.size === 0;
  }).catch(() => { block.hidden = true; });
  document.querySelectorAll<HTMLButtonElement>("[data-oauth-provider]").forEach((button) => button.addEventListener("click", async () => {
    const status = document.querySelector("[data-oauth-status]");
    button.disabled = true;
    const next = safeNext(new URLSearchParams(location.search).get("next"));
    if (next) sessionStorage.setItem("oauth-next", next); else sessionStorage.removeItem("oauth-next");
    try { await startOAuth(button.dataset.oauthProvider as "google" | "github"); }
    catch (cause) { setStatus(status, cause instanceof Error ? cause.message : "No se ha podido iniciar sesión con este proveedor.", true); button.disabled = false; }
  }));
}

async function bindProtectedPage() {
  if (!("protected" in document.body.dataset)) return;
  try {
    const session = await restoreSession();
    document.querySelectorAll<HTMLElement>("[data-user-name]").forEach((node) => { node.textContent = session.user.name; });
    document.querySelectorAll<HTMLElement>("[data-user-email]").forEach((node) => { node.textContent = session.user.email; });
    document.querySelectorAll<HTMLElement>("[data-user-initials]").forEach((node) => { node.textContent = session.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); });
    document.querySelectorAll<HTMLElement>("[data-account-state]").forEach((node) => { node.textContent = session.user.isActive ? "Cuenta activa" : "Cuenta desactivada"; });
    document.querySelectorAll<HTMLElement>("[data-account-state-badge]").forEach((node) => { node.textContent = session.user.isActive ? "Activa" : "Inactiva"; node.className = session.user.isActive ? "badge badge-success" : "badge badge-danger"; });
    document.querySelectorAll<HTMLElement>("[data-onboarding-progress]").forEach((node) => { node.textContent = String(1 + Number(session.user.emailVerified)); });
    document.querySelectorAll<HTMLElement>("[data-verification]").forEach((node) => { node.textContent = session.user.emailVerified ? "Correo verificado" : "Correo pendiente de verificación"; });
    document.querySelectorAll<HTMLElement>("[data-if-verified]").forEach((node) => { node.hidden = !session.user.emailVerified; });
    document.querySelectorAll<HTMLElement>("[data-if-unverified]").forEach((node) => { node.hidden = session.user.emailVerified; });
    document.querySelector<HTMLElement>("[data-protected-content]")?.removeAttribute("hidden");
    try { await bootstrapWorkspace(request, session.accessToken, false); } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      setStatus(document.querySelector("[data-workspace-status]"), error instanceof Error ? error.message : "No se ha podido preparar tu espacio de trabajo.", true);
    }
    await initializeAdmin((path, signal) => request(`${baseUrl ? "/admin" : "/api/admin"}/${path}`, { token: accessToken, signal, cache: "no-store" }));
  } catch (error) {
    clearAdminSession();
    if (document.querySelector('[data-admin-page]') && error instanceof ApiError && [0, 404].includes(error.status)) adminUnavailable();
    else window.location.replace(`/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
}

async function bindPublicPlans() {
  const root = document.querySelector<HTMLElement>("[data-public-plans]");
  if (!root) return;
  try {
    const response = await fetch(baseUrl + "/billing/plans", { credentials: "omit" });
    if (!response.ok) return;
    const data = await response.json() as { plans: Array<{ priceId: string; name: string; priceLabel: string | null; labels: string[] }> };
    if (!Array.isArray(data.plans) || !data.plans.length) return;
    let authenticated = false;
    try { await restoreSession(); authenticated = true; } catch { /* anonymous */ }
    root.hidden = false;
    for (const plan of data.plans) {
      const card = document.createElement("article"); card.className = "feature";
      const name = document.createElement("strong"); name.textContent = plan.name; card.append(name);
      if (plan.priceLabel) { const price = document.createElement("p"); price.textContent = plan.priceLabel; card.append(price); }
      const list = document.createElement("ul");
      for (const label of plan.labels) { const item = document.createElement("li"); item.textContent = label; list.append(item); }
      card.append(list);
      if (root.dataset.checkout === "true") {
        const next = "/billing/?priceId=" + encodeURIComponent(plan.priceId);
        const link = document.createElement("a"); link.className = "btn btn-primary"; link.textContent = "Elegir plan";
        link.href = authenticated ? next : "/register/?next=" + encodeURIComponent(next); card.append(link);
      }
      root.append(card);
    }
  } catch { /* Backend has no public billing capability. */ }
}

function toggleMobileMenu() {
  const open = document.querySelector("[data-mobile-menu]")?.classList.toggle("open") ?? false;
  document.querySelectorAll<HTMLElement>("[data-mobile-menu-button][aria-expanded]").forEach((button) => button.setAttribute("aria-expanded", String(open)));
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  bindForms(); bindOAuth(); void bindProtectedPage(); bindPublicPlans();
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  if (next) document.querySelectorAll<HTMLAnchorElement>('a[href="/login/"], a[href="/register/"]').forEach((link) => { link.href += "?next=" + encodeURIComponent(next); });
  if (document.querySelector('[data-auth-form="login"]') && new URLSearchParams(location.search).has("passwordChanged")) setStatus(document.querySelector('[data-auth-form="login"] [data-form-status]'), "Contraseña actualizada. Inicia sesión con la nueva contraseña.");
  document.querySelectorAll<HTMLElement>("[data-mobile-menu-button]").forEach((button) => button.addEventListener("click", toggleMobileMenu));
  document.querySelectorAll<HTMLButtonElement>("[data-logout]").forEach((button) => button.addEventListener("click", async () => { try { await request("/auth/logout", { method: "POST" }); } finally { accessToken = null; clearAdminSession(); resetAnalyticsUser(); window.location.assign("/login/"); } }));
  document.querySelectorAll<HTMLButtonElement>("[data-resend-verification]").forEach((button) => button.addEventListener("click", async () => { const status = document.querySelector("[data-account-status]"); button.disabled = true; button.textContent = "Enviando…"; try { if (!accessToken) throw new Error("La sesión ha caducado. Inicia sesión de nuevo."); await request("/auth/email/resend", { method: "POST", token: accessToken }); setStatus(status, "Hemos enviado un nuevo enlace de verificación."); } catch (cause) { setStatus(status, cause instanceof Error ? cause.message : "No se ha podido reenviar el enlace.", true); } finally { button.disabled = false; button.textContent = "Reenviar verificación"; } }));
  document.querySelectorAll<HTMLFormElement>("[data-change-password]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = form.querySelector("[data-password-status]");
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") ?? "");
    const newPassword = String(values.get("newPassword") ?? "");
    if (newPassword !== String(values.get("confirmation") ?? "")) { setStatus(status, "Las contraseñas nuevas no coinciden.", true); return; }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) { setStatus(status, "La contraseña debe tener al menos 8 caracteres, una letra y un número.", true); return; }
    if (button) { button.disabled = true; button.textContent = "Actualizando…"; }
    try {
      if (!accessToken) throw new Error("La sesión ha caducado. Inicia sesión de nuevo.");
      await request("/auth/password/change", { method: "POST", token: accessToken, body: { currentPassword, newPassword } });
      accessToken = null; clearAdminSession(); resetAnalyticsUser();
      window.location.assign("/login/?passwordChanged=1");
    } catch (cause) {
      setStatus(status, cause instanceof ApiError && cause.code === "INVALID_CREDENTIALS" ? "La contraseña actual no es correcta. Si accedes con Google o GitHub, puedes crear una desde «¿Has olvidado tu contraseña?» en el inicio de sesión." : cause instanceof Error ? cause.message : "No se ha podido cambiar la contraseña.", true);
    } finally { if (button) { button.disabled = false; button.textContent = "Cambiar contraseña"; } }
  }));
  if (document.querySelector("[data-oauth-callback]")) void restoreSession().then(() => window.location.replace(takeOAuthNext() ?? "/app/")).catch(() => setStatus(document.querySelector("[data-oauth-status]"), "No se ha podido completar el inicio de sesión. Vuelve a intentarlo.", true));
  if (document.querySelector("[data-verify-email]")) { const token = new URLSearchParams(location.search).get("token"); const status = document.querySelector("[data-verify-status]"); if (!token) setStatus(status, "El enlace de verificación no es válido.", true); else void request("/auth/email/verify", { method: "POST", body: { token } }).then(() => { setStatus(status, "Tu correo se ha verificado correctamente."); const heading = document.querySelector("[data-verify-email] h1"); if (heading) heading.textContent = "Correo verificado"; }).catch((cause) => setStatus(status, cause instanceof Error ? cause.message : "No se ha podido verificar el correo.", true)); }
});
