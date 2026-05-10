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
- **Key Classes**: Table of class → role
- **Extension Points**: Where middleware, exception handlers, and lifespan hooks plug in

## Using GBrain Knowledge Graph

You have access to a GBrain knowledge graph of this codebase. Use these MCP tools to trace the full request path:

- **traverse_graph** `code/applications` --depth 3 --direction out — trace Starlette.__call__ → middleware → router
- **get_backlinks** `code/routing` — find all files that import or reference routing module
- **search** `ServerErrorMiddleware` — find the outermost error handler
- **search** `__call__` — find ASGI entry points across the codebase  
- **get_page** `code/exceptions` — read the exception handling layer
- **get_page** `docs/routing` — check if lifecycle docs already exist

Start with traverse_graph on `code/applications` to map the full call chain.
