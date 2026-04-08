#!/bin/bash
# @file scripts/setup-tests.sh
# Setup script for test environment

set -e

echo "🔧 Setting up test environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Check Prerequisites
# ============================================================================

echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python $(python3 --version)${NC}"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠ PostgreSQL is not installed (required for tests)${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL installed${NC}"
fi

# ============================================================================
# Setup Environment
# ============================================================================

echo -e "${YELLOW}Setting up environment...${NC}"

# Copy environment files if they don't exist
if [ ! -f .env.test ]; then
    cp .env.example .env.test
    echo -e "${GREEN}✓ Created .env.test${NC}"
else
    echo -e "${YELLOW}⚠ .env.test already exists${NC}"
fi

# ============================================================================
# Install Dependencies
# ============================================================================

echo -e "${YELLOW}Installing dependencies...${NC}"

# Backend
echo "Installing backend dependencies..."
cd backend
npm ci 2> /dev/null || npm install
cd ..
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

# Frontend
echo "Installing frontend dependencies..."
cd frontend
npm ci 2> /dev/null || npm install
cd ..
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

# Python
echo "Installing Python dependencies..."
cd ai_proctoring
pip install -q -r requirements.txt
pip install -q pytest pytest-cov pytest-asyncio
cd ..
echo -e "${GREEN}✓ Python dependencies installed${NC}"

# ============================================================================
# Setup Database
# ============================================================================

echo -e "${YELLOW}Setting up test database...${NC}"

# Check if PostgreSQL is running
if psql -U postgres -c "SELECT 1" &> /dev/null; then
    # Create test database if it doesn't exist
    psql -U postgres -c "CREATE DATABASE moodle_proctor_test;" 2>/dev/null || true
    echo -e "${GREEN}✓ Test database ready${NC}"
else
    echo -e "${YELLOW}⚠ PostgreSQL not running. Please start PostgreSQL to run integration tests${NC}"
fi

# ============================================================================
# Verify Installation
# ============================================================================

echo -e "${YELLOW}Verifying installation...${NC}"

cd backend
npm run lint:check > /dev/null 2>&1 && echo -e "${GREEN}✓ ESLint working${NC}"
npm run type-check > /dev/null 2>&1 && echo -e "${GREEN}✓ TypeScript working${NC}"
cd ..

cd frontend
npm run lint > /dev/null 2>&1 && echo -e "${GREEN}✓ Next.js working${NC}"
cd ..

python3 -m pytest --version > /dev/null 2>&1 && echo -e "${GREEN}✓ Pytest working${NC}"

# ============================================================================
# Playwright Setup
# ============================================================================

echo -e "${YELLOW}Setting up Playwright...${NC}"

npx playwright install --with-deps chromium firefox webkit > /dev/null 2>&1
echo -e "${GREEN}✓ Playwright browsers installed${NC}"

# ============================================================================
# Summary
# ============================================================================

echo ""
echo -e "${GREEN}✅ Test environment setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Start services: npm run dev:all"
echo "2. Run tests: npm run test:all"
echo "3. View coverage: npm run test:coverage"
echo ""
