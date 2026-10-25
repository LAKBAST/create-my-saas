import { PRODUCT_NAME } from "./brand";

const defaultSiteUrl = "https://example.com";

export function absoluteUrl(path = "/") {
  return new URL(path, import.meta.env.VITE_PUBLIC_SITE_URL ?? defaultSiteUrl).toString();
}

type PageMetadata = {
  /** Page name; the product name is appended unless the page is the product itself. */
  title: string;
  description: string;
  path: string;
};

function metadata({ title: pageTitle, description, path }: PageMetadata) {
  const url = absoluteUrl(path);
  const title = pageTitle === PRODUCT_NAME ? pageTitle : `${pageTitle} | ${PRODUCT_NAME}`;

  return [
    { title },
    { name: "description", content: description },
    { tagName: "link" as const, rel: "canonical", href: url },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "es_ES" },
    { property: "og:site_name", content: PRODUCT_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

export function publicPageMetadata(page: PageMetadata) {
  return metadata(page);
}

export function privatePageMetadata(page: PageMetadata) {
  return [
    ...metadata(page),
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ];
}
