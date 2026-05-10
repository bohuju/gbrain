# Ground Truth: refactor_route_match

## Expected Refactoring

The `matches()` method in `Route` currently does URL matching AND param extraction AND type conversion in one method. A clean refactoring separates:

1. `_match_path(scope)` — pure regex match against scope["path"], returns regex match object or None
2. `_extract_params(match)` — iterates path_params, applies convertor.to_python() to each, returns dict
3. `matches(scope)` — orchestrates: calls _match_path → _extract_params → returns Match.FULL/NONE

## Quality Indicators

- Each new method has a clear docstring
- Method names are descriptive and consistent with existing Starlette naming
- No logic duplication between old and new code paths
- The refactoring is a structural change, not a rewrite

## Key File
- `starlette/routing.py`: BaseRoute and Route classes
