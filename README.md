# see4pablo — mainpage

Static personal site for [dev.see4pablo.cl](https://dev.see4pablo.cl): curriculum, tools, and downloads.

Built for **GitHub Pages** (no server required).

## Local preview

With Nix (recommended):

```bash
nix-shell
serve          # http://localhost:8080 — optional: serve 9000
```

Or without Nix, from this folder:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`. You can also open `index.html` directly in a browser.

## GitHub Pages

1. Create a GitHub repo and push this project.
2. Settings → Pages → Deploy from branch `master` (or `main`), folder `/` (root).
3. Optional custom domain: set `dev.see4pablo.cl` in Pages and put the same name in the `CNAME` file.
4. At NIC Chile, point DNS to GitHub Pages (A/AAAA or CNAME as GitHub documents).

Future subdomain idea (separate site or Pages project): `music.see4pablo.cl`.

## SheetQuery downloads

Place release zips here (not committed until you add them):

| File | Platform |
|------|----------|
| `downloads/SheetQuery-windows.zip` | Windows package from SheetQuery `build_windows_exe.py` |
| `downloads/SheetQuery-macos.zip` | macOS package (when available) |

The `/sheetquery/` page links to those paths. Until a file exists, the button stays disabled in the UI once you wire real URLs—or replace the `href`s when you publish a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github) and point the buttons there instead.

## Content

- Curriculum copy in `index.html` is a **placeholder** until you drop in your real CV.
- English only for the public CV, as requested.
