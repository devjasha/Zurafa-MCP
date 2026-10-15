# Zurafa CLI Preview integration

Research against Zurafa's official documentation and current source on 2026-10-15.

## Findings

- `zurafa preview PATH` canonicalizes an existing local file and asks the running daemon to display it. It does not accept inline data, stdin, or HTTP URLs and does not launch Zurafa. [CLI docs](https://zurafa-website.vercel.app/docs/cli/) · [implementation](https://github.com/devjasha/Zurafa/blob/main/rust/crates/zurafa-cli/src/main.rs#L255-L279)
- Inside Zurafa, `ZURAFA_SOCKET`, `ZURAFA_SESSION`, and `ZURAFA_PANE` select the current daemon and pane. `ZURAFA_BLOCK` is a compatibility alias. Outside Zurafa, Preview uses the `default` session and the selected pane of its active tab. Explicit `--session` and `--pane`/`--block` flags override them. Targets match full ID, case-insensitive label where applicable, one-based position, or an ID suffix of at least four characters. [CLI targeting docs](https://zurafa-website.vercel.app/docs/cli/#command-targets) · [implementation](https://github.com/devjasha/Zurafa/blob/main/rust/crates/zurafa-cli/src/main.rs#L259-L277)
- The underlying protocol-2 request is `{"type":"layout.preview","session":"default","block":"t1","path":"/absolute/path"}`. The daemon socket defaults to `$HOME/Library/Application Support/Zurafa/daemon.sock`; the directory is mode `0700`, socket mode `0600`, and frames are length-prefixed JSON capped at 16 MiB. [IPC reference](https://zurafa-website.vercel.app/docs/ipc-reference/)
- Preview accepts anything `NSImage(contentsOf:)` can read, then Markdown, Org, and text/code. The current MarkdownUI integration does not provide documented LaTeX or Mermaid rendering. [Preview docs](https://zurafa-website.vercel.app/docs/previews/) · [file loader](https://github.com/devjasha/Zurafa/blob/main/apps/macos/Sources/Zurafa/FilePreview.swift#L22-L41)
- Preview is one sidecar for the workspace, not a separate preview per terminal pane. Another Preview request replaces it. The pane ID provides event routing and current-directory context. [workspace state](https://github.com/devjasha/Zurafa/blob/main/apps/macos/Sources/Zurafa/Workspace.swift#L121-L140) · [layout](https://github.com/devjasha/Zurafa/blob/main/apps/macos/Sources/Zurafa/Views.swift#L317-L332)
- Zurafa loads the file when handling the event and does not watch it. Updating requires rewriting the artifact and sending another Preview request. A daemon `ok` means the request was published; it does not prove that the GUI loaded the file. [openPreview](https://github.com/devjasha/Zurafa/blob/main/apps/macos/Sources/Zurafa/Workspace.swift#L321-L326)

## Release mismatch

The installed Zurafa 0.1.7 was checked directly. Its bundled `zurafa help` has no `preview` command, and its daemon rejects `layout.preview`. The website and current `main` describe code newer than that release. A CLI fallback to direct IPC bridges builds where the daemon operation exists but the CLI command does not; it cannot add the capability to the 0.1.7 daemon.

## MVP decision

Render formulas and Mermaid locally to SVG, then call `zurafa preview` and fall back to protocol-2 IPC only when the CLI reports that `preview` is unknown. SVG is accepted by `NSImage` on the target macOS version and stays sharp in the resizable sidecar. Package one model-invoked Agent Skill so Claude Code and Pi share the same instructions and rendering script.

No watcher, hooks, MCP server, web service, or direct HTML preview is needed. Generated content remains local. Invoke the executable with an argument array rather than shell interpolation, and avoid placing secrets in visual artifacts.
