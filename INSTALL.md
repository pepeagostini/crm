# CRM Installation Guide

## Quick Install

```bash
# 1. Install backend
cd backend && npm install

# 2. Start backend
node src/index.js
# API runs on http://localhost:4000

# 3. Open browser to http://localhost:5173
# Frontend auto-proxies to /api → http://localhost:4000
```

---

## Step 1: Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env - JWT_SECRET placeholder already set
node src/index.js
```

### Default Admin Credentials
- **Email:** `demo@crm.com`
- **Password:** `demo123`
- **Role:** ADMIN

---

## Step 2: Database Installation

First run - access install status:

```bash
# Check status
GET http://localhost:4000/api/install/status

# Run installation
POST http://localhost:4000/api/install/run
# Body: { provider: "sqlite", migrateExisting: false }
```

The system will:
- Create `src/db.sqlite`
- Apply Prisma schema
- Seed demo data
- Create admin user

---

## Step 3: Frontend Setup

```bash
cd ../frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

The Vite config proxies `/api` to `http://localhost:4000` automatically.

---

## ⚠️ Important Notes

- **Never commit** `.env` with real secrets to GitHub
- `db.sqlite` is generated on first install - add to `.gitignore`
- Default admin password must be changed after first login
- Use `npm run seed` to reload demo data idempotently

---

## 📂 Git Ignore Recommendations

Add to `.gitignore`:
```
.env
db.sqlite
node_modules/
dist/
```

---

## 🔐 Security

- Generate strong JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- SMTP/WhatsApp credentials are encrypted at rest
- Demo account: `demo@crm.com` / `demo123`