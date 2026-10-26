import { proxyBackendRequest } from "../lib/api-proxy.server";

// /admin belongs to the UI; only /api/admin/* forwards to the backend.
export function loader({ request }: { request: Request }) {
  return proxyBackendRequest(request, "/api");
}

export function action({ request }: { request: Request }) {
  return proxyBackendRequest(request, "/api");
}
