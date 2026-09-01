---
name: Orval and Zod compatibility
description: Generated Zod schemas use Zod 4 APIs in this workspace.
---

Orval's current Zod generator emits top-level Zod 4 helpers such as `zod.int()`, `zod.uuid()`, and `zod.email()`.

**Why:** The workspace previously pinned Zod 3, which let codegen finish but made the required library typecheck fail.

**How to apply:** Keep the workspace Zod catalog on a compatible Zod 4 release before regenerating API schemas.