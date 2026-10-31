import { waitFor } from "expo-router/testing-library";
import { ApiError } from "../src/api/errors";
import type { ApiClient } from "../src/api/client";
import type { Job } from "../src/api/types";
import { createFakeClient, deferred, httpError, networkError, type FakeClient } from "./helpers/fakeClient";
import { makeJob, makePage } from "./helpers/fixtures";
import { act, press, pressLabel, pullToRefresh, renderApp, screen } from "./helpers/renderApp";

let mockClient: ApiClient;
jest.mock("../src/api/default-client", () => ({ getApiClient: () => mockClient }));

let client: FakeClient;
beforeEach(() => {
  client = createFakeClient();
  mockClient = client;
});

const text = (testID: string): string => String(screen.getByTestId(testID).props.children);
// The list screen stays mounted under the detail screen but is hidden from accessibility, so ask for hidden elements.
const listStatus = (id: string): string => String(screen.getByTestId(`job-status-${id}`, { includeHiddenElements: true }).props.children);

/** Opens the app on the list with three jobs and taps job-001. */
async function openFirstJob(jobs: Job[] = [makeJob(1, { notes: "Key is with the front desk." }), makeJob(2), makeJob(3)]) {
  client.listJobs.mockResolvedValue({ items: jobs, nextCursor: null });
  const app = await renderApp();
  await screen.findByTestId("job-list");
  await press("job-row-job-001");
  await screen.findByTestId("detail-scroll");
  return app;
}

describe("showing a job", () => {
  test("a job the list already loaded opens at once without another request", async () => {
    await openFirstJob();
    expect(client.getJob).not.toHaveBeenCalled();
    expect(text("detail-customer")).toBe("Harbour Bakery 1");
    expect(text("detail-address")).toBe("1 Harbour Lane, Brindle Cove");
    expect(text("detail-scheduled")).toBe("2026-06-01 08:00 UTC");
    expect(text("detail-status")).toBe("Open");
    expect(text("detail-priority")).toBe("Normal");
    expect(text("detail-notes")).toBe("Key is with the front desk.");
  });

  test("empty notes read 'No notes'", async () => {
    await openFirstJob([makeJob(1)]);
    expect(text("detail-notes")).toBe("No notes");
  });

  test("fields are announced as 'Label: value'", async () => {
    await openFirstJob();
    const field = screen.getByLabelText("Customer: Harbour Bakery 1");
    expect(field.props.accessible).toBe(true);
  });
});

describe("opening a job that is not in the list (a link, or the list failed)", () => {
  test("shows a loading state, fetches that one job, then shows it", async () => {
    const pending = deferred<Job>();
    client.getJob.mockReturnValue(pending.promise);
    await renderApp("/jobs/job-009");
    expect(screen.getByTestId("loading-state").props.accessibilityLabel).toBe("Loading job");
    expect(client.getJob.mock.calls[0]?.[0]).toBe("job-009");
    await act(async () => pending.resolve(makeJob(9, { title: "Unblock floor drain" })));
    expect(text("detail-customer")).toBe("Harbour Bakery 9");
    expect(screen.queryByTestId("loading-state")).toBeNull();
  });

  test("a 404 says the job does not exist and offers no useless Retry", async () => {
    client.getJob.mockRejectedValue(httpError(404));
    await renderApp("/jobs/job-404");
    await screen.findByTestId("detail-error");
    expect(screen.getByText("Not found")).toBeTruthy();
    expect(screen.queryByLabelText("Retry loading this job")).toBeNull();
  });

  test("a server error offers Retry, and Retry loads the job", async () => {
    client.getJob.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(makeJob(9));
    await renderApp("/jobs/job-009");
    await screen.findByTestId("detail-error");
    expect(screen.getByText("Server problem")).toBeTruthy();
    await pressLabel("Retry loading this job");
    await screen.findByTestId("detail-scroll");
    expect(client.getJob).toHaveBeenCalledTimes(2);
  });

  test("a network error is described as offline", async () => {
    client.getJob.mockRejectedValue(networkError());
    await renderApp("/jobs/job-009");
    await screen.findByText("You seem to be offline");
  });

  test("leaving before the answer cancels the request", async () => {
    const pending = deferred<Job>();
    client.getJob.mockReturnValue(pending.promise);
    await renderApp("/jobs/job-009");
    const signal = client.getJob.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    await screen.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(makeJob(9)));
  });
});

describe("mark done (optimistic write)", () => {
  test("shows Done at once, in the detail and in the list, then keeps it once the server confirms", async () => {
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    await openFirstJob();
    expect(screen.getByTestId("mark-done-button").props.accessibilityLabel).toBe("Mark job as done");

    await press("mark-done-button");
    // the server has not answered yet
    expect(text("detail-status")).toBe("Done");
    expect(listStatus("job-001")).toBe("Done");
    expect(client.setJobStatus.mock.calls[0]?.slice(0, 2)).toEqual(["job-001", "done"]);
    const button = screen.getByTestId("mark-done-button");
    expect(button.props.accessibilityLabel).toBe("Saving, marking job as done");
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });

    await act(async () => write.resolve(makeJob(1, { status: "done", notes: "Key is with the front desk." })));
    expect(text("detail-status")).toBe("Done");
    expect(listStatus("job-001")).toBe("Done");
    expect(screen.getByTestId("mark-done-button").props.accessibilityLabel).toBe("Job is done");
    expect(screen.queryByTestId("write-failure-banner")).toBeNull();
  });

  test("when the server refuses, the job goes back exactly as it was and the user is told", async () => {
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    await openFirstJob();
    await press("mark-done-button");
    expect(text("detail-status")).toBe("Done");

    await act(async () => write.reject(httpError(500)));
    expect(text("detail-status")).toBe("Open");
    expect(listStatus("job-001")).toBe("Open");
    const banner = screen.getByTestId("write-failure-banner");
    expect(banner.props.accessibilityLabel).toContain('Could not mark "Replace valve 1" as done, so it was changed back.');
    expect(screen.getByTestId("mark-done-button").props.accessibilityLabel).toBe("Mark job as done");
    expect(screen.getByTestId("mark-done-button").props.accessibilityState).toMatchObject({ disabled: false });
  });

  test("a network failure rolls back too, and the second try can succeed (the banner clears when it starts)", async () => {
    client.setJobStatus.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(makeJob(1, { status: "done" }));
    await openFirstJob();
    await press("mark-done-button");
    await screen.findByTestId("write-failure-banner");
    expect(text("detail-status")).toBe("Open");

    await press("mark-done-button");
    await waitFor(() => expect(text("detail-status")).toBe("Done"));
    expect(screen.queryByTestId("write-failure-banner")).toBeNull();
    expect(client.setJobStatus).toHaveBeenCalledTimes(2);
  });

  test("a bad answer to the write (malformed payload) is a failure: rolled back, not a crash", async () => {
    client.setJobStatus.mockRejectedValue(new ApiError("validation", "Unexpected response shape at job.status"));
    await openFirstJob();
    await press("mark-done-button");
    await screen.findByTestId("write-failure-banner");
    expect(text("detail-status")).toBe("Open");
    expect(screen.getByTestId("write-failure-banner").props.accessibilityLabel).toContain("does not understand");
  });

  test("the failure is also visible on the list screen, and can be dismissed", async () => {
    client.setJobStatus.mockRejectedValue(httpError(503));
    await openFirstJob();
    await press("mark-done-button");
    await screen.findByTestId("write-failure-banner");
    expect(listStatus("job-001")).toBe("Open"); // the list screen is still mounted behind the detail
    await pressLabel("Dismiss message");
    expect(screen.queryByTestId("write-failure-banner")).toBeNull();
  });

  test("pressing twice while the first write is running sends only one request", async () => {
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    await openFirstJob();
    await press("mark-done-button");
    await press("mark-done-button");
    expect(client.setJobStatus).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve(makeJob(1, { status: "done" })));
  });

  test("a job that is already done has a disabled button and sends nothing", async () => {
    await openFirstJob([makeJob(1, { status: "done" })]);
    const button = screen.getByTestId("mark-done-button");
    expect(button.props.accessibilityLabel).toBe("Job is done");
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await press("mark-done-button");
    expect(client.setJobStatus).not.toHaveBeenCalled();
  });

  test("a refresh that lands while the write is in flight does not undo the optimistic change", async () => {
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    client.listJobs.mockResolvedValue(makePage(1, 3, null)); // the server still says job-001 is open
    await renderApp();
    await screen.findByTestId("job-list");
    await press("job-row-job-001");
    await screen.findByTestId("detail-scroll");
    await press("mark-done-button");

    await pullToRefresh(); // the list screen is still mounted behind the detail
    expect(client.listJobs).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(listStatus("job-001")).toBe("Done"));
    expect(text("detail-status")).toBe("Done");

    await act(async () => write.resolve(makeJob(1, { status: "done" })));
    expect(listStatus("job-001")).toBe("Done");
  });

  test("a failure after a refresh landed still rolls back to what the user saw before pressing", async () => {
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    client.listJobs.mockResolvedValue(makePage(1, 3, null));
    await renderApp();
    await screen.findByTestId("job-list");
    await press("job-row-job-001");
    await screen.findByTestId("detail-scroll");
    await press("mark-done-button");
    await pullToRefresh();
    await act(async () => write.reject(httpError(500)));
    expect(listStatus("job-001")).toBe("Open");
    expect(text("detail-status")).toBe("Open");
  });

  test("closing the whole app cancels a write that is still running", async () => {
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    await openFirstJob();
    await press("mark-done-button");
    const signal = client.setJobStatus.mock.calls[0]?.[2]?.signal;
    expect(signal?.aborted).toBe(false);
    await screen.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => write.reject(new ApiError("aborted", "cancelled")));
  });
});

describe("accessibility", () => {
  test("the title is a header and the action is a labelled button", async () => {
    await openFirstJob();
    expect(screen.getByRole("header", { name: "Replace valve 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark job as done" })).toBeTruthy();
  });
});
