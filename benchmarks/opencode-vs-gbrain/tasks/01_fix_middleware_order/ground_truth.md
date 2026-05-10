# Ground Truth: fix_middleware_order

## Root Cause

The bug is in `starlette/applications.py` where the middleware stack is built. The user's middleware is being added at the wrong position or the stack is being built in reverse order.

Specifically, in the `Starlette.__init__` method, `self.middleware_stack` is built from `self.user_middleware` but the order is incorrect -- either the list is iterated in reverse or the first middleware is treated as the outermost.

## Correct Fix

In `starlette/applications.py`, ensure that `user_middleware` is iterated in the order they were added (first added = outermost, last added = innermost, closest to the endpoint). The Starlette app itself should be the innermost ASGI app.

The fix should be:
1. Locate where `self.middleware_stack` is built (typically using `ServerErrorMiddleware` and `ExceptionMiddleware` wrapping)
2. Ensure user middleware are applied in FIFO order (first-registered is outermost)
3. The stack should be: `ServerErrorMiddleware -> user_mw[0] -> user_mw[1] -> ... -> ExceptionMiddleware -> app_router`

## Key Files
- `starlette/applications.py`: Starlette class init, middleware stack construction

## Verification
- Security header middleware must have its headers in the final response
- Multiple middleware must execute in correct onion order
- All existing tests must pass
