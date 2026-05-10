# Task: Document the Starlette Request Lifecycle

Trace and document the complete lifecycle of an HTTP request in Starlette.

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
- **Key Classes**: Table of class -> role
- **Extension Points**: Where middleware, exception handlers, and lifespan hooks plug in
