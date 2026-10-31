import { readFileSync } from "node:fs";
import { join } from "node:path";

// Expo ships the package versions it expects for each SDK in expo/bundledNativeModules.json (this is the table
// `npx expo install --check` compares against). This test does the same comparison offline, from the installed files.
const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const expected = JSON.parse(readFileSync(join(root, "node_modules", "expo", "bundledNativeModules.json"), "utf8")) as Record<string, string>;
const declared = { ...pkg.dependencies, ...pkg.devDependencies };

test("every package that the Expo SDK pins is declared at exactly the version the SDK expects", () => {
  const pinned = Object.keys(declared).filter((name) => name in expected);
  expect(pinned.length).toBeGreaterThanOrEqual(7);
  for (const name of pinned) expect([name, declared[name]]).toEqual([name, expected[name]]);
});

test("the installed packages satisfy what is declared (the lockfile did not drift)", () => {
  for (const name of ["expo", "react", "react-native", "expo-router"]) {
    const installed = (JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
    const range = declared[name] ?? "";
    expect([name, installed.startsWith(range.replace(/^[~^]/, "").split(".").slice(0, 2).join("."))]).toEqual([name, true]);
  }
});
