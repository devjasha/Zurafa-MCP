---
name: zurafa-preview
description: Show mathematical formulas, Mermaid diagrams, and interactive animated explainers in Zurafa Preview. Use when the user asks to visualize math, architecture, flows, sequences, state, or relationships, or when a visual would materially improve an explanation or learning session.
compatibility: Requires macOS 14+, a running Zurafa daemon with layout.preview support, Node.js 22.13+, and npm dependencies installed in this package.
---

# Zurafa Preview

Render one focused visual and open it beside the current Zurafa pane.

1. Choose `math` for a formula or derivation and `mermaid` for a flow, sequence, state, class, timeline, mind map, or relationship diagram. Choose `html` when the user benefits from clicking into parts or from motion: stepping through an algorithm, animating a process, or a diagram whose nodes they can ask about.
2. Keep the visual legible at side-pane width. Split dense material into separate visuals.
3. Pipe the source to the bundled script, resolving the script relative to this skill directory:

```bash
printf '%s' 'E = mc^2' | node "<skill-directory>/../../scripts/show.mjs" math
```

```bash
node "<skill-directory>/../../scripts/show.mjs" mermaid <<'MERMAID'
flowchart LR
  Question --> Explanation
  Explanation --> Understanding
MERMAID
```

For `html`, write one self-contained page (inline CSS and JS) and pipe it in. The Preview is offline: network requests are blocked and only files beside the page load. Two helpers are copied there for you:

- `<script src="mermaid.min.js"></script>` — put diagrams in `<pre class="mermaid">…</pre>`; after `zurafa.js` renders them, every node is clickable.
- `<script src="zurafa.js"></script>` — any element with `data-explain="Explain why RK4 averages four slopes"` becomes clickable, and `zurafa.explain(text)` does the same from your own JS.

A click places that text in the user's prompt without sending it, so write it as the follow-up question the user would ask. When it arrives, answer it, and extend or re-render the page if a new visual helps. Use transparent or `prefers-color-scheme`-aware colors, keep controls (play, pause, step) visible at side-pane width, and avoid canvas sizes wider than the pane.

```bash
node "<skill-directory>/../../scripts/show.mjs" html <<'HTML'
<!doctype html>
<style>body{font:14px system-ui;color:CanvasText} .step{cursor:pointer}</style>
<script src="mermaid.min.js"></script><script src="zurafa.js"></script>
<pre class="mermaid">flowchart LR
  z0["z(0)"] --> Solver["ODE solver"] --> zT["z(T)"]</pre>
<button class="step" data-explain="Walk me through one Euler step of the solver">Euler step</button>
HTML
```

The script renders locally, opens the result in the Preview associated with `ZURAFA_SESSION` and `ZURAFA_PANE`, and prints the generated file path. To target another location, pass `--session TARGET --pane TARGET`. To render without opening, pass `--no-open`.

After changing a visual, run the script again; Zurafa does not watch open files. Preview only content appropriate to display in the workspace, excluding credentials and private data not requested by the user.

If the script reports that Preview automation is unsupported, explain that the running Zurafa build predates `layout.preview`; the visual was still generated when the error occurred, but opening it requires a newer Zurafa build.
