// Comportamiento del menú móvil (<details data-mobile-menu>). Los listeners van
// en document para seguir funcionando cuando ClientRouter sustituye la cabecera.
export function initMobileMenu() {
  // `toggle` no burbujea: se escucha en fase de captura.
  document.addEventListener('toggle', (event) => {
    const menu = event.target as HTMLElement;
    if (!(menu instanceof HTMLDetailsElement) || !menu.matches('[data-mobile-menu]')) return;
    const english = document.documentElement.lang === 'en';
    menu.querySelector('summary')?.setAttribute('aria-label', english ? (menu.open ? 'Close menu' : 'Open menu') : (menu.open ? 'Cerrar menú' : 'Abrir menú'));
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = document.querySelector<HTMLDetailsElement>('[data-mobile-menu][open]');
    if (!menu) return;
    menu.open = false;
    menu.querySelector('summary')?.focus({ preventScroll: true });
  });
}
