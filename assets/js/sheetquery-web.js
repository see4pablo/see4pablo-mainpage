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

  const statusEl = document.getElementById("sq-status");
  const runBtn = document.getElementById("sq-run");
  const fileInput = document.getElementById("sq-file");
  const queriesEl = document.getElementById("sq-queries");
  const outEl = document.getElementById("sq-output");
  const downloadBtn = document.getElementById("sq-download");
  const ageOnEl = document.getElementById("sq-age-on");
  const ageRangeEl = document.getElementById("sq-age-range");
  const genderOnEl = document.getElementById("sq-gender-on");

  if (!statusEl || !runBtn || !fileInput || !queriesEl || !outEl) return;

  let pyodidePromise = null;
  let lastOutput = "";
  let baseSegmentationText = "";
  let baseAliasesText = "";

  const setStatus = (text, kind = "") => {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  };

  async function fetchText(path) {
    const res = await fetch(CDN + path, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(
        `Could not load ${path} from sheetquery@${REF} (${res.status})`
      );
    }
    return res.text();
  }

  function setConfKey(text, key, value) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) return text.replace(re, line);
    return `${text.trimEnd()}\n${line}\n`;
  }

  function buildSegmentationText() {
    let text = baseSegmentationText;
    if (!text) {
      throw new Error("Segmentation config not loaded yet.");
    }
    const ageOn = ageOnEl && ageOnEl.checked ? "true" : "false";
    const genderOn = genderOnEl && genderOnEl.checked ? "true" : "false";
    const ageRange = (ageRangeEl && ageRangeEl.value.trim()) || "[15:5:80+]";
    text = setConfKey(text, "AGE_SEGMENTATION", ageOn);
    text = setConfKey(text, "GENDER_SEGMENTATION", genderOn);
    text = setConfKey(text, "AGE_RANGE", ageRange);
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

  async function loadPreset(name) {
    setStatus(`Loading queries/${name}.json from SheetQuery…`);
    try {
      const raw = await fetchText(`queries/${name}.json`);
      const data = JSON.parse(raw);
      queriesEl.value = expressionsFromCatalog(data);
      setStatus(`Loaded ${name} from the SheetQuery repo.`, "ok");
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), "err");
    }
  }

  async function ensurePyodide() {
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = (async () => {
      setStatus("Loading Python in the browser (first time can take a minute)…");
      const pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/",
      });
      setStatus("Installing pandas…");
      await pyodide.loadPackage(["pandas", "numpy"]);

      setStatus("Fetching SheetQuery from GitHub…");
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
      setStatus("Ready — choose a CSV, optional preset, then Run.", "ok");
      return pyodide;
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

  // Prefetch configs early so AGE_RANGE UI matches the repo; load dani_y as default.
  (async () => {
    try {
      baseSegmentationText = await fetchText("config/segmentation.conf");
      baseAliasesText = await fetchText("config/column_aliases.conf");
      const match = baseSegmentationText.match(/^AGE_RANGE=(.*)$/m);
      if (match && ageRangeEl) ageRangeEl.value = match[1].trim();
      const ageSeg = baseSegmentationText.match(/^AGE_SEGMENTATION=(.*)$/m);
      if (ageSeg && ageOnEl) {
        ageOnEl.checked = !/^(false|no|0|off)$/i.test(ageSeg[1].trim());
      }
      const genSeg = baseSegmentationText.match(/^GENDER_SEGMENTATION=(.*)$/m);
      if (genSeg && genderOnEl) {
        genderOnEl.checked = !/^(false|no|0|off)$/i.test(genSeg[1].trim());
      }
      await loadPreset("dani_y");
    } catch (err) {
      console.error(err);
      setStatus(
        "Could not prefetch SheetQuery configs/presets. Check the network.",
        "err"
      );
    }
  })();

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
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
        setStatus("Enter at least one query (or load dani_y / dani_y_2).", "err");
        return;
      }

      const pyodide = await ensurePyodide();
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
      runBtn.disabled = false;
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
