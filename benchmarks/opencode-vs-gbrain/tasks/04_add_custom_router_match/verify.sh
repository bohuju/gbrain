#!/bin/bash
set -euo pipefail

echo "=== Test 1: Header-based routing ==="
cat > /tmp/test_header_route.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

async def v1(request):
    return PlainTextResponse("v1")

async def v2(request):
    return PlainTextResponse("v2")

app = Starlette(routes=[
    Route("/api/data", v2, methods=["GET"], headers={"Accept-Version": "v2"}),
    Route("/api/data", v1, methods=["GET"]),
])

client = TestClient(app)

# Header match
resp = client.get("/api/data", headers={"Accept-Version": "v2"})
assert resp.text == "v2", f"Expected v2, got {resp.text}"

# No header -> fallback
resp = client.get("/api/data")
assert resp.text == "v1", f"Expected v1, got {resp.text}"

print("PASS: Header routing works")
PYEOF
python3 /tmp/test_header_route.py || { echo "FAIL"; exit 1; }

echo "=== Test 2: Backward compatibility ==="
cd /tmp/starlette-bench
python3 -m pytest tests/test_routing.py -x -q || { echo "FAIL: Existing routing tests"; exit 1; }

exit 0
