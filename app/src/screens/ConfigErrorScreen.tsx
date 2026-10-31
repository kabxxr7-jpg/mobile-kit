import { StyleSheet, View } from "react-native";
import { StateView } from "../components/StateView";

/** Shown instead of the app when the API base URL is missing or invalid, so the failure is readable rather than a red box. */
export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <View style={styles.fill}>
      <StateView testID="config-error" alert title="The app is not configured" message={message} />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
