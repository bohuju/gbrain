# Task: Analyze Middleware Behavior on 404 Routes

## Your Task

Analyze how Starlette's middleware stack behaves when a route is not found (404):

1. Does `after_request` in custom middleware still execute when routing returns 404?
2. What is the execution order of `ExceptionMiddleware` vs custom middleware in this case?
3. How would you modify a custom middleware so it can observe and log 404 responses?

## Expected Output

A markdown analysis document covering:
- The call flow when routing fails (HTTP 404)
- Which middleware run and which are skipped
- Whether ExceptionMiddleware handles the 404 or the Router handles it directly
- A concrete code example showing how to make a custom middleware see 404s

## Using GBrain Knowledge Graph

You have access to a GBrain knowledge graph of this codebase. Use these MCP tools:

- **traverse_graph** `code/routing` --depth 2 — trace Router.__call__ → Route.matches() → 404 response
- **traverse_graph** `code/applications` --depth 3 — trace the full middleware stack wrapping
- **get_page** `code/exceptions` — read ExceptionMiddleware to see what it catches
- **search** `Match.NONE` — find how routing failures are handled
- **search** `404` — find where 404 responses are generated

Start by tracing the Router's handling of unmatched routes, then see how ExceptionMiddleware wraps the stack.
