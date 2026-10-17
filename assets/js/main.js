(() => {
  const buttons = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  if (!buttons.length || !panels.length) return;

  const select = (name) => {
    buttons.forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });
    const url = new URL(window.location.href);
    if (name === "home") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", name);
    }
    window.history.replaceState({}, "", url);
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => select(btn.dataset.tab));
  });

  // In-page links like ?tab=cv from the Home panel
  document.querySelectorAll('a[href^="?tab="]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = new URL(link.href, window.location.href);
      const tab = href.searchParams.get("tab");
      if (tab && buttons.some((b) => b.dataset.tab === tab)) {
        event.preventDefault();
        select(tab);
      }
    });
  });

  const params = new URLSearchParams(window.location.search);
  const initial = params.get("tab") || "home";
  select(buttons.some((b) => b.dataset.tab === initial) ? initial : "home");
})();
