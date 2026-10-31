import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { ApiProvider } from "../src/api/ApiProvider";
import { ApiError } from "../src/api/errors";
import type { Job } from "../src/api/types";
import { JobsCacheProvider, useJobsCache } from "../src/state/JobsCache";
import { createFakeClient, deferred, httpError } from "./helpers/fakeClient";
import { makeJob } from "./helpers/fixtures";

async function setup() {
  const client = createFakeClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client}>
      <JobsCacheProvider>{children}</JobsCacheProvider>
    </ApiProvider>
  );
  const hook = await renderHook(() => useJobsCache(), { wrapper });
  return { client, result: hook.result };
}

describe("markDone", () => {
  test("changes the job at once, and keeps the server's version once it answers", async () => {
    const { client, result } = await setup();
    const job = makeJob(1);
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    await act(async () => result.current.upsertMany([job]));

    let outcome!: Promise<boolean>;
    await act(async () => {
      outcome = result.current.markDone(job);
    });
    expect(result.current.byId["job-001"]?.status).toBe("done");
    expect(result.current.pending).toEqual({ "job-001": true });

    const fromServer = makeJob(1, { status: "done", notes: "Confirmed by the server" });
    await act(async () => write.resolve(fromServer));
    await expect(outcome).resolves.toBe(true);
    expect(result.current.byId["job-001"]).toEqual(fromServer);
    expect(result.current.pending).toEqual({});
  });

  test("on failure the job is exactly the object that was passed in, and the failure is recorded", async () => {
    const { client, result } = await setup();
    const job = makeJob(1);
    client.setJobStatus.mockRejectedValue(httpError(500));
    await act(async () => result.current.upsertMany([job]));
    let outcome = true;
    await act(async () => {
      outcome = await result.current.markDone(job);
    });
    expect(outcome).toBe(false);
    expect(result.current.byId["job-001"]).toBe(job);
    expect(result.current.pending).toEqual({});
    expect(result.current.writeFailure).toMatchObject({ jobId: "job-001", jobTitle: "Replace valve 1" });
    expect(result.current.writeFailure?.error.status).toBe(500);
  });

  test("a second call for the same job while the first is running does nothing", async () => {
    const { client, result } = await setup();
    const job = makeJob(1);
    const write = deferred<Job>();
    client.setJobStatus.mockReturnValue(write.promise);
    await act(async () => result.current.upsertMany([job]));
    let first!: Promise<boolean>;
    let second = true;
    await act(async () => {
      first = result.current.markDone(job);
      second = await result.current.markDone(job);
    });
    expect(second).toBe(false);
    expect(client.setJobStatus).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve(makeJob(1, { status: "done" })));
    await first;
  });

  test("a job that is already done is not sent again", async () => {
    const { client, result } = await setup();
    let outcome = true;
    await act(async () => {
      outcome = await result.current.markDone(makeJob(1, { status: "done" }));
    });
    expect(outcome).toBe(false);
    expect(client.setJobStatus).not.toHaveBeenCalled();
  });

  test("two different jobs can be saving at the same time", async () => {
    const { client, result } = await setup();
    const a = deferred<Job>();
    const b = deferred<Job>();
    client.setJobStatus.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await act(async () => result.current.upsertMany([makeJob(1), makeJob(2)]));
    await act(async () => {
      void result.current.markDone(makeJob(1));
      void result.current.markDone(makeJob(2));
    });
    expect(result.current.pending).toEqual({ "job-001": true, "job-002": true });
    await act(async () => {
      a.resolve(makeJob(1, { status: "done" }));
      b.reject(httpError(500));
    });
    expect(result.current.byId["job-001"]?.status).toBe("done");
    expect(result.current.byId["job-002"]?.status).toBe("open");
    expect(result.current.writeFailure?.jobId).toBe("job-002");
  });

  test("starting a new write clears the previous failure message", async () => {
    const { client, result } = await setup();
    client.setJobStatus.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(makeJob(1, { status: "done" }));
    await act(async () => {
      await result.current.markDone(makeJob(1));
    });
    expect(result.current.writeFailure).not.toBeNull();
    await act(async () => {
      await result.current.markDone(makeJob(1));
    });
    expect(result.current.writeFailure).toBeNull();
  });

  test("an error that is not an ApiError is recorded as a failure too", async () => {
    const { client, result } = await setup();
    client.setJobStatus.mockRejectedValue(new TypeError("boom"));
    await act(async () => {
      await result.current.markDone(makeJob(1));
    });
    expect(result.current.writeFailure?.error).toBeInstanceOf(ApiError);
  });
});

describe("upsertMany", () => {
  test("adds and replaces jobs by id", async () => {
    const { result } = await setup();
    await act(async () => result.current.upsertMany([makeJob(1), makeJob(2)]));
    await act(async () => result.current.upsertMany([makeJob(2, { title: "Changed" })]));
    expect(Object.keys(result.current.byId)).toEqual(["job-001", "job-002"]);
    expect(result.current.byId["job-002"]?.title).toBe("Changed");
  });

  test("leaves a job alone while its write is in flight, but still updates the others", async () => {
    const { client, result } = await setup();
    client.setJobStatus.mockReturnValue(deferred<Job>().promise);
    await act(async () => result.current.upsertMany([makeJob(1), makeJob(2)]));
    await act(async () => {
      void result.current.markDone(makeJob(1));
    });
    await act(async () => result.current.upsertMany([makeJob(1, { title: "From a refresh" }), makeJob(2, { title: "Also from a refresh" })]));
    expect(result.current.byId["job-001"]).toMatchObject({ title: "Replace valve 1", status: "done" });
    expect(result.current.byId["job-002"]?.title).toBe("Also from a refresh");
  });
});
