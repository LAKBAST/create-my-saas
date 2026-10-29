// Cabecera fija que se esconde al bajar y reaparece al subir. Se consulta la
// cabecera en cada scroll porque ClientRouter la sustituye al navegar.
const MIN_DELTA = 6;

export function initStickyHeader() {
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    ticking = false;
    const header = document.querySelector<HTMLElement>('.site-header');
    if (!header) return;
    const y = window.scrollY;
    const delta = y - lastY;
    // Se ignoran los movimientos pequeños para que no parpadee.
    if (Math.abs(delta) < MIN_DELTA) return;
    header.classList.toggle('is-hidden', delta > 0 && y > header.offsetHeight);
    lastY = y;
  };

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });

  document.addEventListener('astro:after-swap', () => { lastY = window.scrollY; });
}
