export const emptyWorkspace = { version: 1, meters: [], readings: [] };
export const kinds = {
  electricity: { label: "Electricity", unit: "kWh" },
  water: { label: "Water", unit: "m³" },
  gas: { label: "Gas", unit: "m³" },
};
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
function text(value, label, max = 150) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label} is required (up to ${max} characters).`);
  return value.trim();
}
export function parseReading(value) {
  const source = String(value).trim().replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(source))
    throw new Error("Use a positive reading with up to three decimal places.");
  const [whole, fraction = ""] = source.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}
export function rowsFor(state, id) {
  let previous = null;
  return state.readings
    .filter((reading) => reading.meterId === id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((reading) => {
      const consumption =
        previous && !reading.reset ? reading.value - previous.value : null;
      const result = { ...reading, consumption };
      previous = reading;
      return result;
    });
}
export function validate(state) {
  if (
    !state ||
    state.version !== 1 ||
    !Array.isArray(state.meters) ||
    !Array.isArray(state.readings) ||
    state.meters.length > 100 ||
    state.readings.length > 2000
  )
    throw new Error("This is not a valid Meterlog backup.");
  const ids = new Set();
  for (const meter of state.meters) {
    text(meter.id, "ID", 100);
    text(meter.name, "Meter name", 100);
    text(meter.location, "Location", 150);
    if (!Object.hasOwn(kinds, meter.kind) || ids.has(meter.id))
      throw new Error("Invalid meter.");
    ids.add(meter.id);
  }
  const readingIds = new Set();
  const dates = new Set();
  let photoSize = 0;
  for (const reading of state.readings) {
    text(reading.id, "Reading ID", 100);
    const dateKey = `${reading.meterId}:${reading.date}`;
    if (
      !ids.has(reading.meterId) ||
      readingIds.has(reading.id) ||
      dates.has(dateKey) ||
      !validDate(reading.date) ||
      !Number.isSafeInteger(reading.value) ||
      reading.value < 0 ||
      reading.value >= 1e12 ||
      typeof reading.reset !== "boolean" ||
      typeof reading.note !== "string" ||
      reading.note.length > 1000
    )
      throw new Error("Invalid or duplicate meter reading.");
    if (
      reading.photo !== null &&
      (typeof reading.photo !== "string" ||
        reading.photo.length > 350000 ||
        !/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(reading.photo))
    )
      throw new Error("Invalid reading photo.");
    photoSize += reading.photo?.length || 0;
    readingIds.add(reading.id);
    dates.add(dateKey);
  }
  if (photoSize > 10000000)
    throw new Error(
      "Photo storage is full (10 MB). Export your existing records before adding more photos.",
    );
  for (const id of ids) {
    let previous = null;
    for (const reading of rowsFor(state, id)) {
      if (previous && !reading.reset && reading.value < previous.value)
        throw new Error(
          "A reading cannot decrease unless you mark a meter replacement or reset.",
        );
      previous = reading;
    }
  }
  return state;
}
export function addMeter(state, value, id = crypto.randomUUID()) {
  if (state.meters.length >= 100)
    throw new Error("The meter register is full.");
  const meter = {
    id,
    name: text(value.name, "Meter name", 100),
    location: text(value.location, "Location", 150),
    kind: value.kind,
  };
  if (!Object.hasOwn(kinds, meter.kind))
    throw new Error("Choose a meter type.");
  state.meters.push(meter);
  return state;
}
export function addReading(state, value, id = crypto.randomUUID()) {
  if (state.readings.length >= 2000)
    throw new Error("The reading register is full.");
  if (!state.meters.some((meter) => meter.id === value.meterId))
    throw new Error("Choose a meter.");
  if (!validDate(value.date) || value.date > localDate())
    throw new Error("Use a valid date no later than today.");
  state.readings.push({
    id,
    meterId: value.meterId,
    date: value.date,
    value: parseReading(value.value),
    reset: value.reset === true,
    note: String(value.note || "")
      .trim()
      .slice(0, 1000),
    photo: value.photo || null,
  });
  return validate(state);
}
export function removeLatest(state, id) {
  const reading = state.readings.find((reading) => reading.id === id);
  if (!reading) throw new Error("Reading not found.");
  const rows = rowsFor(state, reading.meterId);
  if (rows.at(-1).id !== id)
    throw new Error("Only the latest reading can be removed.");
  state.readings = state.readings.filter((reading) => reading.id !== id);
  return state;
}
export function csv(state) {
  const cell = (value) => {
    const source = String(value ?? "");
    return `"${(/^[\s]*[=+@-]/.test(source) ? "'" : "") + source.replaceAll('"', '""')}"`;
  };
  const rows = state.meters.flatMap((meter) =>
    rowsFor(state, meter.id).map((reading) => [
      meter.name,
      meter.location,
      kinds[meter.kind].unit,
      reading.date,
      reading.value / 1000,
      reading.consumption === null ? "" : reading.consumption / 1000,
      reading.reset ? "yes" : "no",
      reading.note,
    ]),
  );
  return [
    [
      "Meter",
      "Location",
      "Unit",
      "Date",
      "Reading",
      "Consumption since prior reading",
      "Replacement/reset",
      "Note",
    ],
    ...rows,
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
