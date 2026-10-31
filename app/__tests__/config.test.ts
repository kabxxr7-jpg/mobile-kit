import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, resolveBaseUrl } from "../src/api/config";

describe("resolveBaseUrl", () => {
  test("the environment variable wins over app.json extra", () => {
    expect(resolveBaseUrl({ env: "https://api.example.test", extra: { apiBaseUrl: "http://localhost:4010" } })).toBe("https://api.example.test");
  });

  test("falls back to extra.apiBaseUrl when the variable is unset or blank", () => {
    expect(resolveBaseUrl({ env: undefined, extra: { apiBaseUrl: "http://localhost:4010" } })).toBe("http://localhost:4010");
    expect(resolveBaseUrl({ env: "   ", extra: { apiBaseUrl: "http://localhost:4010" } })).toBe("http://localhost:4010");
  });

  test("trims, and strips trailing slashes but keeps a path prefix", () => {
    expect(resolveBaseUrl({ env: "  https://api.example.test/v1//  " })).toBe("https://api.example.test/v1");
    expect(resolveBaseUrl({ env: "http://192.168.1.20:4010/" })).toBe("http://192.168.1.20:4010");
  });

  test.each([undefined, {}, { apiBaseUrl: 5 }, { apiBaseUrl: "" }, null, "text"])("throws ConfigError when nothing usable is configured (%p)", (extra) => {
    expect(() => resolveBaseUrl({ extra })).toThrow(ConfigError);
  });

  test.each(["localhost:4010", "ftp://x.test", "http://", "http://exa mple.test", "api.example.test", "http://host:99999999", "javascript:alert(1)"])("rejects %p", (value) => {
    expect(() => resolveBaseUrl({ env: value })).toThrow(ConfigError);
  });

  test("refuses a URL with embedded credentials, since the bundle is readable by anyone", () => {
    expect(() => resolveBaseUrl({ env: "https://user:pass@api.example.test" })).toThrow(/credentials/);
    expect(() => resolveBaseUrl({ env: "https://token@api.example.test" })).toThrow(/credentials/);
  });
});

describe("app.json", () => {
  const config = JSON.parse(readFileSync(join(__dirname, "..", "app.json"), "utf8")) as { expo: { extra: Record<string, unknown> } };

  test("extra holds only the public API base URL, and it passes validation", () => {
    expect(Object.keys(config.expo.extra)).toEqual(["apiBaseUrl"]);
    expect(() => resolveBaseUrl({ extra: config.expo.extra })).not.toThrow();
  });
});
