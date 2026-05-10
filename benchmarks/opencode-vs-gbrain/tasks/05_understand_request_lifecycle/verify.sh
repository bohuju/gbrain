#!/bin/bash
set -euo pipefail
DOC="/tmp/starlette-bench/docs/request-lifecycle.md"

if [ -f "$DOC" ]; then
  LINES=$(wc -l < "$DOC")
  if [ "$LINES" -gt 20 ]; then
    echo "PASS: request-lifecycle.md created with $LINES lines"
    exit 0
  else
    echo "PARTIAL: document too short ($LINES lines)"
    exit 2
  fi
else
  echo "PARTIAL: no docs/request-lifecycle.md found -- analysis may be in agent session output"
  exit 2
fi
