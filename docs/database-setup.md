# Instalación de base de datos

> Documento técnico. Para la guía de uso completa, mirá
> [README.md](./README.md) — o escribí la sección 5, que resume este mismo flujo.

El CRM arranca sin configuración: el backend usa su almacén en memoria y, si no
hay ninguna base de datos configurada, abre el asistente de instalación.

## Cómo funciona

1. Al entrar por primera vez, el frontend consulta `GET /api/install/status`.
2. Si no hay base de datos configurada, redirige a `/install`.
3. El administrador elige el motor, escribe sus credenciales y pulsa
   **Instalar ahora**. El backend se encarga del resto.

## Motores soportados

| Motor | Configuración | Notas |
|---|---|---|
| **SQLite** | ninguna | Usa el módulo nativo `node:sqlite`. Un solo archivo, sin servidor. **Por defecto.** |
| **PostgreSQL** | host, puerto, usuario, contraseña, base de datos, SSL | Crea la base de datos si no existe. Activa SSL en Neon/Supabase. |
| **MySQL / MariaDB** | host, puerto, usuario, contraseña, base de datos | Necesita permisos para `CREATE DATABASE`. |
| **MongoDB** | host, puerto, usuario, contraseña, base de datos | El usuario y la contraseña son opcionales. |

Los drivers de PostgreSQL (`pg`), MySQL (`mysql2`) y MongoDB (`mongodb`) son
dependencias opcionales: solo se cargan si eliges ese motor.

## Qué hace el instalador automáticamente

- Prueba la conexión sin escribir nada (`POST /api/install/test`).
- Crea la base de datos si todavía no existe.
- Crea las tablas, los índices y las columnas por las que se filtra
  (`deals.stage`, `deals.companyId`, `invoices.companyId`, `users.email`, …).
- Guarda cada registro completo en una columna JSON, para no perder los campos
  libres que ya usa el CRM (líneas de factura, ajustes del pipeline, etc.).
- Crea el usuario administrador `pedroagostini@gmail.com`.
- Opcionalmente migra los datos que ya estaban en `src/db.json`.
- Escribe la configuración en `backend/.env`:
  `CRM_DB_PROVIDER`, `CRM_DB_CONFIG` y `DATABASE_URL`.

## Arquitectura

Los handlers siguen leyendo y escribiendo mapas en memoria: **no cambia ni una
sínea de la lógica de negocio**. La capa de persistencia hace que ese mapa sea
durable.

```
petición → db.companies.get(id)      ← lectura síncrona desde memoria
          ← saveDb()  →  db.sqlite / PostgreSQL / MySQL / MongoDB
```

- `src/db/providers.js` — los cuatro motores, su DDL y su capa de persistencia.
- `src/install.js` — validaciones, creación, migración y escritura de `.env`.
- `src/index.js` — `hydrateFrom()` al arrancar y `schedulePersist()` en cada
  escritura (con *debounce* de 200 ms para agrupar ráfagas de cambios).

Al arrancar, si hay base de datos configurada, el backend se conecta y carga los
datos desde ella. Si la conexión falla, la app sigue funcionando con el
archivo `db.json` para que el administrador pueda entrar al instalador.

## Cambiar de base de datos más adelante

El asistente se bloquea a propósito cuando ya hay una instalación. Para
migrar, edita `backend/.env`:

```env
CRM_DB_PROVIDER=postgresql
CRM_DB_CONFIG=<cadena base64 con las credenciales en JSON>
DATABASE_URL=postgresql://usuario:clave@host:5432/crm
```

Después borra `src/db.json` (o renómbralo) y reinicia el backend: hidrata todo
desde la base de datos nueva.

## Empezar de cero en una máquina nueva

```bash
cd backend && npm install
cd ../frontend && npm install
# backend en una terminal
cd backend && node src/index.js
# frontend en otra
cd frontend && npm run dev
```

Abre <http://localhost:5173> y sigue el asistente.