// Starts the mock API.
//   npm run mock-api
//   npm run mock-api -- --port 4010 --host 127.0.0.1 --mode error500 --times 2 --scope read
// --host 0.0.0.0 makes it reachable from other devices on your network (a phone on the same Wi-Fi).
// The /__admin endpoints have no authentication, so only do that on a network you trust.
import { MODES, SCOPES, createMockApi, type Mode, type Scope } from "./server.ts";

function fail(message: string): never {
  console.error(`mock-api: ${message}`);
  process.exit(2);
}

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value`);
  return value;
}
function intOption(name: string, min: number, max: number): number | undefined {
  const raw = option(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fail(`--${name} must be an integer from ${min} to ${max}`);
  return n;
}

const known = new Set(["port", "host", "mode", "scope", "times", "delay-ms", "retry-after"]);
for (const arg of args) {
  if (arg.startsWith("--") && !known.has(arg.slice(2))) fail(`unknown option ${arg}`);
}

const port = intOption("port", 0, 65535) ?? 4010;
const host = option("host") ?? "127.0.0.1";
const mode = option("mode") ?? "normal";
const scope = option("scope") ?? "all";
if (!(MODES as readonly string[]).includes(mode)) fail(`--mode must be one of ${MODES.join(", ")}`);
if (!(SCOPES as readonly string[]).includes(scope)) fail(`--scope must be one of ${SCOPES.join(", ")}`);
const times = intOption("times", 1, 1_000_000);
const delayMs = intOption("delay-ms", 0, 600_000);
const retryAfter = intOption("retry-after", 0, 600_000);

const api = createMockApi();
api.state.config = {
  mode: mode as Mode,
  scope: scope as Scope,
  remaining: times ?? null,
  delayMs: delayMs ?? 5000,
  retryAfterSeconds: retryAfter ?? 1,
};

const { port: boundPort } = await api.listen(port, host);
console.log(`mock-api listening on http://${host}:${boundPort} (mode ${mode}, scope ${scope})`);
if (host === "0.0.0.0") console.log("mock-api: reachable from your network; /__admin has no authentication");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void api.close().then(() => process.exit(0));
  });
}
