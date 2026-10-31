import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeError } from "../api/errors";
import type { Job } from "../api/types";
import { Banner } from "../components/Banner";
import { JobRow } from "../components/JobRow";
import { LoadingView, StateView } from "../components/StateView";
import { colors } from "../components/theme";
import { useJobsCache } from "../state/JobsCache";
import { useJobList } from "../state/useJobList";
import { WriteFailureBanner } from "../components/WriteFailureBanner";

export function JobListScreen() {
  const router = useRouter();
  const { state, reload, refresh, loadMore, retryMore } = useJobList();
  const { byId } = useJobsCache();

  const refreshControl = <RefreshControl refreshing={state.refreshing} onRefresh={refresh} accessibilityLabel="Pull to refresh the job list" />;

  if (state.phase === "loading") return <LoadingView label="Loading jobs" />;

  if (state.phase === "error" && state.error) {
    const info = describeError(state.error);
    return (
      <ScrollView testID="error-scroll" contentContainerStyle={styles.fill} refreshControl={refreshControl}>
        <StateView testID="error-state" alert title={info.title} message={info.message} actionLabel="Retry" actionAccessibilityLabel="Retry loading jobs" onAction={reload} />
      </ScrollView>
    );
  }

  const jobs = state.ids.map((id) => byId[id]).filter((job): job is Job => job !== undefined);

  if (jobs.length === 0) {
    return (
      <ScrollView testID="empty-scroll" contentContainerStyle={styles.fill} refreshControl={refreshControl}>
        <StateView testID="empty-state" title="No jobs assigned" message="There is nothing on your list right now. Pull down to check again." actionLabel="Check again" actionAccessibilityLabel="Check for new jobs" onAction={refresh} />
      </ScrollView>
    );
  }

  const footer = state.loadingMore ? (
    <View testID="loading-more" style={styles.footer} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more jobs" accessibilityState={{ busy: true }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : state.moreError ? (
    <Banner testID="more-error" tone="warning" message={`Could not load more jobs. ${describeError(state.moreError).message}`} actionLabel="Retry" onAction={retryMore} />
  ) : state.nextCursor === null ? (
    <Text testID="end-of-list" style={styles.end}>
      {`All ${jobs.length} jobs loaded`}
    </Text>
  ) : undefined;

  const staleInfo = state.error ? describeError(state.error) : null;

  return (
    <View style={styles.root}>
      <WriteFailureBanner />
      {staleInfo ? (
        <Banner
          testID="stale-banner"
          tone="warning"
          message={staleInfo.offlineish ? "You may be offline. Showing the jobs from your last refresh." : `${staleInfo.title}. Showing the jobs from your last refresh.`}
          actionLabel="Try again"
          onAction={refresh}
        />
      ) : null}
      <FlatList
        testID="job-list"
        data={jobs}
        keyExtractor={(job) => job.id}
        renderItem={({ item }) => <JobRow job={item} onPress={() => router.push({ pathname: "/jobs/[id]", params: { id: item.id } })} />}
        refreshControl={refreshControl}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={footer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  footer: { padding: 16, alignItems: "center" },
  end: { padding: 16, textAlign: "center", color: colors.muted },
});
