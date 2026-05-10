#!/bin/bash
set -euo pipefail

echo "=== Test 1: Zero chunks ==="
cat > /tmp/test_chunk_0.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def empty_stream():
    pass

app = Starlette()
# app.add_middleware(ChunkCounterMiddleware)
@app.route("/empty")
def home(request):
    return StreamingResponse(empty_stream())

client = TestClient(app)
resp = client.get("/empty")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count in logs: {log_output}"
print("PASS: Zero chunk test")
PYEOF
python /tmp/test_chunk_0.py || { echo "FAIL: zero chunks"; exit 1; }

echo "=== Test 2: Single chunk ==="
cat > /tmp/test_chunk_1.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def single_chunk():
    yield b"hello"

app = Starlette()
@app.route("/single")
def home(request):
    return StreamingResponse(single_chunk())

client = TestClient(app)
resp = client.get("/single")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count: {log_output}"
print("PASS: Single chunk test")
PYEOF
python /tmp/test_chunk_1.py || { echo "FAIL: single chunk"; exit 1; }

echo "=== Test 3: Multiple chunks (>10) ==="
cat > /tmp/test_chunk_many.py << 'PYEOF'
from starlette.applications import Starlette
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

app = Starlette()
@app.route("/many")
def home(request):
    return StreamingResponse(many_chunks())

client = TestClient(app)
resp = client.get("/many")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count: {log_output}"
print("PASS: Multiple chunks test")
PYEOF
python /tmp/test_chunk_many.py || { echo "FAIL: multiple chunks"; exit 1; }

echo "=== Test 4: Existing tests ==="
cd /tmp/starlette-bench
python -m pytest tests/test_middleware.py -x -q || { echo "FAIL"; exit 1; }
exit 0
