<script>
  import { onMount } from "svelte";
  import {
    addMeter,
    addReading,
    csv,
    emptyWorkspace,
    kinds,
    localDate,
    removeLatest,
    rowsFor,
    validate,
  } from "./model";
  import { change, download, photoData, read } from "./repository";
  let state = $state(structuredClone(emptyWorkspace));
  let ready = $state(false);
  let busy = $state(false);
  let message = $state("");
  let tab = $state("readings");
  let selected = $state("");
  let consent = $state(false);
  let previous = $state(null);
  let channel;
  let meter = $derived(
    state.meters.find((item) => item.id === selected) || state.meters[0],
  );
  let rows = $derived(meter ? rowsFor(state, meter.id) : []);
  let latest = $derived(rows.at(-1));
  let total = $derived(
    rows.reduce((sum, row) => sum + (row.consumption || 0), 0),
  );
  let maximum = $derived(
    Math.max(1, ...rows.slice(-10).map((row) => row.consumption || 0)),
  );
  onMount(() => {
    read()
      .then((value) => {
        state = value;
        ready = true;
      })
      .catch(
        () =>
          (message =
            "Browser storage is unavailable. Enable IndexedDB to keep readings."),
      );
    channel = new BroadcastChannel("meterlog-updates");
    channel.onmessage = () =>
      read()
        .then((value) => (state = value))
        .catch((error) => (message = error.message));
    return () => channel.close();
  });
  async function mutate(action, success) {
    busy = true;
    try {
      state = await change(action);
      channel?.postMessage("updated");
      message = success;
      return true;
    } catch (error) {
      message = error.message;
      return false;
    } finally {
      busy = false;
    }
  }
  async function submit(event, type) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = Object.fromEntries(data);
    if (type === "reading") {
      busy = true;
      try {
        values.photo = await photoData(data.get("photo"));
        values.reset = data.get("meterReset") === "on";
      } catch (error) {
        message = error.message;
        busy = false;
        return;
      }
    }
    if (
      await mutate(
        (current) =>
          type === "meter"
            ? addMeter(current, values)
            : addReading(current, values),
        type === "meter"
          ? "Meter registered. Add its first reading to set a baseline."
          : "Reading saved.",
      )
    ) {
      form.reset();
      tab = "readings";
      if (type === "meter") selected = state.meters.at(-1).id;
    }
  }
  async function restore(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!consent)
        throw new Error("Tick the replacement checkbox before restoring.");
      if (file.size > 15000000)
        throw new Error("Use a backup smaller than 15 MB.");
      const value = validate(JSON.parse(await file.text()));
      previous = JSON.parse(JSON.stringify(state));
      if (
        await mutate(
          () => value,
          "Backup restored. You can undo until this page is closed.",
        )
      )
        consent = false;
    } catch (error) {
      message = error.message;
    } finally {
      event.target.value = "";
    }
  }
  function number(value) {
    return (value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 3 });
  }
</script>

<header>
  <a class="brand" href="#main"
    ><span aria-hidden="true">▥</span>meterlog<span>.</span></a
  ><span>READ IT. RECORD IT. KEEP IT.</span><a
    href="https://github.com/goshkaaaa/meterlog">Source ↗</a
  >
</header>
<main id="main">
  <section class="intro">
    <div>
      <p class="eyebrow">THE NUMBERS BEHIND THE EVERYDAY</p>
      <h1>Know what<br />you&apos;re using.</h1>
      <p>
        Readings, photos, and a clear record for every property.<br />A small
        habit that makes the numbers make sense.
      </p>
    </div>
    <div class="meter-display">
      <span
        >LATEST READING / {meter
          ? kinds[meter.kind].unit
          : "NO METER YET"}</span
      ><strong>{latest ? number(latest.value) : "— — —"}</strong>
      <div>
        <span>{meter?.name || "Register your first meter"}</span><span
          >{latest?.date || "No reading recorded"}</span
        >
      </div>
    </div>
  </section>
  <div class="workspace-toolbar">
    <nav aria-label="Workspace">
      <button
        aria-pressed={tab === "readings"}
        onclick={() => (tab = "readings")}>The log</button
      ><button
        aria-pressed={tab === "add-reading"}
        onclick={() => (tab = "add-reading")}>Add reading +</button
      ><button
        aria-pressed={tab === "add-meter"}
        onclick={() => (tab = "add-meter")}>Register meter</button
      ><button
        aria-pressed={tab === "backups"}
        onclick={() => (tab = "backups")}>Backups</button
      >
    </nav>
    {#if state.meters.length}<label class="meter-select"
        ><span class="sr-only">Active meter</span><select bind:value={selected}
          ><option value="" disabled>Choose a meter</option
          >{#each state.meters as item (item.id)}<option value={item.id}
              >{item.name} · {item.location}</option
            >{/each}</select
        ></label
      >{/if}
  </div>
  <p class="notice" role="status">{message}</p>
  {#if tab === "readings"}{#if !state.meters.length}<section class="empty">
        <span>▥</span>
        <h2>A first reading is a starting point.</h2>
        <p>
          Register an electricity, water, or gas meter. Your log starts empty
          and grows with your own readings.
        </p>
        <button
          class="primary"
          disabled={!ready || busy}
          onclick={() => (tab = "add-meter")}
          >Register your first meter +</button
        >
      </section>{:else}<section class="log-summary">
        <div>
          <p class="eyebrow">{meter.location}</p>
          <h2>{meter.name}</h2>
          <p>{kinds[meter.kind].label} · {rows.length} readings</p>
        </div>
        <div class="usage-total">
          <span>RECORDED CONSUMPTION</span><strong
            >{number(total)}<small>{kinds[meter.kind].unit}</small></strong
          >
          <p>Sum of known intervals; replacement gaps excluded.</p>
        </div>
        <button class="outline" onclick={() => window.print()}
          >Print this log ↗</button
        >
      </section>
      {#if rows.length}<section class="chart-section">
          <div class="section-heading">
            <h3>Between the readings.</h3>
            <span
              >Last {Math.min(10, rows.length)} readings · {kinds[meter.kind]
                .unit}</span
            >
          </div>
          <div
            class="chart"
            role="img"
            aria-label={rows
              .slice(-10)
              .map(
                (row) =>
                  `${row.date}: ${row.consumption === null ? "baseline or meter reset" : number(row.consumption) + " " + kinds[meter.kind].unit}`,
              )
              .join(", ")}
          >
            {#each rows.slice(-10) as row (row.id)}<div class="chart-column">
                <span
                  >{row.consumption === null
                    ? "—"
                    : number(row.consumption)}</span
                >
                <div class="bar-track">
                  <i
                    class:baseline={row.consumption === null}
                    style:height={`${Math.max(3, ((row.consumption || 0) / maximum) * 100)}%`}
                  ></i>
                </div>
                <small>{row.date.slice(5)}</small>
              </div>{/each}
          </div>
        </section>{/if}
      <section class="reading-list">
        <div class="section-heading">
          <h3>The reading record.</h3>
          <button
            class="outline"
            onclick={() =>
              download("meterlog-readings.csv", csv(state), "text/csv")}
            >Export all CSV ↓</button
          >
        </div>
        {#if !rows.length}<p class="empty-small">
            No readings yet. Add the first one to establish a baseline.
          </p>{/if}{#each [...rows].reverse() as row (row.id)}<article
            class="reading-card"
          >
            <div>
              <time>{row.date}</time><span
                >{row.reset
                  ? "METER RESET / REPLACEMENT"
                  : row.consumption === null
                    ? "FIRST READING"
                    : "READING"}</span
              >
            </div>
            <strong
              >{number(row.value)}<small>{kinds[meter.kind].unit}</small
              ></strong
            >
            <div class="consumption">
              <span
                >{row.consumption === null
                  ? "No comparable interval"
                  : "+" +
                    number(row.consumption) +
                    " " +
                    kinds[meter.kind].unit}</span
              >
              <p>{row.note || "No note added."}</p>
            </div>
            {#if row.photo}<details>
                <summary>View photo</summary><img
                  src={row.photo}
                  alt={`Meter reading on ${row.date}`}
                />
              </details>{/if}{#if row.id === latest?.id}<button
                class="remove"
                disabled={busy}
                onclick={() =>
                  mutate(
                    (current) => removeLatest(current, row.id),
                    "Latest reading removed. Earlier readings were kept.",
                  )}>Remove latest</button
              >{/if}
          </article>{/each}
      </section>{/if}{/if}
  {#if tab === "add-meter"}<section class="form-layout">
      <div>
        <p class="eyebrow">ONE RECORD PER METER</p>
        <h2>Start with<br />the meter itself.</h2>
        <p>
          Use the property and meter reference you recognise. Units follow the
          meter type.
        </p>
      </div>
      <form onsubmit={(event) => submit(event, "meter")}>
        <label
          >Meter name / reference<input
            name="name"
            maxlength="100"
            required
            placeholder="Kitchen water meter / serial reference"
          /></label
        ><label
          >Property / location<input
            name="location"
            maxlength="150"
            required
          /></label
        ><label
          >Meter type<select name="kind" aria-label="Meter type"
            >{#each Object.entries(kinds) as [value, kind] (value)}<option
                {value}>{kind.label} · {kind.unit}</option
              >{/each}</select
          ></label
        ><button class="primary" disabled={!ready || busy}
          >Register meter +</button
        >
      </form>
    </section>{/if}
  {#if tab === "add-reading"}<section class="form-layout">
      <div>
        <p class="eyebrow">A NUMBER WITH CONTEXT</p>
        <h2>Keep the reading.<br />Keep the proof.</h2>
        <p>
          Add the value shown on the meter. Photos are optional and processed on
          this device before storage.
        </p>
      </div>
      {#if state.meters.length}<form
          onsubmit={(event) => submit(event, "reading")}
        >
          <label
            >Meter<select name="meterId" required value={meter?.id}
              >{#each state.meters as item (item.id)}<option value={item.id}
                  >{item.name} · {kinds[item.kind].unit}</option
                >{/each}</select
            ></label
          >
          <div class="form-row">
            <label
              >Reading date<input
                name="date"
                type="date"
                max={localDate()}
                value={localDate()}
                required
              /></label
            ><label
              >Meter value<input
                name="value"
                inputmode="decimal"
                placeholder="1234.567"
                required
                maxlength="13"
              /></label
            >
          </div>
          <label class="checkbox"
            ><input type="checkbox" name="meterReset" />Meter was replaced or
            reset since the previous reading.</label
          ><label
            >Note<textarea
              name="note"
              maxlength="1000"
              placeholder="Anything useful for the next reading"
            ></textarea></label
          ><label
            >Photo evidence<input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
            /></label
          >
          <p class="small-note">
            One reading per meter per day. Up to 3 decimal places; no estimates
            of bills or tariffs.
          </p>
          <button class="primary" disabled={!ready || busy}
            >{busy ? "Saving…" : "Save reading ↗"}</button
          >
        </form>{:else}<p class="empty-small">
          Register a meter before adding readings.
        </p>{/if}
    </section>{/if}
  {#if tab === "backups"}<section class="backup-panel">
      <h2>A record that stays yours.</h2>
      <p>
        Your log is stored in this browser. Backups include the meters,
        readings, and attached photos.
      </p>
      <button
        class="primary"
        disabled={!ready || busy}
        onclick={() =>
          download(
            "meterlog-backup.json",
            JSON.stringify(state, null, 2),
            "application/json",
          )}>Export backup ↓</button
      ><label class="checkbox"
        ><input type="checkbox" bind:checked={consent} />I want to replace the
        current log with a backup.</label
      ><input
        type="file"
        accept=".json,application/json"
        aria-label="Restore Meterlog backup"
        disabled={!consent || busy}
        onchange={restore}
      />{#if previous}<button
          class="outline"
          onclick={async () => {
            if (
              await mutate(
                () => JSON.parse(JSON.stringify(previous)),
                "Previous log restored.",
              )
            )
              previous = null;
          }}>Undo replacement ↶</button
        >{/if}
    </section>{/if}
</main>
<footer>
  <span class="brand">meterlog.</span>
  <p>Measured, not guessed.</p>
  <span>Saved locally. Export a backup to keep it.</span>
</footer>
