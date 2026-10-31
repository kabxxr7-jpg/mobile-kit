import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { ApiProvider } from "../api/ApiProvider";
import type { ApiClient } from "../api/client";
import { ConfigError } from "../api/config";
import { getApiClient } from "../api/default-client";
import { ConfigErrorScreen } from "../screens/ConfigErrorScreen";
import { JobsCacheProvider } from "../state/JobsCache";

function createClient(): { client: ApiClient } | { configError: string } {
  try {
    return { client: getApiClient() };
  } catch (error) {
    if (error instanceof ConfigError) return { configError: error.message };
    throw error;
  }
}

export default function RootLayout() {
  const resolved = useMemo(createClient, []);
  if ("configError" in resolved) return <ConfigErrorScreen message={resolved.configError} />;
  return (
    <ApiProvider client={resolved.client}>
      <JobsCacheProvider>
        <StatusBar style="dark" />
        <Stack>
          <Stack.Screen name="index" options={{ title: "Field Service Jobs" }} />
          <Stack.Screen name="jobs/[id]" options={{ title: "Job" }} />
        </Stack>
      </JobsCacheProvider>
    </ApiProvider>
  );
}
