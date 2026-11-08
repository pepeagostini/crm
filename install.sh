#!/usr/bin/env bash
# CRM Automatic Installation Script
# Runs: backend install, database setup, frontend config

set -e

echo "🚀 CRM Installation Script"
echo "========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 0: Check requirements
echo -e "${YELLOW}Step 0: Checking requirements...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be >= 18${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Requirements met${NC}"

# Step 1: Backend installation
echo -e "${YELLOW}Step 1: Installing backend dependencies...${NC}"
cd backend || { echo -e "${RED}❌ backend directory not found${NC}"; exit 1; }
npm install 2>&1 | tail -5

# Step 2: Environment config
echo -e "${YELLOW}Step 2: Configuring environment...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ .env created from example${NC}"
else
    echo -e "${YELLOW}⚠️ .env already exists, skipping${NC}"
fi

# Step 3: Start backend in background
echo -e "${YELLOW}Step 3: Starting backend server...${NC}"
node src/index.js &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to start
echo -e "${YELLOW}⏳ Waiting for backend to start (5s)...${NC}"
sleep 5

# Step 4: Database installation
echo -e "${YELLOW}Step 4: Running database installation...${NC}"
echo "Running: POST /api/install/run"

# Run install - create sqlite database
INSTALL_RESULT=$(curl -s -X POST http://localhost:4000/api/install/run \
  -H "Content-Type: application/json" \
  -d '{"provider":"sqlite","migrateExisting":false}')

echo "$INSTALL_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success'):
        print('✅ Database installed successfully')
        print(f'   Provider: {data.get(\"data\", {}).get(\"provider\", \"N/A\")}')
        print(f'   Counts: {data.get(\"data\", {}).get(\"counts\", {})}')
    else:
        print(f'❌ Installation failed: {data.get(\"message\", \"Unknown error\")}')
except:
    print('Raw response:', sys.stdin.read())
"

# Step 5: Frontend installation
echo -e "${YELLOW}Step 5: Installing frontend...${NC}"
cd ../frontend || { echo -e "${RED}❌ frontend directory not found${NC}"; exit 1; }
npm install 2>&1 | tail -3

# Step 6: Final summary
echo ""
echo -e "${GREEN}===========================${NC}"
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo -e "${GREEN}=============================${NC}"
echo ""
echo -e "📍 Frontend:  http://localhost:5173"
echo -e "📍 Backend:   http://localhost:4000"
echo -e "📍 API Docs:  http://localhost:4000/api/health"
echo -e "📍 Login:     demo@crm.com / demo123"
echo ""
echo -e "${YELLOW}Remember:${NC}"
echo -e "  • Never commit .env to GitHub"
echo -e "  • Change default admin password"
echo -e "  • Use npm run seed to reload demo data"
echo ""
# Kill backend when done (optional - comment out to keep running)
# kill $BACKEND_PID 2>/dev/null

echo "Script finished."