import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

/** A one-line notice above content that is still usable (stale list, failed write). */
export function Banner(props: {
  testID: string;
  tone: "warning" | "danger";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <View testID={props.testID} style={[styles.banner, props.tone === "danger" ? styles.danger : styles.warning]} accessibilityRole="alert" accessible accessibilityLabel={props.message}>
      <Text style={[styles.text, props.tone === "danger" ? styles.dangerText : styles.warningText]}>{props.message}</Text>
      <View style={styles.actions}>
        {props.actionLabel && props.onAction ? (
          <Pressable accessibilityRole="button" accessibilityLabel={props.actionLabel} onPress={props.onAction} style={styles.action}>
            <Text style={styles.actionText}>{props.actionLabel}</Text>
          </Pressable>
        ) : null}
        {props.onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={props.onDismiss} style={styles.action}>
            <Text style={styles.actionText}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: 12, gap: 8 },
  warning: { backgroundColor: colors.warningBackground },
  danger: { backgroundColor: colors.dangerBackground },
  text: { fontSize: 14 },
  warningText: { color: colors.warningText },
  dangerText: { color: colors.danger },
  actions: { flexDirection: "row", gap: 16 },
  action: { minHeight: 44, justifyContent: "center" },
  actionText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
});
