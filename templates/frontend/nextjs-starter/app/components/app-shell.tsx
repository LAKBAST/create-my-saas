"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import styles from "./app-shell.module.css";
import { useAuth } from "./auth-provider";
import { Icon, type IconName } from "./icons";
import { PRODUCT_NAME } from "../lib/brand";

const items: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/billing", label: "Facturación", icon: "billing" },
  { href: "/settings", label: "Configuración", icon: "settings" },
  { href: "/account", label: "Cuenta", icon: "user" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "";
  const current = items.find((item) => item.href === pathname);
  return <div className={styles.app}>
    <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
      <Link className={styles.brand} href="/"><span aria-hidden="true">{PRODUCT_NAME.slice(0, 1)}</span>{PRODUCT_NAME}</Link>
      <nav id="main-navigation" aria-label="Navegación principal">
        <p className={styles.navLabel}>Menú</p>
        {items.map((item) => <Link key={item.href} onClick={() => setMenuOpen(false)} className={pathname === item.href ? styles.active : ""} aria-current={pathname === item.href ? "page" : undefined} href={item.href}><Icon name={item.icon} />{item.label}</Link>)}
      </nav>
      <div className={styles.user}>
        <Link href="/account" className={styles.avatar} aria-label="Abrir cuenta">{initials}</Link>
        <div><strong>{user?.name}</strong><small>{user?.email}</small></div>
        <button type="button" className={styles.iconButton} onClick={() => void signOut()} aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="logout" /></button>
      </div>
    </aside>
    {menuOpen && <button type="button" className={styles.backdrop} aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <div className={styles.main}>
      <header className={styles.header}>
        <button className={styles.menuButton} type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="main-navigation" aria-label="Abrir menú"><Icon name="menu" /></button>
        <p className={styles.crumb}><span>{PRODUCT_NAME}</span>{current && <><i aria-hidden="true">/</i><strong>{current.label}</strong></>}</p>
        <span className={styles.session}><span className={styles.statusDot} />Sesión activa</span>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  </div>;
}
