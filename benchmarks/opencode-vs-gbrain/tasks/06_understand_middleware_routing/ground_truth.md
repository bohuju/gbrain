# Ground Truth: understand_middleware_routing_interaction

## Correct Analysis

### 404 Flow

1. Router.matches() returns Match.NONE or Match.PARTIAL for all routes
2. In newer Starlette, Router.__call__ returns 404 response directly (not an exception)
3. This means custom middleware's `await call_next(request)` returns a 404 response (NOT a raised exception)
4. Custom middleware's after_request code DOES execute on 404
5. ExceptionMiddleware is NOT triggered because no exception is raised

### Why This Matters

If a custom middleware wraps `call_next()` in try/except to catch HTTPException, it will NOT catch 404 -- because 404 is returned as a normal Response, not raised as an exception.

### Making Middleware See 404s

Since 404 is a normal response with status_code=404, middleware can check:
```python
response = await call_next(request)
if response.status_code == 404:
    logger.info(f"404: {request.url.path}")
return response
```

## Key Files
- `starlette/routing.py`: Router.__call__, how 404 is handled
- `starlette/middleware/errors.py`: ExceptionMiddleware, what it catches
- `starlette/exceptions.py`: HTTPException definition
