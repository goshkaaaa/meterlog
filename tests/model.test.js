import test from "node:test";
import assert from "node:assert/strict";
import {
  addMeter,
  addReading,
  csv,
  emptyWorkspace,
  parseReading,
  removeLatest,
  rowsFor,
  validate,
} from "../src/model.js";
const fresh = () =>
  addMeter(
    structuredClone(emptyWorkspace),
    { name: "Meter 1", location: "Flat", kind: "water" },
    "meter",
  );
const add = (state, date, value, reset = false, id = date) =>
  addReading(state, { meterId: "meter", date, value, reset }, id);
test("decimal input uses integer thousandths without rounding drift", () => {
  assert.equal(parseReading("123,456"), 123456);
  assert.equal(parseReading("0.001"), 1);
  assert.throws(() => parseReading("1.2345"), /three decimal/);
});
test("consumption is the difference between chronological readings", () => {
  const state = fresh();
  add(state, "2020-01-01", "100.001");
  add(state, "2020-02-01", "110.002");
  assert.equal(rowsFor(state, "meter")[1].consumption, 10001);
});
test("a lower reading requires an explicit meter reset", () => {
  const state = fresh();
  add(state, "2020-01-01", "100");
  assert.throws(() => add(state, "2020-02-01", "10"), /cannot decrease/);
});
test("replacements create a new baseline rather than negative usage", () => {
  const state = fresh();
  add(state, "2020-01-01", "100");
  add(state, "2020-02-01", "10", true);
  add(state, "2020-03-01", "20");
  assert.deepEqual(
    rowsFor(state, "meter").map((row) => row.consumption),
    [null, null, 10000],
  );
  validate(state);
});
test("backdated readings are validated against their neighbours", () => {
  const state = fresh();
  add(state, "2020-01-01", "100");
  add(state, "2020-03-01", "130");
  assert.throws(() => add(state, "2020-02-01", "140"), /cannot decrease/);
});
test("duplicate days and impossible dates are rejected", () => {
  const state = fresh();
  add(state, "2020-01-01", "100");
  assert.throws(
    () => add(state, "2020-01-01", "110", false, "different"),
    /duplicate/,
  );
  assert.throws(() => add(fresh(), "2020-02-31", "1"), /valid date/);
});
test("only the latest reading can be removed", () => {
  const state = fresh();
  add(state, "2020-01-01", "100");
  add(state, "2020-02-01", "110");
  assert.throws(() => removeLatest(state, "2020-01-01"), /latest/);
  removeLatest(state, "2020-02-01");
  assert.equal(state.readings.length, 1);
});
test("backups reject executable image types and CSV preserves units", () => {
  const state = fresh();
  add(state, "2020-01-01", "100");
  assert.ok(csv(state).includes('"m³"'));
  state.readings[0].photo = "data:image/svg+xml;base64,abc";
  assert.throws(() => validate(state), /photo/);
});
