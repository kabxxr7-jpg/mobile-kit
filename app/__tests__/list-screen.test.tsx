import { waitFor } from "expo-router/testing-library";
import type { ApiClient } from "../src/api/client";
import type { JobPage } from "../src/api/types";
import { abortable, createFakeClient, deferred, httpError, networkError, timeoutError, validationError, type FakeClient } from "./helpers/fakeClient";
import { makeJob, makePage } from "./helpers/fixtures";
import { act, isRefreshing, press, pressLabel, pullToRefresh, reachEnd, renderApp, screen } from "./helpers/renderApp";

let mockClient: ApiClient;
jest.mock("../src/api/default-client", () => ({ getApiClient: () => mockClient }));

let client: FakeClient;
beforeEach(() => {
  client = createFakeClient();
  mockClient = client;
});

const rowIds = () => screen.queryAllByTestId(/^job-row-/).map((el) => el.props.testID as string);
// FlatList only renders its first ~10 rows in a test (there is no layout pass to measure a viewport), so for longer
// lists we read the data the screen handed to the FlatList. That is the screen's decision about what to show.
const dataIds = () => (screen.getByTestId("job-list").props.data as { id: string }[]).map((job) => job.id);

describe("loading", () => {
  test("shows an accessible loading state until the first page arrives, then the list", async () => {
    const first = deferred<JobPage>();
    client.listJobs.mockReturnValue(first.promise);
    await renderApp();

    const loading = screen.getByTestId("loading-state");
    expect(loading.props.accessibilityLabel).toBe("Loading jobs");
    expect(loading.props.accessibilityRole).toBe("progressbar");
    expect(screen.queryByTestId("job-list")).toBeNull();
    expect(screen.queryByTestId("error-state")).toBeNull();
    expect(screen.queryByTestId("empty-state")).toBeNull();

    await act(async () => first.resolve(makePage(1, 2, null)));
    expect(screen.queryByTestId("loading-state")).toBeNull();
    expect(rowIds()).toEqual(["job-row-job-001", "job-row-job-002"]);
  });

  test("asks for the first page with a limit of 10 and no cursor", async () => {
    client.listJobs.mockResolvedValue(makePage(1, 1, null));
    await renderApp();
    await screen.findByTestId("job-list");
    expect(client.listJobs).toHaveBeenCalledTimes(1);
    expect(client.listJobs.mock.calls[0]?.[0]).toEqual({ limit: 10 });
  });

  test("each row is a labelled button that says what the job is", async () => {
    client.listJobs.mockResolvedValue({ items: [makeJob(1, { status: "in_progress", priority: "urgent" })], nextCursor: null });
    await renderApp();
    const row = await screen.findByTestId("job-row-job-001");
    expect(row.props.accessibilityRole).toBe("button");
    expect(row.props.accessibilityLabel).toBe("Replace valve 1, Harbour Bakery 1, In progress, Urgent priority, 2026-06-01 08:00 UTC");
    expect(row.props.accessibilityHint).toBe("Opens the job details");
  });
});

describe("empty", () => {
  test("an empty list shows the empty state with a way to check again, and never the list or an error", async () => {
    client.listJobs.mockResolvedValue({ items: [], nextCursor: null });
    await renderApp();
    await screen.findByTestId("empty-state");
    expect(screen.getByText("No jobs assigned")).toBeTruthy();
    expect(screen.queryByTestId("job-list")).toBeNull();
    expect(screen.queryByTestId("error-state")).toBeNull();
    expect(screen.queryByTestId("loading-state")).toBeNull();
  });

  test("Check again fetches again and shows the jobs that have arrived since", async () => {
    client.listJobs.mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce(makePage(1, 2, null));
    await renderApp();
    await screen.findByTestId("empty-state");
    await pressLabel("Check for new jobs");
    await screen.findByTestId("job-list");
    expect(client.listJobs).toHaveBeenCalledTimes(2);
    expect(rowIds()).toHaveLength(2);
  });

  test("pulling down on the empty state refreshes it", async () => {
    client.listJobs.mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce(makePage(1, 1, null));
    await renderApp();
    await screen.findByTestId("empty-state");
    await pullToRefresh("empty-scroll");
    await screen.findByTestId("job-list");
    expect(client.listJobs).toHaveBeenCalledTimes(2);
  });
});

describe("error", () => {
  test.each([
    ["a 500", httpError(500), "Server problem"],
    ["a 429", httpError(429), "Too many requests"],
    ["a 404", httpError(404), "Not found"],
    ["a 403", httpError(403), "Request rejected"],
    ["no connection", networkError(), "You seem to be offline"],
    ["a timeout", timeoutError(), "The server is not answering"],
    ["a malformed or wrong-shaped payload", validationError(), "Unexpected response"],
  ])("%s shows an error state with its own wording and a Retry button, not a blank screen", async (_name, error, title) => {
    client.listJobs.mockRejectedValue(error);
    await renderApp();
    const view = await screen.findByTestId("error-state");
    expect(view.props.accessibilityRole).toBe("alert");
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByLabelText("Retry loading jobs").props.accessibilityRole).toBe("button");
    expect(screen.queryByTestId("job-list")).toBeNull();
    expect(screen.queryByTestId("loading-state")).toBeNull();
  });

  test("the error text never contains server-supplied detail", async () => {
    client.listJobs.mockRejectedValue(validationError());
    await renderApp();
    await screen.findByTestId("error-state");
    expect(screen.queryByText(/page\.items/)).toBeNull();
  });

  test("Retry goes back to loading, then shows the list when the server has recovered", async () => {
    const second = deferred<JobPage>();
    client.listJobs.mockRejectedValueOnce(httpError(503)).mockReturnValueOnce(second.promise);
    await renderApp();
    await screen.findByTestId("error-state");
    await pressLabel("Retry loading jobs");
    expect(screen.getByTestId("loading-state")).toBeTruthy();
    expect(screen.queryByTestId("error-state")).toBeNull();
    await act(async () => second.resolve(makePage(1, 3, null)));
    expect(rowIds()).toHaveLength(3);
    expect(client.listJobs).toHaveBeenCalledTimes(2);
  });

  test("Retry that fails again shows the error again", async () => {
    client.listJobs.mockRejectedValueOnce(networkError()).mockRejectedValueOnce(httpError(500));
    await renderApp();
    await screen.findByText("You seem to be offline");
    await pressLabel("Retry loading jobs");
    await screen.findByText("Server problem");
    expect(screen.queryByText("You seem to be offline")).toBeNull();
  });

  test("pulling down on the error state also retries", async () => {
    client.listJobs.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(makePage(1, 1, null));
    await renderApp();
    await screen.findByTestId("error-state");
    await pullToRefresh("error-scroll");
    await screen.findByTestId("job-list");
  });

  test("a throw that is not an ApiError is still shown as an error state", async () => {
    client.listJobs.mockRejectedValue(new TypeError("boom"));
    await renderApp();
    await screen.findByTestId("error-state");
  });
});

describe("pull to refresh", () => {
  test("replaces the list with the fresh data and shows the refreshing indicator while it waits", async () => {
    const fresh = deferred<JobPage>();
    client.listJobs.mockResolvedValueOnce(makePage(1, 3, null)).mockReturnValueOnce(fresh.promise);
    await renderApp();
    await screen.findByTestId("job-list");
    expect(isRefreshing()).toBe(false);

    await pullToRefresh();
    expect(isRefreshing()).toBe(true);
    expect(rowIds()).toHaveLength(3); // the old list stays visible

    await act(async () => fresh.resolve({ items: [makeJob(2), makeJob(9, { title: "Brand new job" })], nextCursor: null }));
    expect(isRefreshing()).toBe(false);
    expect(rowIds()).toEqual(["job-row-job-002", "job-row-job-009"]);
    expect(screen.getByText("Brand new job")).toBeTruthy();
    expect(client.listJobs.mock.calls[1]?.[0]).toEqual({ limit: 10 }); // back to the first page, no cursor
  });

  test("a failed refresh keeps the old list and says it may be offline; Try again recovers", async () => {
    const third = deferred<JobPage>();
    client.listJobs.mockResolvedValueOnce(makePage(1, 2, null)).mockRejectedValueOnce(networkError()).mockReturnValueOnce(third.promise);
    await renderApp();
    await screen.findByTestId("job-list");
    await pullToRefresh();
    const banner = await screen.findByTestId("stale-banner");
    expect(banner.props.accessibilityLabel).toBe("You may be offline. Showing the jobs from your last refresh.");
    expect(rowIds()).toEqual(["job-row-job-001", "job-row-job-002"]);
    expect(isRefreshing()).toBe(false);
    expect(screen.queryByTestId("error-state")).toBeNull();

    await pressLabel("Try again");
    // as soon as the new attempt starts the old complaint goes away, and the old list is still shown
    expect(screen.queryByTestId("stale-banner")).toBeNull();
    expect(isRefreshing()).toBe(true);
    expect(rowIds()).toEqual(["job-row-job-001", "job-row-job-002"]);
    await act(async () => third.resolve(makePage(5, 2, null)));
    expect(rowIds()).toEqual(["job-row-job-005", "job-row-job-006"]);
  });

  test("a failed refresh for a server error names the problem instead of 'offline'", async () => {
    client.listJobs.mockResolvedValueOnce(makePage(1, 1, null)).mockRejectedValueOnce(httpError(500));
    await renderApp();
    await screen.findByTestId("job-list");
    await pullToRefresh();
    const banner = await screen.findByTestId("stale-banner");
    expect(banner.props.accessibilityLabel).toBe("Server problem. Showing the jobs from your last refresh.");
  });

  test("a malformed refresh response keeps the old list instead of replacing it with garbage", async () => {
    client.listJobs.mockResolvedValueOnce(makePage(1, 2, null)).mockRejectedValueOnce(validationError());
    await renderApp();
    await screen.findByTestId("job-list");
    await pullToRefresh();
    await screen.findByTestId("stale-banner");
    expect(rowIds()).toHaveLength(2);
  });

  test("a second pull while the first is running cancels the first and ignores its late answer", async () => {
    const slow = deferred<JobPage>();
    const quick = deferred<JobPage>();
    client.listJobs
      .mockResolvedValueOnce(makePage(1, 1, null))
      .mockImplementationOnce((_p, o) => abortable(slow, o?.signal))
      .mockImplementationOnce(() => quick.promise);
    await renderApp();
    await screen.findByTestId("job-list");
    await pullToRefresh();
    const firstSignal = client.listJobs.mock.calls[1]?.[1]?.signal;
    expect(firstSignal?.aborted).toBe(false);
    await pullToRefresh();
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => quick.resolve(makePage(20, 2, null)));
    await act(async () => slow.resolve(makePage(30, 5, null))); // too late: must be ignored
    expect(rowIds()).toEqual(["job-row-job-020", "job-row-job-021"]);
  });

  test("an answer from a client that ignores the abort signal is still dropped when a newer refresh won", async () => {
    const stale = deferred<JobPage>();
    client.listJobs
      .mockResolvedValueOnce(makePage(1, 1, null))
      .mockReturnValueOnce(stale.promise) // never looks at the signal
      .mockResolvedValueOnce(makePage(20, 1, null));
    await renderApp();
    await screen.findByTestId("job-list");
    await pullToRefresh();
    await pullToRefresh();
    await act(async () => stale.resolve(makePage(30, 4, null)));
    expect(rowIds()).toEqual(["job-row-job-020"]);
  });
});

describe("pagination", () => {
  test("reaching the end loads the next page with its cursor and appends it", async () => {
    const more = deferred<JobPage>();
    client.listJobs.mockResolvedValueOnce(makePage(1, 10, "cursor-2")).mockReturnValueOnce(more.promise);
    await renderApp();
    await screen.findByTestId("job-list");
    expect(screen.queryByTestId("end-of-list")).toBeNull();

    await reachEnd();
    expect(screen.getByTestId("loading-more").props.accessibilityLabel).toBe("Loading more jobs");
    expect(client.listJobs.mock.calls[1]?.[0]).toEqual({ cursor: "cursor-2", limit: 10 });
    expect(dataIds()).toHaveLength(10);

    await act(async () => more.resolve(makePage(11, 3, null)));
    expect(screen.queryByTestId("loading-more")).toBeNull();
    expect(dataIds()).toHaveLength(13);
    expect(dataIds()[10]).toBe("job-011");
    expect(screen.getByTestId("end-of-list").props.children).toBe("All 13 jobs loaded");
  });

  test("reaching the end twice while a page is loading sends one request", async () => {
    const more = deferred<JobPage>();
    client.listJobs.mockResolvedValueOnce(makePage(1, 10, "c2")).mockReturnValueOnce(more.promise);
    await renderApp();
    await screen.findByTestId("job-list");
    await reachEnd();
    await reachEnd();
    expect(client.listJobs).toHaveBeenCalledTimes(2);
    await act(async () => more.resolve(makePage(11, 1, null)));
  });

  test("on the last page there is nothing more to load", async () => {
    client.listJobs.mockResolvedValue(makePage(1, 3, null));
    await renderApp();
    await screen.findByTestId("job-list");
    await reachEnd();
    expect(client.listJobs).toHaveBeenCalledTimes(1);
  });

  test("a job that appears on two pages is shown once", async () => {
    client.listJobs.mockResolvedValueOnce(makePage(1, 10, "c2")).mockResolvedValueOnce({ items: [makeJob(10), makeJob(11)], nextCursor: null });
    await renderApp();
    await screen.findByTestId("job-list");
    await reachEnd();
    await waitFor(() => expect(dataIds()).toHaveLength(11));
    expect(new Set(dataIds()).size).toBe(11);
  });

  test("a failed next page keeps page 1, offers Retry, and does not retry by itself", async () => {
    client.listJobs.mockResolvedValueOnce(makePage(1, 10, "c2")).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(makePage(11, 2, null));
    await renderApp();
    await screen.findByTestId("job-list");
    await reachEnd();
    const banner = await screen.findByTestId("more-error");
    expect(banner.props.accessibilityLabel).toContain("Could not load more jobs");
    expect(dataIds()).toHaveLength(10);
    expect(screen.queryByTestId("error-state")).toBeNull();

    await reachEnd(); // scrolling again must not hammer the failing server
    expect(client.listJobs).toHaveBeenCalledTimes(2);

    await pressLabel("Retry");
    await waitFor(() => expect(dataIds()).toHaveLength(12));
    expect(screen.queryByTestId("more-error")).toBeNull();
    expect(client.listJobs.mock.calls[2]?.[0]).toEqual({ cursor: "c2", limit: 10 });
  });

  test("a refresh that starts while the next page is loading cancels it and ignores its answer", async () => {
    const more = deferred<JobPage>();
    client.listJobs
      .mockResolvedValueOnce(makePage(1, 10, "c2"))
      .mockImplementationOnce((_p, o) => abortable(more, o?.signal))
      .mockResolvedValueOnce(makePage(50, 2, null));
    await renderApp();
    await screen.findByTestId("job-list");
    await reachEnd();
    const moreSignal = client.listJobs.mock.calls[1]?.[1]?.signal;
    await pullToRefresh();
    expect(moreSignal?.aborted).toBe(true);
    await act(async () => more.resolve(makePage(11, 10, null)));
    expect(rowIds()).toEqual(["job-row-job-050", "job-row-job-051"]);
    expect(screen.queryByTestId("loading-more")).toBeNull();
  });
});

describe("leaving the screen", () => {
  test("unmounting cancels the request that is still running and a late answer does no harm", async () => {
    const first = deferred<JobPage>();
    client.listJobs.mockReturnValue(first.promise);
    await renderApp();
    const signal = client.listJobs.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    await screen.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => first.resolve(makePage(1, 1, null))); // the jest.setup guard fails the test if React complains
  });

  test("unmounting while the next page loads cancels that request too", async () => {
    const more = deferred<JobPage>();
    client.listJobs.mockResolvedValueOnce(makePage(1, 10, "c2")).mockReturnValueOnce(more.promise);
    await renderApp();
    await screen.findByTestId("job-list");
    await reachEnd();
    const signal = client.listJobs.mock.calls[1]?.[1]?.signal;
    await screen.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe("accessibility", () => {
  test.each([
    ["error", () => client.listJobs.mockRejectedValue(networkError()), "error-state"],
    ["empty", () => client.listJobs.mockResolvedValue({ items: [], nextCursor: null }), "empty-state"],
    ["list", () => client.listJobs.mockResolvedValue(makePage(1, 2, null)), "job-list"],
  ])("every button in the %s state has a role and a label", async (_name, arrange, readyId) => {
    arrange();
    await renderApp();
    await screen.findByTestId(readyId);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(String(button.props.accessibilityLabel ?? "").length).toBeGreaterThan(0);
  });

  test("the pull-to-refresh control has a label", async () => {
    client.listJobs.mockResolvedValue(makePage(1, 1, null));
    await renderApp();
    await screen.findByTestId("job-list");
    const control = screen.getByTestId("job-list").props.refreshControl as { props: { accessibilityLabel: string } };
    expect(control.props.accessibilityLabel).toBe("Pull to refresh the job list");
  });
});

describe("navigation", () => {
  test("pressing a row opens that job", async () => {
    client.listJobs.mockResolvedValue(makePage(1, 3, null));
    const app = await renderApp();
    await screen.findByTestId("job-list");
    await press("job-row-job-002");
    expect(app.getPathname()).toBe("/jobs/job-002");
    await screen.findByTestId("detail-scroll");
  });
});
