# Ground Truth: fix_middleware_order

## Root Cause

In `starlette/applications.py` line 101, `add_middleware()` uses `insert(0, ...)` to add new middleware. Combined with `reversed()` iteration in `build_middleware_stack()` (line 75), this ensures the correct onion order: last-registered middleware is innermost (closest to the endpoint).

The bug changes `insert(0, ...)` to `append(...)`, which breaks the relative ordering when multiple middleware are registered. The first-registered middleware becomes innermost instead of the last-registered.

## Correct Fix

In `starlette/applications.py` line 101, change:

```python
self.user_middleware.append(Middleware(middleware_class, *args, **kwargs))
```

back to:

```python
self.user_middleware.insert(0, Middleware(middleware_class, *args, **kwargs))
```

## Key Files
- `starlette/applications.py:101`: `add_middleware()` method

## Verification
- Single middleware: header propagation works (bug is order-dependent, not detectable with one middleware)
- Multiple middleware: first-registered runs before last-registered (reversed from expected onion)
- After fix: all existing middleware tests must pass and multi-middleware order must be correct
