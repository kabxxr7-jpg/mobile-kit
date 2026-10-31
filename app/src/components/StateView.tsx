import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

/** Full-area message used for the loading, empty and error states. */
export function StateView(props: {
  testID: string;
  title: string;
  message?: string;
  /** Marks the view as an alert so screen readers announce it (errors). */
  alert?: boolean;
  actionLabel?: string;
  /** What a screen reader says for the button; defaults to the visible label. */
  actionAccessibilityLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View testID={props.testID} style={styles.container} accessibilityRole={props.alert ? "alert" : undefined} accessible={props.alert ? true : undefined} accessibilityLabel={props.alert ? `${props.title}. ${props.message ?? ""}` : undefined}>
      <Text style={styles.title} accessibilityRole="header">
        {props.title}
      </Text>
      {props.message ? <Text style={styles.message}>{props.message}</Text> : null}
      {props.actionLabel && props.onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={props.actionAccessibilityLabel ?? props.actionLabel} onPress={props.onAction} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{props.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LoadingView({ label }: { label: string }) {
  return (
    <View testID="loading-state" style={styles.container} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: "600", color: colors.text, textAlign: "center" },
  message: { fontSize: 15, color: colors.muted, textAlign: "center" },
  button: { marginTop: 8, minHeight: 44, minWidth: 120, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primary },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: "600" },
});
