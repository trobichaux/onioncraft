# Guild Wars 2 Planner — Claude Code Instructions

## Project Overview

A planning tool for Guild Wars 2 players to manage builds, gear, crafting, and progression. This file defines how Claude should approach work in this repo, including which agents to spawn for which tasks and how to coordinate parallel workstreams.

---

## Model Selection by Task

When spawning agents, match the model to the task complexity:

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| Architecture planning, complex reasoning | `claude-opus-4-6` | Highest reasoning; worth the cost for decisions that shape the whole system |
| Feature implementation, refactoring | `claude-sonnet-4-6` | Best balance of speed, cost, and coding quality |
| Repetitive codegen, boilerplate, file renaming | `claude-haiku-4-5-20251001` | Fast and cheap for mechanical tasks |
| Research, API exploration, docs lookup | `claude-sonnet-4-6` | Good at synthesizing external information |
| Test writing | `claude-haiku-4-5-20251001` | Tests are formulaic; Haiku handles them well |
| Code review, security audit | `claude-opus-4-6` | Needs deep understanding to catch subtle issues |

Always pass `model` explicitly when invoking an agent so the override takes effect.

---

## Agent Roles & When to Spawn Them

### Planner Agent (Opus)
Use when: designing a new feature, deciding between architectural approaches, or scoping a large task.

```
Agent tool — subagent_type: "Plan", model: "opus"
Prompt: "Design the architecture for [feature]. Return a step-by-step implementation plan, identify the files to create or modify, and note trade-offs."
```

### Implementer Agent (Sonnet)
Use when: writing or modifying application code after a plan exists.

```
Agent tool — subagent_type: "general-purpose", model: "sonnet"
Prompt: "Implement [feature] according to this plan: [plan]. Write the code, create or edit the relevant files."
```

### Explorer Agent (Sonnet)
Use when: mapping an unfamiliar part of the codebase or researching the GW2 API.

```
Agent tool — subagent_type: "Explore", model: "sonnet"
Prompt: "Explore [area of codebase or API]. Answer: [specific question]. Thoroughness: medium."
```

### Test Writer Agent (Haiku)
Use when: generating unit or integration tests for an already-implemented module.

```
Agent tool — subagent_type: "general-purpose", model: "haiku"
Prompt: "Write tests for [module/function]. Cover happy path, edge cases, and error conditions. Do not change application code."
```

### Boilerplate Agent (Haiku)
Use when: scaffolding new files, generating typed interfaces from a schema, or other mechanical codegen.

```
Agent tool — subagent_type: "general-purpose", model: "haiku"
Prompt: "Generate [boilerplate] following the existing patterns in [reference file]. Output the complete file."
```

### Reviewer Agent (Opus)
Use when: doing a pre-PR code review, auditing security, or validating correctness of a complex algorithm.

```
Agent tool — subagent_type: "general-purpose", model: "opus"
Prompt: "Review the following changes for correctness, security, and code quality. Be specific about any issues found: [diff or file list]."
```

---

## Parallel Agent Execution

When multiple independent workstreams exist, spawn agents in a single message (one `<function_calls>` block with multiple Agent tool calls). The orchestrator pattern below coordinates them.

### Orchestrator Pattern

The orchestrator is Opus (in the main conversation or a dedicated agent) and works like this:

1. **Decompose** — Break the feature into independent subtasks.
2. **Dispatch** — Launch all independent agents in parallel in one message.
3. **Integrate** — Collect results and resolve conflicts before writing final code.
4. **Validate** — Spawn a Reviewer agent on the integrated output.

#### Example: Adding a new "Build Optimizer" feature

```
Step 1 — Orchestrator (Opus) plans:
  - Subtask A: Explore existing build data model (Explore agent, Sonnet)
  - Subtask B: Research GW2 API skill/trait endpoints (Explorer agent, Sonnet)
  - Subtask C: Scaffold TypeScript interfaces for the optimizer (Boilerplate agent, Haiku)

Step 2 — Dispatch all three in a single parallel message.

Step 3 — Orchestrator reads all three results, resolves naming conflicts,
          then dispatches:
  - Subtask D: Implement optimizer logic (Implementer agent, Sonnet)
  - Subtask E: Write optimizer tests (Test Writer agent, Haiku)
  — These can run in parallel because D writes app code and E writes test files
    in separate directories.

Step 4 — Reviewer agent (Opus) audits the combined output.
```

### Rules for Parallel Dispatch

- Agents writing to the **same file** must run sequentially, not in parallel.
- Agents writing to **different files** can run in parallel safely.
- Use `isolation: "worktree"` on the Agent tool when an agent will make many speculative edits that may be discarded.
- Background (`run_in_background: true`) is appropriate for slow research agents when you have other work to do in the foreground.

---

## GW2-Specific Context for Agents

Always include this context when prompting agents that touch GW2 data or API:

- GW2 API base: `https://api.guildwars2.com/v2`
- Key endpoints: `/items`, `/skills`, `/traits`, `/specializations`, `/builds`, `/characters`
- The API is public for most read endpoints; some require an API key passed as `?access_token=`
- Build templates use the `code` field (base64-encoded chatlink format)
- Attribute names: Power, Precision, Toughness, Vitality, Concentration, Condition Damage, Expertise, Ferocity, Healing Power, Armor, Boon Duration, Critical Chance, Critical Damage, Condition Duration

---

## Installed Plugins & Skills

The following plugins are installed and active. Invoke them with the `Skill` tool using the name shown.

### Superpowers Suite
High-signal workflow skills — prefer these over ad-hoc approaches for the tasks they cover.

| Skill | When to invoke |
|-------|---------------|
| `superpowers:using-superpowers` | Start of any new conversation — establishes skill discovery |
| `superpowers:brainstorming` | Before any creative work: new features, components, behavior changes |
| `superpowers:writing-plans` | When given a spec or requirements for a multi-step task, before touching code |
| `superpowers:executing-plans` | When executing a written implementation plan in a separate session |
| `superpowers:subagent-driven-development` | Executing implementation plans with independent tasks in the current session |
| `superpowers:dispatching-parallel-agents` | When 2+ independent tasks can run without shared state or sequential deps |
| `superpowers:test-driven-development` | Before writing implementation code for any feature or bugfix |
| `superpowers:systematic-debugging` | Before proposing fixes for any bug, test failure, or unexpected behavior |
| `superpowers:receiving-code-review` | Before implementing code review suggestions — verify before agreeing |
| `superpowers:requesting-code-review` | After completing tasks or major features, before merging |
| `superpowers:verification-before-completion` | Before claiming work is complete — run verification commands, evidence first |
| `superpowers:finishing-a-development-branch` | When implementation is done, tests pass, and you need to decide how to integrate |
| `superpowers:using-git-worktrees` | Before feature work that needs isolation from the current workspace |
| `superpowers:writing-skills` | When creating or improving skills |

### Code Review
| Skill | When to invoke |
|-------|---------------|
| `code-review:code-review` | Review a pull request — use instead of manual diff reading |

### Feature Development
| Skill | When to invoke |
|-------|---------------|
| `feature-dev:feature-dev` | Guided feature development with deep codebase understanding and architecture focus |

### Frontend Design
| Skill | When to invoke |
|-------|---------------|
| `frontend-design:frontend-design` | Build web components, pages, or UI — produces polished, production-grade output |

### CLAUDE.md Management
| Skill | When to invoke |
|-------|---------------|
| `claude-md-management:revise-claude-md` | After a session — capture learnings and update this file |
| `claude-md-management:claude-md-improver` | Audit and improve CLAUDE.md quality across the repo |

### Skill Creator
| Skill | When to invoke |
|-------|---------------|
| `skill-creator:skill-creator` | Create new skills, modify existing ones, or benchmark skill performance |

### Ralph Loop
| Skill | When to invoke |
|-------|---------------|
| `ralph-loop:ralph-loop` | Start an autonomous looping session |
| `ralph-loop:cancel-ralph` | Cancel an active Ralph Loop |
| `ralph-loop:help` | Explain Ralph Loop and available commands |

### Built-in Skills (non-plugin)
| Skill | When to invoke |
|-------|---------------|
| `claude-api` | When building with the Anthropic SDK or Claude API |
| `simplify` | After a logical chunk of code is written — review and refine |
| `loop` | Set up a recurring task or polling interval |
| `update-config` | Modify `settings.json`, hooks, permissions, or env vars |

---

## General Conventions

- Always read files before editing them.
- Prefer editing existing files over creating new ones.
- Keep solutions minimal — no speculative abstractions or features beyond what is asked.
- Do not commit unless explicitly asked.
- When uncertain about scope, ask before spawning a large parallel workload.
