# Licenses and what was not copied

## affectUI

Decision Tree, Agent Handoff, Agent Ledger and Agent Tree are affectUI Pro
items, not the MIT open-source set.

- Pages: https://www.affectui.com/components/decision-tree and the handoff,
  ledger and tree pages linked from the task.
- Registry: `https://www.affectui.com/r/<name>.json`
- Checked on 2026-11-01. Each URL returned **401** with: "This item is part of
  affectUI Pro. Add your access key (Account → Downloads) to components.json as
  a Bearer header."
- The public registry at https://www.affectui.com/r/registry.json does not list
  these four items. They are also absent from https://github.com/flohoeller/affectui
  (MIT). The Pro terms (https://www.affectui.com/terms) forbid publishing Pro
  source in a public repository.

No access key was available in this environment, so the upstream files were not
installed and were not reconstructed from the site. The React components under
`src/components/` are original implementations of the published props, keyboard
and accessibility contract. They are not affectUI source. Upstream credits
Hugeicons Free (MIT) for some icons; this studio draws its own marks and does
not copy those paths.

Free affectUI items remain MIT. None of those files were required for this
screen, so none were vendored.

## Falsify ticket kernel

Ticket creation is reused from https://github.com/Topabaem05/Falsify (MIT,
Copyright (c) 2026 Topabaem05). The vendored domain files and the MIT text are
in `src/falsify/`. `src/falsify/create.ts` follows `buildTickets` in
`packages/application/src/commands/create-tickets.ts`.

Not brought over, because they belong to Falsify's research-contract workspace:
IndexedDB adapters, the WebMCP tool envelope, approval policy, idempotency, and
experiment-node lookups. Explicit parent ids are stored and not resolved
against that graph. This monitor files improvement-branch tickets with
`parent_policy: "incumbent"` (current main).
