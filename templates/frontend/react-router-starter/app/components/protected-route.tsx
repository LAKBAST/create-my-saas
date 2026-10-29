import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../lib/auth-context";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "anonymous") {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate, status]);

  if (status !== "authenticated") return <main className="page-status" aria-live="polite">Comprobando tu sesión…</main>;
  return <>{children}</>;
}
