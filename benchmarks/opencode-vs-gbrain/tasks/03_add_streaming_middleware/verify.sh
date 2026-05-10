#!/bin/bash
set -euo pipefail

echo "=== Test 1: Zero chunks ==="
cat > /tmp/test_chunk_0.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def empty_stream():
    pass

async def home(request):
    return StreamingResponse(empty_stream())

app = Starlette(routes=[Route("/empty", home)])
# app.add_middleware(ChunkCounterMiddleware)

client = TestClient(app)
resp = client.get("/empty")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count in logs: {log_output}"
print("PASS: Zero chunk test")
PYEOF
python3 /tmp/test_chunk_0.py || { echo "FAIL: zero chunks"; exit 1; }

echo "=== Test 2: Single chunk ==="
cat > /tmp/test_chunk_1.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def single_chunk():
    yield b"hello"

async def home(request):
    return StreamingResponse(single_chunk())

app = Starlette(routes=[Route("/single", home)])

client = TestClient(app)
resp = client.get("/single")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count: {log_output}"
print("PASS: Single chunk test")
PYEOF
python3 /tmp/test_chunk_1.py || { echo "FAIL: single chunk"; exit 1; }

echo "=== Test 3: Multiple chunks (>10) ==="
cat > /tmp/test_chunk_many.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def many_chunks():
    for i in range(20):
        yield f"chunk{i:02d}".encode()

async def home(request):
    return StreamingResponse(many_chunks())

app = Starlette(routes=[Route("/many", home)])

client = TestClient(app)
resp = client.get("/many")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count: {log_output}"
print("PASS: Multiple chunks test")
PYEOF
python3 /tmp/test_chunk_many.py || { echo "FAIL: multiple chunks"; exit 1; }

echo "=== Test 4: Existing tests ==="
cd /tmp/starlette-bench
python3 -m pytest tests/middleware/test_middleware.py -x -q || { echo "FAIL"; exit 1; }
exit 0
