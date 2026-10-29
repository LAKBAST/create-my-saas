// Muestra los bloques de contenido con un fundido al entrar en pantalla.
// Los estilos ocultan solo lo marcado con `.reveal` y únicamente si hay JS
// y el sistema no pide reducir el movimiento.
const selectors = [
  'main .section-head',
  'main .feature-row',
  'main .stack-label',
  'main .stack-card',
  'main .step',
  'main .section > .note',
  'main .cta > *',
].join(', ');

const STAGGER_MS = 90;

let observer: IntersectionObserver | undefined;

export function initReveal() {
  const targets = [...document.querySelectorAll<HTMLElement>(selectors)];
  if (!('IntersectionObserver' in window)) return;

  // Tras una navegación con transiciones, los elementos anteriores ya no existen.
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => {
    // Los elementos que aparecen a la vez entran escalonados, en orden de lectura.
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry, index) => {
        const element = entry.target as HTMLElement;
        element.style.setProperty('--reveal-delay', `${index * STAGGER_MS}ms`);
        element.classList.add('is-visible');
        observer?.unobserve(element);
      });
  }, { rootMargin: '0px 0px -8% 0px' });

  for (const element of targets) {
    element.classList.add('reveal');
    observer.observe(element);
  }
}
