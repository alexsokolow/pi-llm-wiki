# Agent Configuration for Pi

When working on this codebase, the agent MUST use the superpowers skills workflow for any multi-step task:

1. **Brainstorming** (`/skill:brainstorming`) — Explore requirements and approaches before implementation.
2. **Writing Plans** (`/skill:writing-plans`) — Draft implementation plans with bite-sized tasks before touching code.
3. **Test-Driven Development** (`/skill:test-driven-development`) — Write tests before implementation for any feature.
4. **Executing Plans** (`/skill:executing-plans`) or **Subagent-Driven Development** (`/skill:subagent-driven-development`) — Execute plans systematically.
5. **Verification Before Completion** (`/skill:verification-before-completion`) — Run verification commands and confirm output before claiming done.
6. **Code Review** (`/skill:requesting-code-review`, `/skill:receiving-code-review`) — Review all non-trivial changes.
7. **Finishing Development** (`/skill:finishing-a-development-branch`) — Properly close branches/PRs.

Always prefer structured skill-driven workflow over ad-hoc manual coding.
Prefer TDD for any new feature or bugfix.
Prefer subagent execution for plans with independent tasks.

**Using skills:** Read the skill file (via `read`) before invoking its workflow. Skill files contain detailed instructions and constraints.

## Memory (Honcho)

- `honcho_search` — Use for factual recall of past conversations or decisions.
- `honcho_chat` — Use for reasoning over memory (patterns, preferences, deeper questions).
- `honcho_remember` — Use only for durable preferences, conventions, or decisions worth persisting. Do not save secrets, tokens, or transient debugging details.

## Research

- `web_search` — Use for web research. Prefer `{queries: [...]}` with 2–4 varied angles over a single query for broader coverage.
- `code_search` — Use for programming/API/library questions to retrieve concrete examples and docs before implementing or debugging code.
- `fetch_content` — Use to extract content from URLs, YouTube, GitHub repos, or local videos. For video questions, pass the user's exact question in `prompt`.
