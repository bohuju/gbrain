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
