# Task: Analyze Middleware Behavior on 404 Routes

## Your Task

Analyze how Starlette's middleware stack behaves when a route is not found (404):

1. Does `after_request` in custom middleware still execute when routing returns 404?
2. What is the execution order of `ExceptionMiddleware` vs custom middleware in this case?
3. How would you modify a custom middleware so it can observe and log 404 responses?

## Expected Output

A markdown analysis document covering:

- The call flow when routing fails (HTTP 404)
- Which middleware run and which are skipped
- Whether ExceptionMiddleware handles the 404 or the Router handles it directly
- A concrete code example showing how to make a custom middleware see 404s
