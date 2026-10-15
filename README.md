# Zurafa Preview

A portable Agent Skill for rendering formulas and Mermaid diagrams into Zurafa's Preview sidecar. It works as a Claude Code plugin and a Pi package.

## Requirements

- Apple Silicon macOS 14+
- Node.js 22.13+
- A running Zurafa build whose daemon supports `layout.preview`

> Zurafa 0.1.7's bundled CLI and daemon do not yet include Preview automation, although the command is documented and implemented on Zurafa's current `main` branch.

## Set up

```bash
npm install
```

Try it without opening Zurafa:

```bash
node scripts/show.mjs math --text '\\int_0^1 x^2 \\, dx = \\frac{1}{3}' --no-open
printf 'flowchart LR\n  Idea --> Diagram --> Understanding\n' \
  | node scripts/show.mjs mermaid --no-open
```

The command prints the generated file path: SVG for math, 3× PNG for Mermaid, and HTML (with `zurafa.js` and `mermaid.min.js` copied beside it) for `html` pages. In Zurafa, HTML pages run offline in a web view; elements with `data-explain` paste a follow-up question into the agent's prompt when clicked. Zurafa loads both through macOS `NSImage`, whose SVG renderer drops the HTML labels Mermaid emits, so diagrams are rasterized by Mermaid's own Chromium instead.

## Load in an agent

Claude Code persistent local install:

```bash
claude plugin install zurafa-preview --marketplace "$PWD"
```

For one development session, use `claude --plugin-dir "$PWD"` instead.

Pi personal install:

```bash
pi install "$PWD"
```

Add `--local` to the Pi command to enable it only for the current project.

The `zurafa-preview` skill is model-invoked when a formula or diagram would materially improve an explanation. In Pi, invoke it explicitly with `/skill:zurafa-preview`; Claude Code also exposes installed plugin skills through its skill menu.

## CLI

```text
node scripts/show.mjs <math|mermaid> [options]
```

Source comes from `--input FILE`, `--text TEXT`, or stdin. Useful options:

- `--output FILE` — choose the output path (`.svg` for math, `.png` for Mermaid)
- `--session TARGET --pane TARGET` — override Zurafa's current target
- `--no-open` — render only

By default, output is content-addressed under the system temporary directory. The script first tries `zurafa preview`. If the installed CLI lacks that command, it falls back to Zurafa's documented protocol-2 Unix socket and sends `layout.preview` directly.

Re-run the command after every update: Zurafa loads the file into memory and does not watch it.

## Scope

The MVP intentionally has no watcher, browser preview, direct HTML support, hooks, or custom Pi extension. Rendering is local; no formula or diagram content is sent to a web service.
