type AdminRequest = (path: string, signal?: AbortSignal) => Promise<unknown>;
type Resource = 'users' | 'organizations' | 'subscriptions';
type RecordRow = Record<string, unknown>;
type Overview = { periodDays: number; totalUsers: number; enabledUsers: number; verifiedUsers: number; newUsers: number;
  totalOrganizations: number | null; newOrganizations: number | null; totalSubscriptions: number | null;
  subscriptionsByStatus: Array<{ status: string; count: number }>; subscriptionsByPlan: Array<{ plan: string; count: number }> };
const labels: Record<Resource, string> = { users: 'Usuarios', organizations: 'Organizaciones', subscriptions: 'Suscripciones' };
let request: AdminRequest;
let generation = 0;
let controller: AbortController | undefined;
let listController: AbortController | undefined;
let resources: Resource[] = [];
let selected: Resource = 'users';
let page = 1;
let search = '';
let bound = false;

function element<T extends HTMLElement = HTMLElement>(selector: string) { return document.querySelector<T>(selector); }
function text(selector: string, value: string) { const node = element(selector); if (node) node.textContent = value; }
function empty(selector: string) { element(selector)?.replaceChildren(); }
function status(error: unknown) { return typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0; }
function message(error: unknown) { return error instanceof Error ? error.message : 'No se han podido cargar los datos.'; }
function showGate(title: string, detail: string) {
  const gate = element('[data-admin-gate]'); if (gate) gate.hidden = false;
  const body = element('[data-admin-body]'); if (body) body.hidden = true;
  text('[data-admin-gate-title]', title); text('[data-admin-gate-detail]', detail);
}
export function clearAdminSession() {
  generation++; controller?.abort(); listController?.abort();
  document.querySelectorAll<HTMLElement>('[data-admin-nav]').forEach((node) => { node.hidden = true; });
  empty('[data-admin-metrics]'); empty('[data-admin-breakdowns]'); empty('[data-admin-rows]');
  showGate('Acceso restringido', 'Necesitas una cuenta verificada con permiso global. Los roles de organización no conceden este acceso.');
}
export function adminUnavailable() {
  clearAdminSession();
  element('[data-protected-content]')?.removeAttribute('hidden');
  showGate('Administración no disponible', 'Conecta un backend compatible para consultar los datos de administración.');
}
function isDenied(error: unknown) {
  if ([401, 403].includes(status(error))) { clearAdminSession(); return true; }
  return false;
}
function formatted(value: unknown) { return typeof value === 'number' ? new Intl.NumberFormat('es-ES').format(value) : String(value ?? '—'); }
function date(value: unknown) { return value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(String(value))) : '—'; }
function appendText(parent: HTMLElement, tag: string, value: string) {
  const child = document.createElement(tag); child.textContent = value; parent.append(child); return child;
}
async function loadOverview(current: number, signal: AbortSignal) {
  text('[data-admin-overview-status]', 'Cargando estadísticas…');
  empty('[data-admin-metrics]'); empty('[data-admin-breakdowns]');
  try {
    const days = element<HTMLSelectElement>('[data-admin-days]')?.value ?? '30';
    const data = await request(`overview?days=${days}`, signal) as Overview;
    if (signal.aborted || current !== generation) return;
    const metrics: Array<[string, number | null, string]> = [
      ['Usuarios registrados', data.totalUsers, `${formatted(data.newUsers)} altas en ${data.periodDays} días`],
      ['Cuentas habilitadas', data.enabledUsers, 'Estado actual de la cuenta'],
      ['Correos verificados', data.verifiedUsers, 'Usuarios con correo confirmado'],
      ...(resources.includes('organizations') ? [['Organizaciones', data.totalOrganizations, `${formatted(data.newOrganizations)} nuevas en ${data.periodDays} días`] as [string, number | null, string]] : []),
      ...(resources.includes('subscriptions') ? [['Suscripciones', data.totalSubscriptions, 'Todos los planes y estados'] as [string, number | null, string]] : []),
    ];
    const target = element('[data-admin-metrics]')!;
    for (const [label, value, detail] of metrics) {
      const card = document.createElement('article'); card.className = 'admin-metric';
      appendText(card, 'h3', label); appendText(card, 'strong', formatted(value)); appendText(card, 'p', detail); target.append(card);
    }
    if (resources.includes('subscriptions')) {
      for (const [title, values] of [
        ['Suscripciones por estado', data.subscriptionsByStatus.map((item) => ({ label: item.status, count: item.count }))],
        ['Suscripciones por plan', data.subscriptionsByPlan.map((item) => ({ label: item.plan, count: item.count }))],
      ] as Array<[string, Array<{ label: string; count: number }>]>) {
        const section = document.createElement('section'); section.className = 'panel admin-breakdown'; appendText(section, 'h3', title);
        if (!values.length) appendText(section, 'p', 'Sin suscripciones registradas.');
        const dl = document.createElement('dl');
        for (const value of values) { const row = document.createElement('div'); appendText(row, 'dt', value.label); appendText(row, 'dd', formatted(value.count)); dl.append(row); }
        section.append(dl); element('[data-admin-breakdowns]')?.append(section);
      }
    }
    text('[data-admin-overview-status]', '');
  } catch (error) { if (!signal.aborted && current === generation && !isDenied(error)) text('[data-admin-overview-status]', message(error)); }
}
const columns: Record<Resource, Array<[string, (row: RecordRow) => string]>> = {
  users: [['Nombre', (row) => String(row.name)], ['Correo', (row) => String(row.email)], ['Estado', (row) => row.isActive ? 'Habilitada' : 'Desactivada'], ['Verificación', (row) => row.emailVerified ? 'Verificado' : 'Sin verificar'], ['Alta (UTC)', (row) => date(row.createdAt)]],
  organizations: [['Organización', (row) => String(row.name)], ['Identificador', (row) => String(row.slug)], ['Miembros', (row) => formatted(row.memberCount)], ['Alta (UTC)', (row) => date(row.createdAt)]],
  subscriptions: [['Organización', (row) => String(row.organizationName)], ['Plan', (row) => String(row.plan)], ['Estado', (row) => `${row.status}${row.cancelAtPeriodEnd ? ' · Cancelación programada' : ''}`], ['Plazas', (row) => formatted(row.seats)], ['Proveedor', (row) => String(row.provider)], ['Fin del periodo (UTC)', (row) => date(row.currentPeriodEnd)]],
};
async function loadList() {
  listController?.abort(); listController = new AbortController();
  const { signal } = listController; const current = generation;
  empty('[data-admin-rows]'); empty('[data-admin-columns]');
  const table = element('[data-admin-table]'); if (table) table.hidden = true;
  element<HTMLButtonElement>('[data-admin-previous]')!.disabled = true;
  element<HTMLButtonElement>('[data-admin-next]')!.disabled = true;
  text('[data-admin-list-title]', labels[selected]); text('[data-admin-search-label]', `Buscar ${labels[selected].toLowerCase()}`);
  text('[data-admin-pagination]', ''); text('[data-admin-list-status]', `Cargando ${labels[selected].toLowerCase()}…`);
  element('[data-admin-list-retry]')!.hidden = true;
  document.querySelectorAll<HTMLButtonElement>('[data-admin-resource]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.adminResource === selected)));
  try {
    const query = new URLSearchParams({ page: String(page), pageSize: '25', search });
    const result = await request(`${selected}?${query}`, signal) as { items: RecordRow[]; total: number; page: number; pageSize: number };
    if (signal.aborted || current !== generation) return;
    const head = element('[data-admin-columns]')!;
    for (const [label] of columns[selected]) { const cell = appendText(head, 'th', label); cell.setAttribute('scope', 'col'); }
    for (const item of result.items) {
      const row = document.createElement('tr');
      for (const [, render] of columns[selected]) appendText(row, 'td', render(item));
      element('[data-admin-rows]')?.append(row);
    }
    if (table) table.hidden = result.items.length === 0;
    text('[data-admin-list-status]', result.items.length ? '' : `No hay ${labels[selected].toLowerCase()} para esta consulta.`);
    text('[data-admin-pagination]', `${formatted(result.total)} resultados · Página ${result.page} de ${Math.max(1, Math.ceil(result.total / result.pageSize))}`);
    element<HTMLButtonElement>('[data-admin-previous]')!.disabled = page <= 1;
    element<HTMLButtonElement>('[data-admin-next]')!.disabled = page >= 10000 || page * result.pageSize >= result.total;
  } catch (error) {
    if (!signal.aborted && current === generation && !isDenied(error)) {
      text('[data-admin-list-status]', message(error)); element('[data-admin-list-retry]')!.hidden = false;
    }
  }
}
async function refresh() {
  generation++; const current = generation; controller?.abort(); listController?.abort(); controller = new AbortController(); const { signal } = controller;
  const onAdminPage = Boolean(element('[data-admin-page]'));
  showGate('Comprobando acceso…', 'Consultando los permisos globales de tu cuenta.');
  try {
    const access = await request('access', signal) as { allowed: boolean; resources?: Resource[] };
    if (signal.aborted || current !== generation) return;
    if (!access.allowed) { clearAdminSession(); return; }
    resources = (access.resources ?? ['users', 'organizations', 'subscriptions']).filter((resource) => resource in labels);
    document.querySelectorAll<HTMLElement>('[data-admin-nav]').forEach((node) => { node.hidden = false; });
    if (!onAdminPage) return;
    if (!resources.includes(selected)) selected = resources[0] ?? 'users';
    document.querySelectorAll<HTMLElement>('[data-admin-resource]').forEach((node) => { node.hidden = !resources.includes(node.dataset.adminResource as Resource); });
    element('[data-admin-gate]')!.hidden = true; element('[data-admin-body]')!.hidden = false;
    await Promise.all([loadOverview(current, signal), loadList()]);
  } catch (error) {
    if (signal.aborted || current !== generation || isDenied(error)) return;
    document.querySelectorAll<HTMLElement>('[data-admin-nav]').forEach((node) => { node.hidden = true; });
    if (status(error) === 404) showGate('Administración no disponible', 'Este backend no ofrece el contrato de administración global.');
    else showGate('No se pudo comprobar el acceso', message(error));
  }
}
export function initializeAdmin(client: AdminRequest) {
  request = client;
  if (!bound && element('[data-admin-page]')) {
    bound = true;
    document.querySelectorAll<HTMLElement>('[data-admin-refresh]').forEach((node) => node.addEventListener('click', () => void refresh()));
    element('[data-admin-days]')?.addEventListener('change', () => void refresh());
    element('[data-admin-list-retry]')?.addEventListener('click', () => void loadList());
    element<HTMLFormElement>('[data-admin-search-form]')?.addEventListener('submit', (event) => { event.preventDefault(); search = element<HTMLInputElement>('[data-admin-search]')!.value.trim(); page = 1; void loadList(); });
    document.querySelectorAll<HTMLButtonElement>('[data-admin-resource]').forEach((button) => button.addEventListener('click', () => { selected = button.dataset.adminResource as Resource; page = 1; search = ''; element<HTMLInputElement>('[data-admin-search]')!.value = ''; void loadList(); }));
    element('[data-admin-previous]')?.addEventListener('click', () => { page = Math.max(1, page - 1); void loadList(); });
    element('[data-admin-next]')?.addEventListener('click', () => { page++; void loadList(); });
  }
  return refresh();
}
