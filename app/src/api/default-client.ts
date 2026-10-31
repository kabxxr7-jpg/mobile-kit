import Constants from "expo-constants";
import { createApiClient, type ApiClient } from "./client";
import { resolveBaseUrl } from "./config";

let cached: ApiClient | undefined;

/** The one client the real app uses. Throws ConfigError if the base URL is missing or invalid. */
export function getApiClient(): ApiClient {
  if (!cached) {
    // The literal `process.env.EXPO_PUBLIC_...` is replaced at bundle time; it cannot be read through a variable.
    const baseUrl = resolveBaseUrl({ env: process.env.EXPO_PUBLIC_API_BASE_URL, extra: Constants.expoConfig?.extra });
    cached = createApiClient({ baseUrl });
  }
  return cached;
}
