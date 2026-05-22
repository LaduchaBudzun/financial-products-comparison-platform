import test from "node:test";
import assert from "node:assert/strict";
import { BoeClient } from "../../src/adapters/external/boeClient.js";

function createClient(csvText) {
  const httpClient = {
    async getText() {
      return csvText;
    }
  };
  return new BoeClient({ httpClient, baseUrl: "https://www.bankofengland.co.uk" });
}

const SAMPLE_CSV = `DATE,IUMBV34,IUMABEDR
31 Jan 2025,4.63,4.75
28 Feb 2025,4.65,4.50
31 Mar 2025,4.54,4.50`;

test("BoeClient parses CSV and returns normalized series", async () => {
  const client = createClient(SAMPLE_CSV);
  const result = await client.fetchSeries(["IUMBV34", "IUMABEDR"], {
    fromDate: new Date("2025-01-01"),
    toDate: new Date("2025-04-01")
  });

  assert.equal(result.source, "Bank of England");
  assert.ok(Array.isArray(result.series["IUMBV34"]));
  assert.equal(result.series["IUMBV34"].length, 3);
  assert.equal(result.series["IUMBV34"][0].value, 4.63);
  assert.equal(result.series["IUMABEDR"][2].value, 4.5);
});

test("BoeClient sorts series by date ascending", async () => {
  const unsortedCsv = `DATE,IUMBV34\n31 Mar 2025,4.54\n28 Feb 2025,4.65\n31 Jan 2025,4.63`;
  const client = createClient(unsortedCsv);
  const result = await client.fetchSeries(["IUMBV34"], {
    fromDate: new Date("2025-01-01"),
    toDate: new Date("2025-04-01")
  });

  const dates = result.series["IUMBV34"].map((p) => p.date);
  assert.equal(dates[0], "2025-01-31");
  assert.equal(dates[1], "2025-02-28");
  assert.equal(dates[2], "2025-03-31");
});

test("BoeClient skips rows with missing values", async () => {
  const csvWithGap = `DATE,IUMBV34\n31 Jan 2025,4.63\n28 Feb 2025,.\n31 Mar 2025,4.54`;
  const client = createClient(csvWithGap);
  const result = await client.fetchSeries(["IUMBV34"], {
    fromDate: new Date("2025-01-01"),
    toDate: new Date("2025-04-01")
  });
  assert.equal(result.series["IUMBV34"].length, 2);
});

test("BoeClient throws ExternalServiceError for empty CSV", async () => {
  const client = createClient("");
  await assert.rejects(
    () => client.fetchSeries(["IUMBV34"], { fromDate: new Date(), toDate: new Date() }),
    (err) => {
      assert.equal(err.constructor.name, "ExternalServiceError");
      return true;
    }
  );
});

test("BoeClient throws on empty series codes", async () => {
  const client = createClient(SAMPLE_CSV);
  await assert.rejects(
    () => client.fetchSeries([], { fromDate: new Date(), toDate: new Date() }),
    (err) => {
      assert.equal(err.constructor.name, "ExternalServiceError");
      return true;
    }
  );
});
