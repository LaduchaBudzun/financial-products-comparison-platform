import test from "node:test";
import assert from "node:assert/strict";
import { OnsClient } from "../../src/adapters/external/onsClient.js";

function createClient(csvText) {
  const httpClient = {
    async getText() {
      return csvText;
    }
  };
  return new OnsClient({ httpClient, baseUrl: "https://www.ons.gov.uk" });
}

const SAMPLE_CSV = `"Title","CPI ANNUAL RATE 00: ALL ITEMS 2015=100"
"CDID","D7G7"
"Source dataset ID","MM23"
"PreUnit",""
"Unit","%"
"Release date","20-05-2026"
"Next release","17 June 2026"
"Important notes",
"2023","6.7"
"2024","2.5"
"2023 Q1","10.3"
"2025 JAN","3.0"
"2025 FEB","2.8"
"2026 APR","2.8"`;

test("OnsClient parses monthly observations from ONS generator CSV", async () => {
  const client = createClient(SAMPLE_CSV);
  const result = await client.getTimeSeries("d7g7");

  assert.equal(result.source, "Office for National Statistics");
  assert.ok(Array.isArray(result.observations));
  assert.ok(result.observations.length >= 3);

  const apr2026 = result.observations.find((o) => o.date === "2026-04-01");
  assert.ok(apr2026, "Should find APR 2026");
  assert.equal(apr2026.value, 2.8);

  const jan2025 = result.observations.find((o) => o.date === "2025-01-01");
  assert.ok(jan2025, "Should find JAN 2025");
  assert.equal(jan2025.value, 3.0);
});

test("OnsClient parses annual observations as 1 Jan of that year", async () => {
  const client = createClient(SAMPLE_CSV);
  const result = await client.getTimeSeries("d7g7");

  const year2024 = result.observations.find((o) => o.date === "2024-01-01");
  assert.ok(year2024, "Should find annual 2024 entry");
  assert.equal(year2024.value, 2.5);
});

test("OnsClient sorts observations ascending by date", async () => {
  const client = createClient(SAMPLE_CSV);
  const { observations } = await client.getTimeSeries("d7g7");
  for (let i = 1; i < observations.length; i++) {
    assert.ok(observations[i].date >= observations[i - 1].date, "Observations must be sorted ascending");
  }
});

test("OnsClient throws ExternalServiceError when CSV is empty", async () => {
  const client = createClient("");
  await assert.rejects(
    () => client.getTimeSeries("d7g7"),
    (err) => {
      assert.equal(err.constructor.name, "ExternalServiceError");
      return true;
    }
  );
});

test("OnsClient skips metadata rows and non-numeric values", async () => {
  const csv = `"Title","CPI"\n"Unit","%"\n"Important notes",\n"Not a date","bad"\n"2025 MAR","2.6"`;
  const client = createClient(csv);
  const result = await client.getTimeSeries("d7g7");
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].date, "2025-03-01");
  assert.equal(result.observations[0].value, 2.6);
});
