// Fail any test that makes React or React Native print a warning or an error (act() warnings, state updates after
// unmount, missing keys, ...). Tests that expect an error must spy on console themselves.
let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, "error");
  warnSpy = jest.spyOn(console, "warn");
});

afterEach(() => {
  const calls = [...errorSpy.mock.calls, ...warnSpy.mock.calls];
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  if (calls.length > 0) {
    throw new Error(`console.error or console.warn was called during the test:\n${calls.map((c) => c.map(String).join(" ")).join("\n---\n")}`);
  }
});
