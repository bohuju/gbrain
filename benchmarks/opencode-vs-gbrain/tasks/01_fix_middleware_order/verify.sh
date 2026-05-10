#!/bin/bash
set -euo pipefail

PARTIAL=0

# Test 1: Basic middleware header propagation
echo "=== Test 1: Middleware header propagation ==="
cat > /tmp/test_mw_app.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

class SecurityHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        return response

app = Starlette()
app.add_middleware(SecurityHeaderMiddleware)

@app.route("/")
def home(request):
    return PlainTextResponse("ok")

client = TestClient(app)
resp = client.get("/")
assert resp.headers.get("x-frame-options") == "DENY", f"Expected x-frame-options=DENY, got {resp.headers.get('x-frame-options')}"
print("PASS: Security header present")
PYEOF
python /tmp/test_mw_app.py || { echo "FAIL: Header test"; PARTIAL=2; }

# Test 2: Multiple middleware order
echo "=== Test 2: Multiple middleware order ==="
cat > /tmp/test_mw_order.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

order = []

class FirstMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        order.append("first_in")
        resp = await call_next(request)
        order.append("first_out")
        return resp

class SecondMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        order.append("second_in")
        resp = await call_next(request)
        order.append("second_out")
        return resp

app = Starlette()
app.add_middleware(FirstMiddleware)
app.add_middleware(SecondMiddleware)

@app.route("/")
def home(request):
    order.append("handler")
    return PlainTextResponse("ok")

client = TestClient(app)
client.get("/")
expected = ["second_in", "first_in", "handler", "first_out", "second_out"]
assert order == expected, f"Expected {expected}, got {order}"
print("PASS: Middleware order correct")
PYEOF
python /tmp/test_mw_order.py || { echo "FAIL: Order test"; PARTIAL=2; }

# Test 3: Existing test suite
echo "=== Test 3: Existing middleware tests ==="
cd /tmp/starlette-bench
python -m pytest tests/test_middleware.py -x -q || { echo "FAIL: Existing tests"; PARTIAL=2; }

exit $PARTIAL
