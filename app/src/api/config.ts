export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Picks the API base URL: the EXPO_PUBLIC_API_BASE_URL environment variable if set, otherwise `extra.apiBaseUrl`
 * from app.json. Everything in either place ends up readable inside the app bundle, so it must never hold a
 * secret; a URL with embedded credentials is refused for that reason.
 */
export function resolveBaseUrl(input: { env?: string | undefined; extra?: unknown }): string {
  const fromEnv = input.env?.trim();
  const extra = input.extra;
  const fromExtra = typeof extra === "object" && extra !== null ? (extra as Record<string, unknown>)["apiBaseUrl"] : undefined;
  const raw = fromEnv ? fromEnv : typeof fromExtra === "string" ? fromExtra.trim() : "";
  if (raw === "") throw new ConfigError("No API base URL. Set EXPO_PUBLIC_API_BASE_URL or expo.extra.apiBaseUrl in app.json.");
  if (/^https?:\/\/[^/?#]*@/i.test(raw)) throw new ConfigError("The API base URL must not contain credentials (user:password@).");
  if (!/^https?:\/\/[^\s/?#:@]+(:\d{1,5})?(\/[^\s?#]*)?$/i.test(raw)) {
    throw new ConfigError(`The API base URL is not a valid http(s) URL: ${raw}`);
  }
  return raw.replace(/\/+$/, "");
}
