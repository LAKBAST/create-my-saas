"use client";

import { takeOAuthNext } from "../../../lib/safe-next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/auth-provider";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const { completeOAuth } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState<string>();
  useEffect(() => { if (started.current) return; started.current = true; void completeOAuth().then(() => router.replace(takeOAuthNext() ?? "/app")).catch(() => setError("No se ha podido completar el inicio de sesión. Vuelve a intentarlo.")); }, [completeOAuth, router]);
  return <main className="page-status" aria-live="polite">{error ?? "Completando inicio de sesión…"}</main>;
}
