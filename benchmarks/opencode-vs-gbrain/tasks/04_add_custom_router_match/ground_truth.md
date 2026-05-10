# Ground Truth: add_custom_router_match

## Correct Implementation

### 1. Extend Route.__init__ in `starlette/routing.py`

Add optional `headers` parameter:
```python
class Route(BaseRoute):
    def __init__(self, path, endpoint, *, methods=None, name=None,
                 include_in_schema=True, headers=None, ...):
        self.headers = headers  # dict or None
```

### 2. Extend Route.matches()

After path matching succeeds, check headers:
```python
def matches(self, scope):
    if not self.path_matches(scope):
        return Match.NONE
    if self.headers:
        for key, value in self.headers.items():
            header_key = key.lower().encode()
            request_headers = dict(scope.get("headers", []))
            request_value = request_headers.get(header_key, b"").decode()
            if request_value != value:
                return Match.NONE
    return Match.FULL
```

### Key Points
- Headers in ASGI scope are lowercase bytes; compare accordingly
- Header mismatches should return Match.NONE, allowing fallback to next route
- Route ordering matters: more specific routes (with headers) should be listed first
