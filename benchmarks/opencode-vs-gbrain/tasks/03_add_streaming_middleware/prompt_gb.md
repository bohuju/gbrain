# Task: Add Streaming Response Chunk Counter Middleware

Starlette needs a new middleware that counts chunks in streaming responses.

## Your Task

1. Create a new middleware class `ChunkCounterMiddleware` in the appropriate location
2. The middleware should count the number of chunks in `StreamingResponse` bodies
3. Log the chunk count using Python's `logging` module at INFO level after the response completes
4. Write tests covering: zero chunks, single chunk, and large number of chunks (>10)

## Constraints

- Follow existing middleware patterns in `starlette/middleware/`
- The middleware should not buffer the entire response — count on the fly
- All existing tests must continue to pass
- The new middleware must work with both sync and async streaming iterators

## Expected Outcome

A working `ChunkCounterMiddleware` that wraps the response's streaming body iterator, counts chunks, and logs the total.

## Using GBrain Knowledge Graph

You have access to a GBrain knowledge graph of this codebase. Use these MCP tools:

- **search** `BaseHTTPMiddleware` — find the base middleware class and how it's used
- **search** `StreamingResponse` — find streaming response implementation and body_iterator pattern
- **traverse_graph** `code/middleware/base` --depth 2 — see how existing middleware inherits and connects
- **get_page** `code/middleware/base` — read the BaseHTTPMiddleware source for dispatch pattern
- **get_backlinks** `code/responses` — find all files importing StreamingResponse

Study existing middleware implementations first, then follow the same pattern.
