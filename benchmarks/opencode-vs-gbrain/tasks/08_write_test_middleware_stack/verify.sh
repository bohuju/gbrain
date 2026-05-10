#!/bin/bash
set -euo pipefail

echo "=== Test: Middleware tests must pass ==="
cd /tmp/starlette-bench
python3 -m pytest tests/middleware/test_middleware.py -x -q || { echo "FAIL"; exit 1; }

echo "=== Test: Three new test functions must exist ==="
python3 -c "
import ast, sys
with open('tests/middleware/test_middleware.py') as f:
    tree = ast.parse(f.read())
test_funcs = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name.startswith('test_')]
order_test = any('order' in t.lower() for t in test_funcs)
exception_test = any('exception' in t.lower() or 'error' in t.lower() for t in test_funcs)
async_test = any('async' in t.lower() or 'sync' in t.lower() or 'mixed' in t.lower() for t in test_funcs)

if order_test and exception_test and async_test:
    print('PASS: Three test scenarios covered')
    sys.exit(0)
else:
    missing = []
    if not order_test: missing.append('order')
    if not exception_test: missing.append('exception')
    if not async_test: missing.append('async/sync')
    print(f'MISSING tests for: {missing}')
    sys.exit(2)
" || { echo "PARTIAL: Some scenarios not covered"; exit 2; }

exit 0
