# Task: Document the Starlette Request Lifecycle

Trace and document the complete lifecycle of an HTTP request in Starlette.

## Pre-loaded Codebase Knowledge

The codebase has been pre-indexed. Here is what you need to know about the request lifecycle architecture:

### Key Files

1. **starlette/applications.py** — Starlette class is the ASGI entry point:
   - `__call__(scope, receive, send)` — ASGI entry, lazily builds middleware_stack on first call
   - `build_middleware_stack()` — assembles `[ServerErrorMiddleware] + user_middleware + [ExceptionMiddleware]`, then iterates with `reversed()` to build the onion: ServerErrorMiddleware(outermost) → user middleware → ExceptionMiddleware(innermost) → Router
   - `add_middleware()` — uses `insert(0, ...)` (prepend) so last-registered middleware is innermost

2. **starlette/routing.py** — Route matching and dispatching:
   - `Match` enum: NONE=0, PARTIAL=1, FULL=2
   - `BaseRoute.matches(scope) → (Match, Scope)` — abstract, returns match result + child scope
   - `Route.matches()` — regex match on scope["path"], apply convertors, return match result with path_params
   - `Route.__call__()` — if match=NONE return 404; otherwise build Request, call endpoint, await Response
   - `Router.__call__()` — iterate routes, call matches(), dispatch to first FULL match or return 404
   - `Route.handle()` — check HTTP method, raise 405 if wrong method, else call endpoint app

3. **starlette/middleware/errors.py** — `ServerErrorMiddleware`: catches ALL unhandled exceptions, returns 500 with traceback in debug mode. Outermost middleware.

4. **starlette/middleware/exceptions.py** — `ExceptionMiddleware`: catches `HTTPException` (4xx/5xx) and `WebSocketException`. Innermost middleware (closest to Router).

5. **starlette/middleware/base.py** — `BaseHTTPMiddleware`: base class for user middleware. `dispatch(request, call_next)` pattern — await call_next(request) to go inward, modify response after.

6. **starlette/requests.py** — `Request`: wraps ASGI scope. Lazy body read via `body()`, `form()`, `json()`.

7. **starlette/responses.py** — `Response`, `StreamingResponse`, `FileResponse`, `JSONResponse`, `HTMLResponse`, `PlainTextResponse`, `RedirectResponse`.

8. **starlette/types.py** — `ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]`

### Middleware Onion Order

```
Request comes in →
  ServerErrorMiddleware (outermost, catches all exceptions)
    → user_mw_N (last registered)
      → ...
        → user_mw_0 (first registered)
          → ExceptionMiddleware (catches HTTPException)
            → Router
              → Route.matches() → Route.handle() → endpoint(request)
            ← Response
          ← ExceptionMiddleware (wraps error responses)
        ← user_mw_0 (after_request — first registered runs first on way out)
      ← ...
    ← user_mw_N (last registered runs last on way out)
  ← ServerErrorMiddleware (returns 500 on unhandled errors)
← Response sent to client
```

### Error Handling Paths

- **404**: Router returns PlainTextResponse("Not Found", 404) directly — NOT an exception. Custom middleware after_request DOES see 404 responses.
- **405**: Route.handle() raises HTTPException(405) → ExceptionMiddleware catches it → returns error response
- **500**: Any unhandled exception → propagates through entire stack → ServerErrorMiddleware catches → returns 500
- **HTTPException**: Caught by ExceptionMiddleware before reaching ServerErrorMiddleware

## Your Task

Trace a `GET /api/users` request from the moment it arrives at the ASGI server to the moment the HTTP response is sent back. Specifically:

1. List every module, class, and method involved, in order
2. Draw the call sequence (text-based diagram is fine)
3. Note where middleware hooks execute (before_request, after_request)
4. Note where exception handling intercepts errors
5. Check if this flow is documented in `docs/`. If not, add a new `docs/request-lifecycle.md`

## Expected Output Format

A markdown document (added to `docs/request-lifecycle.md` if missing) containing:
- **Sequence Diagram**: Text-based call flow
- **Key Classes**: Table of class → role
- **Extension Points**: Where middleware, exception handlers, and lifespan hooks plug in
