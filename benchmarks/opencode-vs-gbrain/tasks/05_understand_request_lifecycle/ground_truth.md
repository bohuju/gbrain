# Ground Truth: understand_request_lifecycle

## Key Nodes (must cover >=80% of these for pass)

1. **ASGI server** (uvicorn) receives TCP connection, parses HTTP, builds ASGI scope
2. **Starlette.__call__** (applications.py) -- ASGI entry point, wraps everything
3. **ServerErrorMiddleware** -- outermost, catches unhandled exceptions, returns 500
4. **User middleware stack** -- in registration order (first=outermost)
5. **ExceptionMiddleware** -- catches HTTPException, returns error responses
6. **Router.__call__** (routing.py) -- matches URL to Route
7. **Route.matches()** -- regex match, extract path_params
8. **Route.__call__** -- build Request, call endpoint, await Response
9. **Request** (requests.py) -- wraps ASGI scope, lazy body read
10. **Endpoint function** -- user's view function
11. **Response.render()** -- serialize body, set headers
12. **Middleware after_request** -- in reverse order (last=outermost), wrap response
13. **Response.__call__** -- ASGI send protocol (headers, body chunks)
14. **StreamingResponse.body_iterator** -- for streaming, yields chunks

## Expected Coverage Categories

- Request ingestion (ASGI -> Starlette)
- Middleware onion (outer -> inner -> outer)
- Route matching lifecycle
- Request object construction
- Response rendering pipeline
- Exception handling path
- Streaming vs non-streaming divergence
