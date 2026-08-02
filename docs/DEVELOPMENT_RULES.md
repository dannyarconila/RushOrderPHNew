# Development Rules

Every new feature must:

- Be reusable.
- Be responsive.
- Be strongly typed.
- Be production ready.
- Include loading states.
- Include error handling.
- Preserve realtime.
- Preserve caching.

Every database change must:

- Preserve RLS.
- Reuse existing RPCs.
- Avoid duplicate tables.

Every React component must:

- Reuse existing UI.
- Avoid duplicated code.
- Use shared hooks when possible.

Never introduce breaking changes without identifying all affected modules.
