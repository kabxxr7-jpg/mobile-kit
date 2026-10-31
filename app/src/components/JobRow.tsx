import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Job } from "../api/types";
import { PRIORITY_LABEL, STATUS_LABEL, formatScheduled } from "./format";
import { colors } from "./theme";

export function JobRow({ job, onPress }: { job: Job; onPress: () => void }) {
  const label = `${job.title}, ${job.customer}, ${STATUS_LABEL[job.status]}, ${PRIORITY_LABEL[job.priority]} priority, ${formatScheduled(job.scheduledAt)}`;
  return (
    <Pressable testID={`job-row-${job.id}`} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens the job details" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={2}>
          {job.title}
        </Text>
        <Text style={styles.customer}>{job.customer}</Text>
        <Text style={styles.when}>{formatScheduled(job.scheduledAt)}</Text>
      </View>
      <View style={styles.badges}>
        <Text testID={`job-status-${job.id}`} style={[styles.status, job.status === "done" && styles.statusDone]}>
          {STATUS_LABEL[job.status]}
        </Text>
        {job.priority === "urgent" ? <Text style={styles.urgent}>Urgent</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 16, minHeight: 64, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  pressed: { backgroundColor: colors.background },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  customer: { fontSize: 14, color: colors.muted },
  when: { fontSize: 13, color: colors.muted },
  badges: { alignItems: "flex-end", gap: 4 },
  status: { fontSize: 13, fontWeight: "600", color: colors.muted },
  statusDone: { color: colors.done },
  urgent: { fontSize: 12, fontWeight: "700", color: colors.urgent },
});
