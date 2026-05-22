import test from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "../../src/utils/retry.js";

test("withRetry succeeds on first attempt", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return "ok";
  }, { attempts: 2 });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withRetry retries and eventually succeeds", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "done";
    },
    { attempts: 3, baseDelayMs: 1 }
  );
  assert.equal(result, "done");
  assert.equal(calls, 3);
});

test("withRetry throws after exhausting attempts", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++;
          throw new Error("always fails");
        },
        { attempts: 2, baseDelayMs: 1 }
      ),
    /always fails/
  );
  assert.equal(calls, 3); // initial + 2 retries
});

test("withRetry respects shouldRetry=false", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++;
          throw new Error("non-retryable");
        },
        { attempts: 3, baseDelayMs: 1, shouldRetry: () => false }
      ),
    /non-retryable/
  );
  assert.equal(calls, 1);
});
