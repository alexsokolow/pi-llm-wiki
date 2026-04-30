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
