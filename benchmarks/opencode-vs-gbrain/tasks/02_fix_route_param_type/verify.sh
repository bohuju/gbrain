#!/bin/bash
set -euo pipefail

echo "=== Test: Int convertor ==="
cat > /tmp/test_convertor.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.testclient import TestClient
from starlette.responses import JSONResponse

async def get_item(request):
    item_id = request.path_params["item_id"]
    return JSONResponse({"id": item_id, "type": type(item_id).__name__})

app = Starlette(routes=[
    Route("/items/{item_id:int}", get_item),
])

client = TestClient(app)
resp = client.get("/items/42")
data = resp.json()
assert data["id"] == 42, f"Expected id=42, got {data['id']}"
assert data["type"] == "int", f"Expected type=int, got {data['type']}"
print("PASS: int convertor works")
PYEOF
python3 /tmp/test_convertor.py || { echo "FAIL"; exit 1; }

echo "=== Test: Existing routing tests ==="
cd /tmp/starlette-bench
python3 -m pytest tests/test_convertors.py -x -q || { echo "FAIL: Existing convertor tests"; exit 1; }

exit 0
