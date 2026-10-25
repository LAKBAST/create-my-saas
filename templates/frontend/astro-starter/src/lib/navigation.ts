import type { IconName } from "./icons";

export type NavigationItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Shortcut card shown on the protected home page. */
  shortcut?: { title: string; text: string; action: string };
};

// Sidebar of the protected area. Extensions that add pages replace this file.
export const appNavigation: NavigationItem[] = [
  { href: "/app/", label: "Inicio", icon: "home" },
  { href: "/settings/", label: "Configuración", icon: "settings", shortcut: { title: "Espacio de trabajo", text: "Preferencias e integraciones de tu producto.", action: "Ver ajustes" } },
  { href: "/account/", label: "Cuenta", icon: "user", shortcut: { title: "Tu perfil", text: "Revisa tus datos y el estado de verificación del correo.", action: "Ver perfil" } },
];
