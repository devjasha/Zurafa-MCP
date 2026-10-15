// Zurafa Preview helper for agent-written pages: click-to-ask, plus live Mermaid with clickable nodes.
window.zurafa = {
  // Puts the text in the terminal prompt that opened this preview; the user still presses Enter.
  explain(text) { window.webkit?.messageHandlers?.zurafa?.postMessage(String(text)); },
};

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-explain]");
  if (target) window.zurafa.explain(target.dataset.explain);
});

window.addEventListener("DOMContentLoaded", async () => {
  if (!window.mermaid) return;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default" });
  await mermaid.run();
  for (const node of document.querySelectorAll(".mermaid .node")) {
    const label = node.textContent.trim();
    if (!label || node.closest("[data-explain]")) continue;
    node.dataset.explain = `Explain "${label}" from the diagram in more detail`;
    node.style.cursor = "pointer";
  }
});
