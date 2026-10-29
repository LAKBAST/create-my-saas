"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import styles from "../landing.module.css";

type Plan = { priceId: string; name: string; priceLabel: string | null; labels: string[] };
export function PublicPlans() {
  const { status } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    let active = true;
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
    fetch(base + "/billing/plans", { credentials: "omit" }).then((response) => {
      if (!response.ok) throw new Error("Plans unavailable");
      return response.json() as Promise<{ plans: Plan[] }>;
    }).then((data) => { if (active && Array.isArray(data.plans)) setPlans(data.plans); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!plans.length) return null;
  return <section aria-labelledby="prices"><h2 id="prices">Precios</h2><div className={styles.features}>{plans.map((plan) => {
    const next = "/billing?priceId=" + encodeURIComponent(plan.priceId);
    const href = status === "authenticated" ? next : "/register?next=" + encodeURIComponent(next);
    return <article className={styles.feature} key={plan.priceId}><strong>{plan.name}</strong>{plan.priceLabel && <span>{plan.priceLabel}</span>}<ul>{plan.labels.map((label, index) => <li key={index}>{label}</li>)}</ul><a className="btn btn-primary" href={href}>Elegir plan</a></article>;
  })}</div></section>;
}
