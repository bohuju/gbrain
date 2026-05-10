# Ground Truth: add_streaming_middleware

## Correct Implementation

Create `starlette/middleware/chunk_counter.py`:

```python
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse

logger = logging.getLogger("starlette.middleware.chunk_counter")

class ChunkCounterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if isinstance(response, StreamingResponse):
            original_iterator = response.body_iterator
            count = 0

            async def counting_iterator():
                nonlocal count
                async for chunk in original_iterator:
                    count += 1
                    yield chunk
                logger.info(f"Streaming response chunk count: {count}")

            response.body_iterator = counting_iterator()
        return response
```

## Key Points
- Must use isinstance check on response, not on body_iterator
- Must re-assign body_iterator so the counting wrapper is used
- Log after stream completes (after the loop), not before
- Follow existing middleware conventions in the codebase
