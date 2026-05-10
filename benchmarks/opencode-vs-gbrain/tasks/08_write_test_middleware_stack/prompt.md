# Task: Write Tests for Middleware Stack Behavior

Starlette's middleware tests are missing coverage for several important scenarios.

## Your Task

Add tests to `tests/test_middleware.py` covering these three scenarios:

### 1. Precise Execution Order
Test that when multiple middleware are added, they execute in the correct onion order:
- Outer middleware `before_request` fires first
- Inner middleware `before_request` fires second
- Endpoint handler runs
- Inner middleware `after_request` fires first
- Outer middleware `after_request` fires last

### 2. Exception in Middleware
Test that when a middleware raises an exception, subsequent middleware are skipped and the exception propagates properly:
- Middleware A raises ValueError
- Middleware B is never called
- The exception is caught by ServerErrorMiddleware → 500 response

### 3. Async/Sync Middleware Mixing
Test that async and sync middleware can coexist in the same stack:
- Mix of async dispatch() and sync dispatch() middleware
- All middleware execute in correct order
- No coroutine warnings or runtime errors

## Constraints

- Follow existing test patterns in `tests/test_middleware.py`
- Use `starlette.testclient.TestClient` for HTTP-level assertions
- Tests must pass with `pytest tests/test_middleware.py`
