import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import RootLayout from "../../src/app/_layout";
import Index from "../../src/app/index";
import JobDetailRoute from "../../src/app/jobs/[id]";

/** Renders the REAL layout and routes. The test file must mock ../src/api/default-client to supply the client. */
export function renderApp(initialUrl = "/") {
  return renderRouter({ _layout: RootLayout, index: Index, "jobs/[id]": JobDetailRoute }, { initialUrl });
}

/** Calls the RefreshControl's onRefresh the way a pull gesture would (works while another screen covers the list). */
export async function pullToRefresh(testID = "job-list") {
  const control = screen.getByTestId(testID, { includeHiddenElements: true }).props.refreshControl as { props: { onRefresh: () => void } };
  await act(async () => {
    control.props.onRefresh();
  });
}

export function isRefreshing(testID = "job-list"): boolean {
  const control = screen.getByTestId(testID).props.refreshControl as { props: { refreshing: boolean } };
  return control.props.refreshing;
}

/** Scrolls to the end of the list (calls FlatList's onEndReached). */
export async function reachEnd() {
  await act(async () => {
    screen.getByTestId("job-list").props.onEndReached({ distanceFromEnd: 0 });
  });
}

export async function press(testID: string) {
  await fireEvent.press(screen.getByTestId(testID));
}

export async function pressLabel(label: string) {
  await fireEvent.press(screen.getByLabelText(label));
}

export { act, screen };
