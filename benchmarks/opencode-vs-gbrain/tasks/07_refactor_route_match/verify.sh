#!/bin/bash
set -euo pipefail

echo "=== Test: Full routing test suite ==="
cd /tmp/starlette-bench
python3 -m pytest tests/test_routing.py -x -q || { echo "FAIL: Routing tests"; exit 1; }

echo "=== Test: Import check (API unchanged) ==="
python3 -c "
from starlette.routing import Route, Router, Mount, Host
from starlette.applications import Starlette
print('All imports OK')
" || { echo "FAIL: Import check"; exit 1; }

exit 0
