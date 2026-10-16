/**
 * Run SheetQuery in the browser via Pyodide.
 * Python modules, configs, and query presets are fetched from
 * see4pablo/sheetquery on GitHub (jsDelivr). Spreadsheet bytes never leave.
 */
(() => {
  const REF = "master";
  const CDN = `https://cdn.jsdelivr.net/gh/see4pablo/sheetquery@${REF}/`;

  const MODULES = [
    "pscv_columns.py",
    "segmentation_config.py",
    "column_aliases.py",
    "age_sex_segmentation.py",
    "query_conditions.py",
    "pscv_classification.py",
    "segmented_query.py",
    "browser_api.py",
  ];

  const CONFIGS = [
    "config/segmentation.conf",
    "config/column_aliases.conf",
  ];

  const PRESET_LABELS = {
    dani_y: "REMP",
    dani_y_2: "Diabetes-REMP",
  };

  const statusEl = document.getElementById("sq-status");
  const runBtn = document.getElementById("sq-run");
  const fileInput = document.getElementById("sq-file");
  const queriesEl = document.getElementById("sq-queries");
  const outEl = document.getElementById("sq-output");
  const downloadBtn = document.getElementById("sq-download");
  const ageOnEl = document.getElementById("sq-age-on");
  const ageStartEl = document.getElementById("sq-age-start");
  const ageStepEl = document.getElementById("sq-age-step");
  const ageOpenEl = document.getElementById("sq-age-open");
  const ageExplainEl = document.getElementById("sq-age-explain");
  const genderOnEl = document.getElementById("sq-gender-on");

  if (!statusEl || !runBtn || !fileInput || !queriesEl || !outEl) return;

  let pyodidePromise = null;
  let lastOutput = "";
  let baseSegmentationText = "";
  let baseAliasesText = "";
  let statusToken = 0;

  const setStatus = (text, kind = "") => {
    statusToken += 1;
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
    return statusToken;
  };

  /** Soft status that will not overwrite a newer message (e.g. preset append). */
  const setStatusIfCurrent = (token, text, kind = "") => {
    if (token !== statusToken) return;
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  };

  async function fetchText(path) {
    const urls = [
      CDN + path,
      `https://raw.githubusercontent.com/see4pablo/sheetquery/${REF}/${path}`,
    ];
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) {
          lastErr = new Error(`Could not load ${path} (${res.status})`);
          continue;
        }
        return await res.text();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error(`Could not load ${path}`);
  }

  function setConfKey(text, key, value) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) return text.replace(re, line);
    return `${text.trimEnd()}\n${line}\n`;
  }

  function parseAgeParts() {
    const start = Number.parseInt(String(ageStartEl?.value || "").trim(), 10);
    const step = Number.parseInt(String(ageStepEl?.value || "").trim(), 10);
    const openRaw = String(ageOpenEl?.value || "").trim().replace(/\+$/, "");
    const openFrom = Number.parseInt(openRaw, 10);
    return {
      start: Number.isFinite(start) ? start : null,
      step: Number.isFinite(step) && step > 0 ? step : null,
      openFrom: Number.isFinite(openFrom) ? openFrom : null,
    };
  }

  function ageRangeFromInputs() {
    const { start, step, openFrom } = parseAgeParts();
    const s = start ?? 15;
    const st = step ?? 5;
    const o = openFrom ?? 80;
    return `[${s}:${st}:${o}+]`;
  }

  function describeAgeBands() {
    if (ageOnEl && !ageOnEl.checked) {
      return "age bands off — counts will not split by age";
    }
    const { start, step, openFrom } = parseAgeParts();
    if (start === null || step === null || openFrom === null) {
      return "age bands → enter lower age, band size, and higher age";
    }
    if (openFrom < start) {
      return "age bands → higher age should be ≥ lower age";
    }
    if ((openFrom - start) % step !== 0) {
      return `age bands → ${openFrom} is not reachable from ${start} with steps of ${step}`;
    }
    const bands = [];
    for (let low = start; low < openFrom; low += step) {
      bands.push(`${low}-${low + step - 1}`);
      if (bands.length >= 3) break;
    }
    const more = start + bands.length * step < openFrom;
    const mid = bands.join(" | ") + (more ? " | …" : "");
    return `age bands → ${mid}${mid ? " | " : ""}${openFrom} and above`;
  }

  function refreshAgeExplain() {
    if (!ageExplainEl) return;
    ageExplainEl.textContent = describeAgeBands();
  }

  function applyAgeRangeToInputs(raw) {
    const m = String(raw || "")
      .trim()
      .match(/^\[?\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*\+?\s*\]?$/);
    if (!m) return;
    if (ageStartEl) ageStartEl.value = m[1];
    if (ageStepEl) ageStepEl.value = m[2];
    if (ageOpenEl) ageOpenEl.value = m[3];
    refreshAgeExplain();
  }

  function buildSegmentationText() {
    let text = baseSegmentationText;
    if (!text) {
      throw new Error("Segmentation config not loaded yet.");
    }
    const ageOn = ageOnEl && ageOnEl.checked ? "true" : "false";
    const genderOn = genderOnEl && genderOnEl.checked ? "true" : "false";
    text = setConfKey(text, "AGE_SEGMENTATION", ageOn);
    text = setConfKey(text, "GENDER_SEGMENTATION", genderOn);
    text = setConfKey(text, "AGE_RANGE", ageRangeFromInputs());
    return text;
  }

  function expressionsFromCatalog(data) {
    let items;
    if (data && Array.isArray(data.queries)) items = data.queries;
    else if (data && Array.isArray(data.consultas)) items = data.consultas;
    else if (Array.isArray(data)) items = data;
    else {
      throw new Error("Unexpected queries JSON shape.");
    }
    const lines = [];
    for (const item of items) {
      if (typeof item === "string" && item.trim()) {
        lines.push(item.trim());
      } else if (item && typeof item === "object") {
        const expr = item.expression || item.expresion;
        if (expr && String(expr).trim()) lines.push(String(expr).trim());
      }
    }
    return lines.join("\n");
  }

  function setRunLoading(on, label = "Run") {
    if (!runBtn) return;
    runBtn.classList.toggle("is-loading", on);
    runBtn.disabled = on;
    runBtn.setAttribute("aria-busy", on ? "true" : "false");
    const labelEl = runBtn.querySelector(".sq-run-label");
    if (labelEl) labelEl.textContent = label;
  }

  /** Replace Expressions with a preset from the SheetQuery repo. */
  async function loadPreset(name) {
    const label = PRESET_LABELS[name] || name;
    setStatus(`Loading ${label} from SheetQuery…`);
    try {
      const raw = await fetchText(`queries/${name}.json`);
      const data = JSON.parse(raw);
      const chunk = expressionsFromCatalog(data);
      if (!chunk) {
        setStatus(`${label} had no expressions.`, "err");
        return;
      }
      queriesEl.value = chunk;
      queriesEl.focus();
      queriesEl.scrollTop = 0;
      const n = chunk.split("\n").filter(Boolean).length;
      setStatus(`Loaded ${n} lines from ${label} into Expressions.`, "ok");
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), "err");
    }
  }

  async function ensurePyodide() {
    if (pyodidePromise) {
      setRunLoading(true, "Loading…");
      try {
        return await pyodidePromise;
      } finally {
        /* caller may keep the spinner for Running… */
      }
    }
    pyodidePromise = (async () => {
      setRunLoading(true, "Loading…");
      const boot = setStatus(
        "Loading Python in the browser (first time can take a minute)…"
      );
      try {
        const pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/",
        });
        setStatusIfCurrent(boot, "Installing pandas…");
        await pyodide.loadPackage(["pandas", "numpy"]);

        setStatusIfCurrent(boot, "Fetching SheetQuery from GitHub…");
        pyodide.FS.mkdirTree("/sheetquery/config");
        for (const path of MODULES) {
          const text = await fetchText(path);
          pyodide.FS.writeFile(`/sheetquery/${path}`, text);
        }
        for (const path of CONFIGS) {
          const text = await fetchText(path);
          pyodide.FS.writeFile(`/sheetquery/${path}`, text);
          if (path.endsWith("segmentation.conf")) baseSegmentationText = text;
          if (path.endsWith("column_aliases.conf")) baseAliasesText = text;
        }

        pyodide.runPython(`
import os, sys
os.chdir("/sheetquery")
if "/sheetquery" not in sys.path:
    sys.path.insert(0, "/sheetquery")
`);
        setStatusIfCurrent(
          boot,
          "Ready — upload a CSV, edit Expressions, then Run.",
          "ok"
        );
        return pyodide;
      } catch (err) {
        pyodidePromise = null;
        throw err;
      } finally {
        setRunLoading(false, "Run");
      }
    })();
    return pyodidePromise;
  }

  function parseQueries(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => loadPreset(btn.dataset.preset));
  });

  [ageStartEl, ageStepEl, ageOpenEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", refreshAgeExplain);
  });
  if (ageOnEl) ageOnEl.addEventListener("change", refreshAgeExplain);
  refreshAgeExplain();

  (async () => {
    try {
      baseSegmentationText = await fetchText("config/segmentation.conf");
      baseAliasesText = await fetchText("config/column_aliases.conf");
      const match = baseSegmentationText.match(/^AGE_RANGE=(.*)$/m);
      if (match) applyAgeRangeToInputs(match[1].trim());
      const ageSeg = baseSegmentationText.match(/^AGE_SEGMENTATION=(.*)$/m);
      if (ageSeg && ageOnEl) {
        ageOnEl.checked = !/^(false|no|0|off)$/i.test(ageSeg[1].trim());
      }
      const genSeg = baseSegmentationText.match(/^GENDER_SEGMENTATION=(.*)$/m);
      if (genSeg && genderOnEl) {
        genderOnEl.checked = !/^(false|no|0|off)$/i.test(genSeg[1].trim());
      }
      refreshAgeExplain();
    } catch (err) {
      console.error(err);
      setStatus(
        "Could not prefetch SheetQuery configs. Check the network.",
        "err"
      );
    }
  })();

  runBtn.addEventListener("click", async () => {
    downloadBtn.hidden = true;
    outEl.textContent = "";
    lastOutput = "";
    try {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        setStatus("Choose a .csv file first.", "err");
        return;
      }
      const queries = parseQueries(queriesEl.value);
      if (!queries.length) {
        setStatus(
          "Add at least one expression (type or load REMP / Diabetes-REMP).",
          "err"
        );
        return;
      }

      setRunLoading(true, "Loading…");
      const pyodide = await ensurePyodide();
      setRunLoading(true, "Running…");

      if (!baseAliasesText) {
        baseAliasesText = await fetchText("config/column_aliases.conf");
      }
      if (!baseSegmentationText) {
        baseSegmentationText = await fetchText("config/segmentation.conf");
      }

      setStatus("Running queries…");
      const csvText = await file.text();
      const segmentationText = buildSegmentationText();

      pyodide.globals.set("csv_text", csvText);
      pyodide.globals.set("query_list", queries);
      pyodide.globals.set("source_name", file.name);
      pyodide.globals.set("aliases_text", baseAliasesText);
      pyodide.globals.set("segmentation_text", segmentationText);

      const result = pyodide.runPython(`
from browser_api import run_batch_csv
run_batch_csv(
    csv_text,
    list(query_list),
    source_name=str(source_name),
    aliases_text=str(aliases_text),
    segmentation_text=str(segmentation_text),
)
`);
      lastOutput = String(result);
      outEl.textContent = lastOutput;
      downloadBtn.hidden = false;
      setStatus("Done. Download or copy the output below.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), "err");
    } finally {
      setRunLoading(false, "Run");
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!lastOutput) return;
    const blob = new Blob([lastOutput], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "batch_sheetquery.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => {
      ensurePyodide().catch(() => {});
    });
  }
})();
