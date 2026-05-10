# Ground Truth: write_test_middleware_stack

## Expected Tests

### Test 1: test_middleware_execution_order
- Add 3 middleware classes that record order in a list
- Assert the recorded order matches: [outer_before, middle_before, inner_before, handler, inner_after, middle_after, outer_after]
- Use TestClient to make a request

### Test 2: test_middleware_exception_skips_remaining
- Middleware A raises ValueError in dispatch
- Middleware B records that it was called (or not)
- Assert Middleware B was NOT called
- Assert response status is 500

### Test 3: test_async_and_sync_middleware_mixed
- One async middleware (async def dispatch)
- One sync middleware (def dispatch, wrapped correctly)
- Assert both execute in correct stack order
- Assert no asyncio warnings

## Key File
- `tests/test_middleware.py`: where new tests go
