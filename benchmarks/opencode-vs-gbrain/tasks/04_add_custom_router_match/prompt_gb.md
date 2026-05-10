# Task: Add Header-Based Route Matching

Starlette currently only matches routes by URL path. You need to extend it to support header-based matching, specifically matching on the `Accept-Version` header.

## Your Task

1. Extend the routing system to support an optional `headers` parameter on Route
2. When a Route has a `headers` constraint, it should only match if all specified headers match the request
3. If no Route matches with header constraints, fall back to the first path-only matching route
4. Maintain full backward compatibility — existing routes without headers must work unchanged

## API Design

```python
Route("/api/data", endpoint_v2, methods=["GET"], headers={"Accept-Version": "v2"})
Route("/api/data", endpoint_v1, methods=["GET"])  # fallback
```

## Constraints

- Do not change the `Route` constructor signature in a breaking way
- All existing routing tests must pass
- Write at least one test demonstrating header-based routing

## Expected Outcome

Requests with `Accept-Version: v2` go to the header-constrained route; requests without it go to the default.

## Using GBrain Knowledge Graph

You have access to a GBrain knowledge graph of this codebase. Use these MCP tools:

- **search** `Route.__init__` — find the Route constructor parameters
- **search** `Match` — understand the route matching enum (NONE, PARTIAL, FULL)
- **traverse_graph** `code/routing` --depth 2 — see how Route connects to matching and scope
- **get_page** `code/routing` — read the full routing module with Route.matches() implementation
- **search** `scope["headers"]` — find how headers are accessed in ASGI scope

Understand the existing Route.matches() flow before adding the header matching extension.
