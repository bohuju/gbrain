# Ground Truth: fix_route_param_type

## Root Cause

In `starlette/routing.py`, when path parameters are extracted from a matched URL, the convertor's `to_python()` result may be discarded or the raw string from the regex match is used instead of the converted value.

## Correct Fix

In `starlette/routing.py`, locate the `Match` or parameter extraction logic in `BaseRoute` or `Route`. Ensure that after regex matching extracts parameter values as strings, each value is passed through the corresponding convertor's `to_python()` method before being stored in `path_params`.

The fix location is typically in the `matches()` method or wherever `path_params` is populated from regex match groups.

## Key Files
- `starlette/routing.py`: Route.matches(), parameter extraction
- `starlette/convertors.py`: Convertor definitions (int, float, uuid, path)

## Verification
- `{param:int}` must produce an int in path_params
- All other convertor types must continue to work
- Existing convertor tests must pass
