# Task: Refactor Route Matching Logic

The `BaseRoute.matches()` and related methods in `starlette/routing.py` have grown complex. You need to refactor the matching logic into clearer, separate responsibilities without changing behavior.

## Your Task

1. Study the current route matching code in `starlette/routing.py`
2. Extract three clear responsibilities into separate methods:
   - `_match_path(scope)` — URL pattern matching, returns params or None
   - `_extract_params(match)` — convert matched groups to typed path_params via convertors
   - `_build_match(scope, path_params)` — assemble the final Match result
3. Add docstrings to each new method
4. Ensure all existing tests in `tests/test_routing.py` pass

## Constraints

- No public API changes — existing code that uses `Route` and `Router` must work unchanged
- All existing routing tests must pass
- The refactoring must be a pure structural change with zero behavioral differences
