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

A working `ChunkCounterMiddleware` that:
- Wraps the response's streaming body iterator
- Counts each yielded chunk
- Logs the total at INFO level after the stream completes
- Has passing tests
