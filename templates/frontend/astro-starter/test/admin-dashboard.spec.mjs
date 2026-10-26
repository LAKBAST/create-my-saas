import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
async function mocks(
  page,
  {
    allowed = true,
    resources = ["users", "organizations", "subscriptions"],
    noBackend = false,
    failUsers = false,
  } = {},
) {
  const state = { revoked: false, requests: [], failUsers, empty: false };
  await page.route("**/auth/refresh", (route) =>
    route.fulfill({
      status: noBackend ? 404 : 200,
      json: {
        accessToken: "test-token",
        user: {
          id: "operator",
          name: "Operator",
          email: "operator@example.test",
          emailVerified: true,
          isActive: true,
        },
      },
    }),
  );
  await page.route("**/api/admin/**", (route) => {
    const url = new URL(route.request().url());
    state.requests.push(url.pathname);
    if (url.pathname.endsWith("/access"))
      return route.fulfill({
        json: { allowed: allowed && !state.revoked, resources },
      });
    if (state.revoked)
      return route.fulfill({
        status: 403,
        json: { error: { code: "PLATFORM_ADMIN_REQUIRED" } },
      });
    if (url.pathname.endsWith("/overview"))
      return route.fulfill({
        json: {
          periodDays: 30,
          totalUsers: 26,
          enabledUsers: 25,
          verifiedUsers: 24,
          newUsers: 6,
          totalOrganizations: resources.includes("organizations") ? 2 : null,
          newOrganizations: 1,
          totalSubscriptions: 2,
          subscriptionsByStatus: [{ status: "active", count: 2 }],
          subscriptionsByPlan: [{ plan: "pro", count: 2 }],
        },
      });
    const current = Number(url.searchParams.get("page") ?? 1);
    const search = url.searchParams.get("search");
    if (state.failUsers && url.pathname.endsWith("/users"))
      return route.fulfill({
        status: 503,
        json: { error: { code: "SERVICE_NOT_READY" } },
      });
    if (state.empty)
      return route.fulfill({
        json: { items: [], total: 0, page: current, pageSize: 25 },
      });
    return route.fulfill({
      json: {
        items: [
          {
            id: "customer",
            name: search
              ? "Filtered customer"
              : current === 1
                ? "<img src=x onerror=alert(1)>"
                : "Second customer",
            email: "customer@example.test",
            emailVerified: true,
            isActive: true,
            createdAt: "2026-10-01T00:00:00Z",
            memberCount: 4,
            slug: "org",
            organizationName: "Organization",
            plan: "pro",
            status: "active",
            seats: 4,
            provider: "stripe",
            currentPeriodEnd: null,
          },
        ],
        total: 26,
        page: current,
        pageSize: 25,
      },
    });
  });
  return state;
}
test("denies ordinary accounts without requesting records", async ({
  page,
}) => {
  const state = await mocks(page, { allowed: false });
  await page.goto("/admin/");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Administración", exact: true }),
  ).toBeHidden();
  expect(state.requests.filter((p) => !p.endsWith("/access"))).toEqual([]);
});
test("loads real resource scope and supports search pagination while escaping names", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/admin/");
  await expect(
    page.getByText("<img src=x onerror=alert(1)>", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("[data-admin-rows] img").count()).toBe(0);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(
    page.getByText("Second customer", { exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("filtered");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByText("Filtered customer", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Organizaciones", exact: true })
    .click();
  await expect(page.getByRole("table")).toContainText("Miembros");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath("desktop.png"),
    fullPage: true,
  });
});
test("Fastify scope hides organization and billing metrics and revocation clears data", async ({
  page,
}) => {
  const state = await mocks(page, { resources: ["users"] });
  await page.goto("/admin/");
  await expect(
    page.getByText("<img src=x onerror=alert(1)>", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Organizaciones", exact: true }),
  ).toBeHidden();
  await expect(page.locator("[data-admin-metrics]")).not.toContainText(
    "Organizaciones",
  );
  state.revoked = true;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  await expect(page.locator("[data-admin-rows]")).toBeEmpty();
});
test("no backend explains unavailable rather than redirecting to login", async ({
  page,
}) => {
  await mocks(page, { noBackend: true });
  await page.goto("/admin/");
  await expect(
    page.getByRole("heading", { name: "Administración no disponible" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/$/);
});
test("mobile content remains inside viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  await page.goto("/admin/");
  await expect(page.getByRole("table")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath("mobile.png"),
    fullPage: true,
  });
});
test("list errors can be retried and empty results remove previous records", async ({
  page,
}) => {
  const state = await mocks(page, { failUsers: true });
  await page.goto("/admin/");
  await expect(page.locator("[data-admin-list-status]")).toContainText(
    "temporalmente",
  );
  await expect(page.getByRole("table")).toBeHidden();
  state.failUsers = false;
  await page
    .getByRole("button", { name: "Reintentar consulta", exact: true })
    .click();
  await expect(
    page.getByText("<img src=x onerror=alert(1)>", { exact: true }),
  ).toBeVisible();
  state.empty = true;
  await page.getByRole("searchbox").fill("absent");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.locator("[data-admin-list-status]")).toHaveText(
    "No hay usuarios para esta consulta.",
  );
  await expect(page.locator("[data-admin-rows]")).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Siguiente", exact: true }),
  ).toBeDisabled();
});
test("real same-origin proxy preserves authorization and keeps the page separate", async ({
  request,
}) => {
  let upstreamPath;
  let authorization;
  const server = createServer((req, res) => {
    upstreamPath = req.url;
    authorization = req.headers.authorization;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "private, no-store");
    res.end(JSON.stringify({ allowed: true, resources: ["users"] }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3328, "127.0.0.1", resolve);
  });
  try {
    const response = await request.get("/api/admin/access", {
      headers: { authorization: "Bearer proxy-smoke" },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      allowed: true,
      resources: ["users"],
    });
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(upstreamPath).toBe("/admin/access");
    expect(authorization).toBe("Bearer proxy-smoke");
    const html = await request.get("/admin/");
    expect(html.status()).toBe(200);
    expect(html.headers()["content-type"]).toContain("text/html");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
