import { useEffect, useState } from "react";
import { ApiError, api, type AdminResource } from "../lib/api.client";
import { useAuth } from "../lib/auth-context";

type Access = { userId: string; retry: number; status: "allowed" | "denied" | "unsupported" | "error"; resources?: AdminResource[]; message?: string };

export function useAdminAccess(retry = 0) {
  const { user, status, getAccessToken } = useAuth();
  const [access, setAccess] = useState<Access | null>(null);
  const userId = status === "authenticated" ? user?.id : undefined;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void api.adminAccess(getAccessToken(), controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setAccess({ userId, retry, status: result.allowed ? "allowed" : "denied", resources: result.resources ?? ["users", "organizations", "subscriptions"] });
      if (!result.allowed) window.dispatchEvent(new Event("platform-admin-access-revoked"));
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setAccess({ userId, retry, status: error instanceof ApiError && error.status === 404 ? "unsupported" : error instanceof ApiError && [401, 403].includes(error.status) ? "denied" : "error", message: error instanceof Error ? error.message : "No se pudo comprobar el acceso." });
      if (error instanceof ApiError && [401, 403].includes(error.status)) window.dispatchEvent(new Event("platform-admin-access-revoked"));
    });
    const revoke = () => { controller.abort(); setAccess({ userId, retry, status: "denied" }); };
    window.addEventListener("platform-admin-access-revoked", revoke);
    return () => { controller.abort(); window.removeEventListener("platform-admin-access-revoked", revoke); };
  }, [userId, getAccessToken, retry]);

  return access && access.userId === userId && access.retry === retry ? access : null;
}
