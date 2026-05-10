# Task: Add Header-Based Route Matching

Starlette currently only matches routes by URL path. You need to extend it to support header-based matching, specifically matching on the `Accept-Version` header.

## Your Task

1. Extend the routing system to support an optional `headers` parameter on Route
2. When a Route has a `headers` constraint, it should only match if all specified headers match the request
3. If no Route matches with header constraints, fall back to the first path-only matching route
4. Maintain full backward compatibility — existing routes without headers must work unchanged

## API Design

```python
from starlette.routing import Route

# New: header-constrained route
Route("/api/data", endpoint_v2, methods=["GET"], headers={"Accept-Version": "v2"})

# Existing: no headers, matches any request to /api/data
Route("/api/data", endpoint_v1, methods=["GET"])
```

## Constraints

- Do not change the `Route` constructor signature in a breaking way
- All existing routing tests must pass
- Write at least one test demonstrating header-based routing

## Expected Outcome

Requests with `Accept-Version: v2` header go to the header-constrained route, while requests without that header go to the default route.
