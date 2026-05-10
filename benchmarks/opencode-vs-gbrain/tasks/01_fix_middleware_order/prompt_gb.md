# Task: Fix Middleware Execution Order

In this Starlette application, a custom middleware that adds security headers (`X-Frame-Options: DENY`) has been registered, but the header is missing from HTTP responses.

## Your Task

1. Investigate why `X-Frame-Options` is not appearing in responses
2. Fix the middleware execution order so custom middleware headers are properly included
3. Verify the fix by ensuring the existing test suite passes

## Constraints

- Do not modify the middleware itself — the bug is in how Starlette builds the middleware stack
- All existing tests in `tests/test_middleware.py` must pass
- The fix should be minimal — a few lines at most

## Expected Outcome

After the fix, any middleware added via `app.add_middleware()` should have its response headers propagated correctly in the final HTTP response.

## Using GBrain Knowledge Graph

You have access to a GBrain knowledge graph of this codebase. Use these MCP tools to accelerate your investigation:

- **search** `<keyword>` — search code files by function name, class, or pattern (e.g. `search add_middleware`, `search build_middleware_stack`)
- **traverse_graph** `code/applications` --depth 2 — trace how `Starlette` class connects to middleware and routing
- **get_page** `code/applications` — read `starlette/applications.py` with symbol metadata
- **get_backlinks** `code/applications` — find files that import or reference applications.py

Start by searching for "middleware" and "build_middleware_stack", then trace the call chain to understand the execution order.
