"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useAuth } from "./auth-provider";

type Access = { userId: string; retry: number; status: "allowed" | "denied" | "unsupported" | "error"; message?: string };

export function useAdminAccess(retry = 0) {
  const { user, status, getAccessToken } = useAuth();
  const [access, setAccess] = useState<Access | null>(null);
  const userId = status === "authenticated" ? user?.id : undefined;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void api.adminAccess(getAccessToken(), controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setAccess({ userId, retry, status: result.allowed ? "allowed" : "denied" });
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
