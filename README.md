# CRM - Professional for SMEs

## 📊 CRM Professional para PYMES

A complete Customer Relationship Management system built with **Node.js + Express** for the backend and **React + Vite** for the frontend.

---

## 🛠️ Technologies

### Backend
- **Node.js** with **Express** API
- **Prisma ORM** for database management
- **SQLite** (default) / PostgreSQL / MySQL / MongoDB
- **JWT** authentication (HS256)
- **Bcrypt** password hashing
- **Helmet**, **CORS**, **Rate Limiting** security
- **Morgan** request logging

### Frontend
- **React** with **Vite**
- **Tailwind CSS** v4 for styling
- **Axios** for API calls
- **React Router** for navigation
- **Context API** for auth state

### Key Features
- User authentication (register/login)
- Company/contact management
- Deal/pipeline with stages
- Invoice creation and status tracking
- Activity logging (calls, meetings, notes)
- Sales reporting (pipeline value, conversion, KPIs)
- Role-based access (admin, vendor, viewer)

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/tu-usuario/crm.git
cd crm
```

### 2. Install & run backend
```bash
cd backend
npm install
cp .env.example .env
node src/index.js
# API runs on http://localhost:4000
```

### 3. Install & run frontend
```bash
cd ../frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

### 4. Access the app
Open `http://localhost:5173` and login with:
- **Email:** ``
- **Password:** ``

---

## 📦 Available Scripts

### Backend (`cd backend`)
| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `node src/index.js` | Start API server (port 4000) |
| `npm run seed` | Load demo data (idempotent) |
| `npm test` | Run test suite |

### Frontend (`cd frontend`)
| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Build for production |

### Root
| Command | Description |
|---------|-------------|
| `concurrently "cd backend && node src/index.js" "cd frontend && npm run dev"` | Run both frontend and backend |

---

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns user data)
- `GET /api/auth/me` - Get current user profile

### Companies / Contacts
- `GET /api/companies` - List all companies
- `POST /api/companies` - Create new company
- `GET /api/contacts` - List contacts (filtered by companyId)

### Deals / Pipeline
- `GET /api/deals` - List deals (filtered by companyId)
- `POST /api/deals` - Create new deal
- `PATCH /api/deals/:id/status` - Update deal stage/status

### Invoices / Billing
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create new invoice
- `PATCH /api/invoices/:id/status` - Update invoice status

### Activities / Interactions
- `GET /api/activities` - List activities
- `POST /api/activities` - Create new activity

### Reports
- `GET /api/reports/sales` - Sales summary
- `GET /api/reports/funnel` - Pipeline by stage
- `GET /api/reports/conversion` - Conversion rates
- `GET /api/reports/monthly` - Last 6 months KPIs

### Settings
- `GET /api/settings` - Configuration (read for all, admin writes)
- `PUT /api/settings` - Update configuration (admin only)

### Users (admin only)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Notifications
- `GET /api/notifications` - List notifications
- `POST /api/notifications/read-all` - Mark all as read

---

## 📁 Project Structure

```
crm/
├── backend/           # Node.js + Express API
│   ├── src/
│   │   ├── index.js       # Entry point + all API routes
│   │   ├── install.js     # Quick-install orchestration
│   │   ├── db/
│   │   │   └── providers.js  # Database drivers + DDL
│   │   ├── seed.js        # Demo data seeder
│   │   ├── db.json        # Legacy JSON store
│   │   └── db.sqlite      # Default database (created by /install)
│   ├── .env             # Environment variables
│   ├── .env.example     # Example environment (safe to commit)
│   ├── package.json     # Dependencies
│   └── prisma/          # Prisma ORM configuration
├── frontend/          # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── main.tsx       # Entry point: routes + auth guards
│   │   ├── index.css      # Tailwind v4 theme
│   │   ├── lib/format.ts  # Formatters + stage/type maps
│   │   ├── hooks/useAuth.tsx # Auth context
│   │   ├── services/api.ts  # API wrapper
│   │   ├── pages/         # Page components
│   │   └── components/    # UI components
│   ├── vite.config.ts   # Vite config with API proxy
│   ├── package.json     # Frontend dependencies
│   └── tsconfig.json    # TypeScript config
├── .gitignore         # git ignore file (includes .env)
├── AGENTS.md          # Agent guidance
├── INSTALL.md         # Installation guide (this)
├── INSTALL.sh         # Auto-installation script
└── task.md            # Current mission brief
```

---

## 🔐 Authentication

The API uses real HS256 JWT + bcrypt password hashing:

1. **Login:** `POST /api/auth/login` with `{ email, password }` → `{ success, token, data }`
2. **Store token:** `localStorage.setItem("crm_auth_token", response.token)`
3. **Include in requests:** `Authorization: Bearer <token>` (all `/api/*` except `/api/health`, `/api/auth/login`, `/api/auth/register`)
4. **Expired token** → 401 `Session expired` — frontend cleans localStorage and redirects to `/login`

- Passwords are bcrypt-hashed
- Login is rate-limited: 20 failed attempts per 15 min per IP
- `JWT_SECRET` must be set in `backend/.env` (min 32 chars)
- Admin seed user: `pedroagostini@gmail.com` / `/&aztq9hjbtaz`

---

## 🌐 Frontend Configuration

The frontend Vite config proxies API calls:

```js
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
```

This means frontend can fetch `/api/companies` and it will proxy to `http://localhost:4000/api/companies`.

---

## 🎯 Roadmap / Next Steps

1. Authentication Security - Proper JWT with bcrypt
2. Role-Based Access - Proper permissions per user/role
3. WhatsApp Integration - Twilio API
4. FactuSol Integration - Accounting software sync
5. Email Notifications - Nodemailer
6. Advanced Reporting - More detailed reports, filters, exports (PDF/CSV)
7. React Query - Replace manual API calls
8. Testing - Jest/Vitest unit tests and Playwright E2E
9. Deployment - Dockerize app, production environment

---

## 🐛 Common Issues

| Problem | Solution |
|---------|----------|
| "JWT_SECRET not defined" | Copy `.env.example` to `.env` and set a key |
| "Database not configured" | Run `/api/install/run` first |
| Login fails with "Session expired" | Clear localStorage and re-login |
| CORS errors | Ensure proxy is running in Vite |
| SQLite not creating | Check write permissions on `backend/src/` |

---

## 📄 License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.

---

## 📞 Contact

- **Generated for:** CRM project started Mon Oct 05 2026
- **Today's date:** Sat Nov 07 2026
- **Documentation:** See `AGENTS.md` for agent guidance
