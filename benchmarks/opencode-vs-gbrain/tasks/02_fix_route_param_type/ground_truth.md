# Ground Truth: fix_route_param_type

## Root Cause

In `starlette/routing.py` line 246, the `Route.matches()` method skips calling `convert()` on path parameter values extracted from the URL regex match. The raw string from the regex match group is used directly instead of being converted through the parameter's Convertor.

The convertor method invoked is `Convertor.convert(value)` (not `to_python()` — the method name in Starlette's codebase is `convert()`).

## Correct Fix

In `starlette/routing.py` line 246, change:

```python
matched_params[key] = value  # BUG: convertor.convert() skipped
```

back to:

```python
matched_params[key] = self.param_convertors[key].convert(value)
```

## Key Files
- `starlette/routing.py:246`: `Route.matches()` parameter extraction
- `starlette/convertors.py`: Convertor definitions with `convert()` method

## Verification
- `{param:int}` must produce an int in path_params, not a string
- All other convertor types (float, uuid, path) must continue to work
- `tests/test_convertors.py` must pass (8 tests)
