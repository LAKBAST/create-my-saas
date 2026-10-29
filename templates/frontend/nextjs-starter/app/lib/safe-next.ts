/** Return only an absolute path on this origin, or null for untrusted input. */
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const parsed = new URL(value, "https://example.invalid");
    return parsed.origin === "https://example.invalid" ? value : null;
  } catch {
    return null;
  }
}

export function takeOAuthNext(): string | null {
  const value = safeNext(sessionStorage.getItem("oauth-next"));
  sessionStorage.removeItem("oauth-next");
  return value;
}
