/**
 * Run SheetQuery in the browser via Pyodide.
 * Python modules + configs are fetched from see4pablo/sheetquery on GitHub
 * (jsDelivr). Spreadsheet bytes never leave this page.
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

  if (!statusEl || !runBtn || !fileInput || !queriesEl || !outEl) return;

  let pyodidePromise = null;
  let lastOutput = "";

  const setStatus = (text, kind = "") => {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  };

  async function fetchText(path) {
    const res = await fetch(CDN + path, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`Could not load ${path} from sheetquery@${REF} (${res.status})`);
    }
    return res.text();
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
      }

      pyodide.runPython(`
import os, sys
os.chdir("/sheetquery")
if "/sheetquery" not in sys.path:
    sys.path.insert(0, "/sheetquery")
from browser_api import configure
configure(
    aliases_text=open("config/column_aliases.conf", encoding="utf-8").read(),
    segmentation_text=open("config/segmentation.conf", encoding="utf-8").read(),
)
`);
      setStatus("Ready — choose a CSV and run.", "ok");
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
        setStatus("Enter at least one query.", "err");
        return;
      }

      const pyodide = await ensurePyodide();
      setStatus("Running queries…");
      const csvText = await file.text();
      pyodide.globals.set("csv_text", csvText);
      pyodide.globals.set("query_list", queries);
      pyodide.globals.set("source_name", file.name);

      const result = pyodide.runPython(`
from browser_api import run_batch_csv
run_batch_csv(csv_text, list(query_list), source_name=str(source_name))
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

  // Warm Pyodide in the background after paint.
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => {
      ensurePyodide().catch(() => {
        /* status already set on demand */
      });
    });
  }
})();
