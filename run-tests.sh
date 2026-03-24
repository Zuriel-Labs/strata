#!/usr/bin/env bash
# run-tests.sh — Full test suite for strata
# Runs: lint → unit/integration tests → typecheck → build → e2e tests
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
STEPS=()

log_step() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}▶ $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

pass_step() {
  echo -e "${GREEN}✔ $1 passed${NC}"
  PASS=$((PASS + 1))
  STEPS+=("${GREEN}✔${NC} $1")
}

fail_step() {
  echo -e "${RED}✘ $1 failed${NC}"
  FAIL=$((FAIL + 1))
  STEPS+=("${RED}✘${NC} $1")
}

run_step() {
  local name="$1"
  shift
  log_step "$name"
  if "$@"; then
    pass_step "$name"
  else
    fail_step "$name"
  fi
}

# Header
echo -e "${YELLOW}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              strata — Full Test Suite                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Started at: $(date)"
echo ""

# 1. Lint
run_step "Lint (ESLint)" npm run lint

# 2. Unit & Integration Tests
run_step "Unit & Integration Tests (Vitest)" npm run test

# 3. Typecheck
run_step "Typecheck (TypeScript)" npm run typecheck

# 4. Build
run_step "Build (Client + Server)" npm run build

# 5. E2E Tests
run_step "E2E Tests (Playwright)" npm run test:e2e

# Summary
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Summary${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
for step in "${STEPS[@]}"; do
  echo -e "  $step"
done
echo ""
echo -e "  ${GREEN}Passed: $PASS${NC}  ${RED}Failed: $FAIL${NC}"
echo ""
echo "Finished at: $(date)"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}✘ TEST SUITE FAILED${NC}"
  exit 1
else
  echo -e "\n${GREEN}✔ ALL TESTS PASSED${NC}"
  exit 0
fi
