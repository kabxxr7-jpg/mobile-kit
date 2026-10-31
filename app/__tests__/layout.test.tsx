import { ConfigError } from "../src/api/config";
import type { ApiClient } from "../src/api/client";
import { createFakeClient } from "./helpers/fakeClient";
import { renderApp, screen } from "./helpers/renderApp";

let mockGetClient: () => ApiClient;
jest.mock("../src/api/default-client", () => ({ getApiClient: () => mockGetClient() }));

test("a missing or invalid base URL shows a readable configuration screen instead of crashing", async () => {
  mockGetClient = () => {
    throw new ConfigError("No API base URL. Set EXPO_PUBLIC_API_BASE_URL or expo.extra.apiBaseUrl in app.json.");
  };
  await renderApp();
  const view = screen.getByTestId("config-error");
  expect(view.props.accessibilityRole).toBe("alert");
  expect(screen.getByText("The app is not configured")).toBeTruthy();
  expect(screen.getByText(/EXPO_PUBLIC_API_BASE_URL/)).toBeTruthy();
  expect(screen.queryByTestId("loading-state")).toBeNull();
});

test("an unexpected error while creating the client is not swallowed", async () => {
  mockGetClient = () => {
    throw new Error("something else broke");
  };
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(renderApp()).rejects.toThrow("something else broke");
  spy.mockRestore();
});

test("with a valid client the app starts on the list screen", async () => {
  const client = createFakeClient();
  client.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  mockGetClient = () => client;
  await renderApp();
  await screen.findByTestId("empty-state");
});
