import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "../auth.module.css";
import { PRODUCT_NAME } from "../lib/brand";

// Centred card shared by the sign-in, registration and recovery pages.
export function AuthCard({ children }: { children: ReactNode }) {
  return <main className={styles.page}><section className={styles.box}><Link className={styles.brand} to="/"><span aria-hidden="true">{PRODUCT_NAME.slice(0, 1)}</span>{PRODUCT_NAME}</Link>{children}</section></main>;
}
