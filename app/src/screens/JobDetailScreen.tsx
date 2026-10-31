import { Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeError } from "../api/errors";
import { PRIORITY_LABEL, STATUS_LABEL, formatScheduled } from "../components/format";
import { LoadingView, StateView } from "../components/StateView";
import { colors } from "../components/theme";
import { WriteFailureBanner } from "../components/WriteFailureBanner";
import { useJobsCache } from "../state/JobsCache";
import { useJob } from "../state/useJob";

function Field({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.field} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text testID={testID} style={styles.fieldValue}>
        {value}
      </Text>
    </View>
  );
}

export function JobDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : (params.id ?? "");
  const { job, phase, error, retry } = useJob(id);
  const { pending, markDone } = useJobsCache();

  if (phase === "loading") {
    return (
      <>
        <Stack.Screen options={{ title: "Job" }} />
        <LoadingView label="Loading job" />
      </>
    );
  }
  if (phase === "error" && error) {
    const info = describeError(error);
    const notFound = error.kind === "http" && error.status === 404;
    return (
      <>
        <Stack.Screen options={{ title: "Job" }} />
        <StateView testID="detail-error" alert title={info.title} message={info.message} {...(notFound ? {} : { actionLabel: "Retry", actionAccessibilityLabel: "Retry loading this job", onAction: retry })} />
      </>
    );
  }
  if (!job) return null;

  const saving = pending[job.id] === true;
  const isDone = job.status === "done";
  const buttonLabel = isDone && !saving ? "Job is done" : saving ? "Saving, marking job as done" : "Mark job as done";

  return (
    <>
      <Stack.Screen options={{ title: job.title }} />
      <ScrollView testID="detail-scroll" contentContainerStyle={styles.content}>
        <WriteFailureBanner />
        <Text style={styles.title} accessibilityRole="header">
          {job.title}
        </Text>
        <Field testID="detail-status" label="Status" value={STATUS_LABEL[job.status]} />
        <Field testID="detail-priority" label="Priority" value={PRIORITY_LABEL[job.priority]} />
        <Field testID="detail-customer" label="Customer" value={job.customer} />
        <Field testID="detail-address" label="Address" value={job.address} />
        <Field testID="detail-scheduled" label="Scheduled" value={formatScheduled(job.scheduledAt)} />
        <Field testID="detail-notes" label="Notes" value={job.notes === "" ? "No notes" : job.notes} />
        <Pressable
          testID="mark-done-button"
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          accessibilityState={{ disabled: isDone || saving, busy: saving }}
          disabled={isDone || saving}
          onPress={() => void markDone(job)}
          style={({ pressed }) => [styles.button, (isDone || saving) && styles.buttonDisabled, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>{saving ? "Saving..." : isDone ? "Done" : "Mark as done"}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  field: { gap: 2, paddingVertical: 4 },
  fieldLabel: { fontSize: 13, color: colors.muted },
  fieldValue: { fontSize: 16, color: colors.text },
  button: { marginTop: 12, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primary },
  buttonDisabled: { backgroundColor: colors.muted },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
