# Blorge

A block-coding studio for 2D and 3D games, animations and stories, with live team projects.
Single-file app (`blorge.html`) built for Claude artifacts: it uses the `db`, `room`, `user`, `sample` and `downloads` capabilities.

- 2D + 3D editors (Blockly blocks, paint editor, three.js scene editor)
- 12 starter projects, 15 auto-checked lessons, Pen and Effects blocks
- Dark mode, command palette (Ctrl/Cmd+K), screenshots, standalone HTML export
- Team projects: many people edit one project live (per-script sync over the shared db, presence over `room`)

Required db rule for teams: `{ path: "teams", read: "view", write: "interact" }`.
`tests/` holds the Playwright checks (a fake two-user backend plus scenarios).
