# Task: Write Tests for Middleware Stack Behavior

Starlette's middleware tests are missing coverage for several important scenarios.

## Your Task

Add tests to `tests/test_middleware.py` covering these three scenarios:

### 1. Precise Execution Order
Test that when multiple middleware are added, they execute in the correct onion order.

### 2. Exception in Middleware
Test that when a middleware raises an exception, subsequent middleware are skipped.

### 3. Async/Sync Middleware Mixing
Test that async and sync middleware can coexist in the same stack.

## Constraints

- Follow existing test patterns in `tests/test_middleware.py`
- Use `starlette.testclient.TestClient` for HTTP-level assertions
- Tests must pass with `pytest tests/test_middleware.py`

## Using GBrain Knowledge Graph

You have access to a GBrain knowledge graph of this codebase. Use these MCP tools:

- **get_page** `tests/middleware/test_middleware` — read existing test patterns
- **search** `BaseHTTPMiddleware` — find how middleware dispatch is implemented
- **search** `TestClient` — find test client usage patterns
- **traverse_graph** `code/applications` --depth 2 — understand middleware stack assembly for test design

Study existing middleware tests first to match patterns, then understand the middleware execution model.
