# Task: Fix Route Parameter Type Conversion

A Starlette route defined with `{item_id:int}` is passing the parameter as a string to the view function instead of an integer.

## Your Task

1. Investigate the route parameter type conversion pipeline
2. Find where the int convertor is not being applied
3. Fix the bug so `{param:int}` correctly passes an integer to the view function
4. Verify the fix with the existing convertor tests

## Constraints

- Do not change the route definition syntax
- All existing tests in `tests/test_routing.py` must pass, especially convertor-related tests
- The fix should preserve all existing convertor types (int, float, uuid, path)

## Expected Outcome

After the fix, `{item_id:int}` in a route path should result in `item_id` being an `int` in the view function's keyword arguments.

## Using GBrain Knowledge Graph

You have access to a GBrain knowledge graph of this codebase. Use these MCP tools:

- **search** `<keyword>` — search code by symbol name (e.g. `search convert`, `search param_convertors`, `search path_params`)
- **traverse_graph** `code/routing` --depth 2 — see how Route.matches() connects to convertors
- **get_page** `code/routing` — read `starlette/routing.py` with symbol-level metadata
- **get_page** `code/convertors` — read `starlette/convertors.py` to understand type conversion

Start by searching for "convert" and "param_convertors" to locate the type conversion code.
