import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/account", "/billing", "/settings", "/users/", "/organizations/", "/admin", "/api/admin/"],
    },
  };
}
