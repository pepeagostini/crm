# CRM Pro — Documentación de uso e instalación

Guía completa para instalar el CRM, configurar la base de datos y enviar facturas
por email y WhatsApp.

---

## Índice

1. [Qué es este CRM](#1-qué-es-este-crm)
2. [Requisitos](#2-requisitos)
3. [Instalación](#3-instalación)
4. [Primer arranque](#4-primer-arranque)
5. [Instalación de la base de datos](#5-instalación-de-la-base-de-datos)
6. [Envío de facturas por email y WhatsApp](#6-envío-de-facturas-por-email-y-whatsapp)
7. [Módulos del CRM](#7-módulos-del-crm)
8. [Usuarios y permisos](#8-usuarios-y-permisos)
9. [Copias de seguridad](#9-copias-de-seguridad)
10. [Problemas frecuentes](#10-problemas-frecuentes)

---

## 1. Qué es este CRM

Un sistema de gestión comercial para pequeñas y medianas empresas, en español,
con los módulos que un negocio necesita para trabajar con sus clientes:

| Módulo | Para qué sirve |
|---|---|
| **Empresas** | Ficha de cada cliente, con contactos y datos fiscales |
| **Contactos** | Personas dentro de cada empresa, con su teléfono y email |
| **Oportunidades** | El pipeline de ventas, con etapas y probabilidades |
| **Facturas** | Emisión con detalle de servicios, IVA y envío al cliente |
| **Actividades** | Llamadas, reuniones y notas registradas |
| **Tareas** | Seguimiento con vencimiento, agrupadas por estado |
| **Reportes** | KPIs, embudo, evolución mensual y rendimiento por vendedor |
| **Usuarios** | Control de acceso por rol (Administrador / Vendedor) |
| **Notificaciones** | Avisos automáticos al crear contactos, tareas, facturas y ventas |

Dos cosas lo distinguen de un CRM genérico:

- **No hay instalación de base de datos.** El asistente web crea la base de
  datos, las tablas y el usuario administrador por vos.
- **Las facturas salen por email o WhatsApp** con el PDF adjunto, desde la misma
  ficha de la factura.

---

## 2. Requisitos

### Necesario

- **Node.js 18 o superior** (probado con 22)
- **npm** (viene con Node.js)
- Un navegador moderno

### Opcional, según la base de datos que elijas

| Base de datos | Requisito |
|---|---|
| SQLite | Nada. Se usa el módulo nativo de Node.js |
| PostgreSQL | Un servidor PostgreSQL 12+ accesible por red |
| MySQL / MariaDB | Un servidor MySQL 8+ o MariaDB 10.5+ |
| MongoDB | MongoDB 5+ |

Para **Evolution API** (WhatsApp), un servidor propio con Docker — ver
[la sección 6](#62-whatsapp).

---

## 3. Instalación

### 3.1 Obtener el código

```bash
git clone <url-del-repositorio> crm
cd crm
```

### 3.2 Backend

```bash
cd backend
npm install
```

Esto instala el servidor y los drivers de base de datos (`pg`, `mysql2`,
`mongodb`). Son **opcionales**: solo se cargan si elegís ese motor, así que una
instalación con SQLite funciona igual.

### 3.3 Frontend

```bash
cd ../frontend
npm install
```

### 3.4 Variables de entorno

El backend necesita una clave para firmar los tokens de sesión:

```bash
cd ../backend
cp .env.example .env    # si tenés el archivo de ejemplo
```

Si no lo tenés, creá `.env` a mano:

```env
PORT=4000

# Clave de firma de tokens. Mínimo 32 caracteres.
# Generala con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=cambiá_esto_por_una_clave_aleatoria_de_64_caracteres

JWT_ACCESS_TTL=7d
```

> **Importante:** guardá `JWT_SECRET` en un lugar seguro. Si la cambiás después,
> se invalidan todas las sesiones activas **y** hay que reconfigurar el SMTP y
> el WhatsApp, porque esas claves se cifran con una clave derivada de ella.

### 3.5 Directorios que se crean solos

Estos se generan automáticamente, no hace falta crearlos:

- `backend/uploads/invoices/` — los PDFs generados
- `backend/src/db.sqlite` — la base de datos, si elegís SQLite

---

## 4. Primer arranque

Abrí **dos terminales**.

**Terminal 1 — el backend:**

```bash
cd backend
node src/index.js
```

Deberías ver:

```
🗄️  No database configured yet — open /install to set one up
🚀 CRM Backend running on http://localhost:4000
```

**Terminal 2 — el frontend:**

```bash
cd frontend
npm run dev
```

Ahora abrí <http://localhost:5173>. Como todavía no hay base de datos
configurada, el CRM te redirige solo al asistente de instalación.

### Datos de acceso

El asistente crea el administrador por defecto:

| Campo | Valor |
|---|---|
| Email | `pedroagostini@gmail.com` |
| Contraseña | `/&aztq9hjbtaz` |

**Cambiá la contraseña apenas entres.** Para hacerlo: *Ajustes → Equipo*, o pedile
a un administrador que la cambie desde la gestión de usuarios.

---

## 5. Instalación de la base de datos

El asistente tiene **3 pasos** y no te pide tocar una terminal.

### 5.1 Cuál base de datos elegir

| Base de datos | Cuándo usarla |
|---|---|
| **SQLite** | Un equipo, un servidor, sin DBA. **Empezá acá.** Cero configuración. |
| **PostgreSQL** | Producción, varios usuarios simultáneos, o si querés backups desde el servidor |
| **MySQL / MariaDB** | Si tu hosting ya tiene MySQL y querés reutilizarlo |
| **MongoDB** | Si tu empresa ya estandarizó MongoDB |

La diferencia práctica: SQLite es un archivo en tu disco (simple, sin
concurrencia), y las otras son servidores (requieren backup y mantenimiento, pero
soportan muchos usuarios a la vez).

### 5.2 El flujo del asistente

**Paso 1 — Elegir motor.** Si elegís SQLite solo apretás *Continuar*.

**Paso 2 — Credenciales.** Para SQLite es solo la ruta del archivo. Para el
resto, completás los datos de tu servidor. Hay una casilla para **importar los
datos existentes** (útil la primera vez, si venís de otra versión del CRM).

**Paso 3 — Confirmar.** El botón *Probar conexión* verifica las credenciales sin
escribir nada. Si funciona, apretás *Instalar ahora* y el sistema:

1. Crea la base de datos si no existe
2. Crea las tablas y los índices
3. Crea el usuario administrador
4. Migra los datos previos si marcaste la casilla
5. Guarda la configuración

### 5.3 Qué pasa si ya está instalado

El asistente se bloquea a propósito: no te deja pisar una base de datos que ya
funciona. Para cambiarla, editá `backend/.env`:

```env
CRM_DB_PROVIDER=postgresql
DATABASE_URL=postgresql://usuario:clave@host:5432/crm
```

Después borrá `backend/src/db.json` (es la copia de respaldo) y reiniciá el
backend: hidrata todo desde la base de datos nueva.

### 5.4 Cómo funciona por dentro

Los módulos del CRM no hablan SQL directamente. Leen un mapa en memoria y la
capa de persistencia se encarga de escribir:

```
petición →  db.companies.get(id)          ← lectura inmediata
          ←  saveDb()  →  debounce 200ms  →  tu base de datos
```

Por eso agregar una base de datos nueva no requirió tocar una sola línea de la
lógica de negocio.

---

## 6. Envío de facturas por email y WhatsApp

### 6.1 Datos de la empresa (necesarios para el PDF)

Antes de enviar nada, completá *Ajustes → General*:

- **Dirección**, **Teléfono**, **CUIT / CIF**, **Email de la empresa**
- **Sitio web** y **Notas del pie de factura** (opcionales)

Estos datos aparecen en el encabezado del PDF.

### 6.2 Email por SMTP

En *Ajustes → Envío → Envío por email*:

| Campo | Ejemplo | Nota |
|---|---|---|
| Servidor | `smtp.gmail.com` | El de tu proveedor |
| Puerto | `587` | 465 si usás SSL |
| Usuario | `facturacion@miempresa.com` | |
| Contraseña | | Se guarda cifrada |
| Seguridad | STARTTLS | 465 → SSL, 587 → STARTTLS |
| Remitente | `facturacion@miempresa.com` | El que ve el cliente |

Configuraciones habituales:

| Proveedor | Servidor | Puerto | Seguridad |
|---|---|---|---|
| Gmail / Google Workspace | `smtp.gmail.com` | 465 | SSL |
| Outlook / Hotmail | `smtp-mail.outlook.com` | 587 | STARTTLS |
| Yahoo | `smtp.mail.yahoo.com` | 465 | SSL |
| Zoho Mail | `smtp.zoho.com` | 465 | SSL |

> **Gmail y Google Workspace** requieren una *contraseña de aplicación* en vez de
> la contraseña de tu cuenta. Sin eso, el envío falla con "credenciales
> incorrectas".

Apretá **Probar conexión** para verificar antes de guardar.

### 6.3 WhatsApp

En *Ajustes → Envío → Envío por WhatsApp* elegís proveedor:

#### 6.1 Evolution API — recomendada

Sin costo por mensaje y control total de tus datos. Necesitás un servidor
propio:

```bash
docker run -d \
  --name evolution \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=tu-clave-secreta \
  --restart always \
  atleastonce/evolution-api:latest
```

Después en el CRM:

| Campo | Ejemplo |
|---|---|
| URL | `http://localhost:8080` |
| Instancia | `crm` |
| API Key | La misma que definiste en el contenedor |

Luego, desde la interfaz de Evolution (`http://localhost:8080/manager`) creás una
instancia con ese nombre y escaneás el QR con tu celular. **Adjunta el PDF**
directamente.

#### 6.2 Cloud API (Meta)

La API oficial. Requiere:

1. Una cuenta de Meta Business verificada
2. Un número de WhatsApp Business
3. Crear una app en <https://developers.facebook.com> y agregar el producto
   *WhatsApp*
4. Generar un token permanente

| Campo | Dónde lo encuentras |
|---|---|
| Phone Number ID | Panel de WhatsApp → *API Setup* |
| Token de acceso | *Configuración → Token permanente* |

**Importante:** la Cloud API **no puede subir adjuntos**. El CRM comparte el PDF
como enlace, y por eso esta sección pide la **URL pública del CRM**. Debe ser
una dirección HTTPS por la que el cliente pueda entrar, por ejemplo
`https://crm.miempresa.com`.

> Los mensajes a números que no tearon a tu empresa dentro de las 24 horas
> requieren **plantillas aprobadas** por Meta. Para recordatorios automáticos de
> facturas vencidas vas a necesitar eso.

### 6.4 Enviar una factura

1. Abrí la factura
2. **Enviar por email** o **Enviar por WhatsApp**
3. Revisá el destinatario (se completa solo con el email de la empresa o el
   teléfono del contacto)
4. Editá el mensaje si hace falta
5. Dejá marcado *Adjuntar la factura en PDF* salvo que quieras mandar solo texto
6. **Enviar**

La factura queda registrada con la fecha, el canal y el destinatario, así
sabés qué se mandó y a quién.

### 6.5 Seguridad

- Las contraseñas SMTP y los tokens de WhatsApp se cifran con **AES-256-GCM**
  usando una clave derivada de `JWT_SECRET`.
- El navegador nunca recibe la contraseña real: solo ve puntos.
- Solo un **administrador** puede ver y probar la configuración de envío.
- Los envíos tienen límite de frecuencia para evitar abused accidental.

---

## 7. Módulos del CRM

### Dashboard

KPIs de pipeline, ventas ganadas, facturación, cobrado, tareas vencidas, actividad
reciente y el rendimiento por vendedor.

### Pipeline de ventas

Las etapas se configuran en *Ajustes → Pipeline*: nombre, probabilidad y color.
El tablero se puede ver como **tabla** o como **tablero kanban** (arrastrando
tarjetas entre columnas, o con el menú *Mover a…* en el celular).

Cada oportunidad puede asignarse a un vendedor, que es lo que alimenta el
reporte de rendimiento.

### Facturas

Creás la factura con:

- Número (se genera solo: `F-2026-001`)
- Empresa, fechas de emisión y vencimiento
- **Detalle de servicios**: filas con descripción, cantidad y precio unitario.
  El subtotal se calcula solo y el IVA se aplica según tu configuración.
- Estado y oportunidad asociada

Desde la ficha: descargar el PDF, enviarlo por email o WhatsApp.

> El IVA por defecto sale de *Ajustes → General*. En Venezuela suele ser 16%;
  ajustalo ahí y todas las facturas nuevas lo toman.

### Tareas

Se agrupan solas en **Vencidas**, **Hoy**, **Próximas**, **Sin fecha** y
**Completadas**. Cada tarea puede asignarse a un vendedor y vincularse a una
empresa.

### Reportes

- **KPI y embudo** por etapa
- **Evolución mensual** de ganado, facturado y cobrado (últimos 6 meses)
- **Distribución del pipeline**
- **Empresas por volumen**
- **Rendimiento por vendedor**: deals totales, ganados, tasa de cierre y valor
  abierto

Podés filtrar todo por empresa y exportar a **CSV**.

### Notificaciones

Se generan solas al crear un contacto, una tarea, una oportunidad o una factura.
Marcá la campana como leída cuando las revises.

---

## 8. Usuarios y permisos

### Roles

| Rol | Puede |
|---|---|
| **Administrador** | Todo, incluid usuarios, ajustes, pipeline y envío |
| **Vendedor** | Empresas, contactos, oportunidades, facturas, tareas y reportes |

### Gestionar el equipo

En *Ajustes → Equipo*:

- **Crear** usuario (el rol por defecto es Vendedor)
- **Editar** nombre, rol y contraseña
- **Activar / desactivar** — desactivar impide iniciar sesión, sin borrar nada
- **Eliminar** — borra el usuario definitivamente

> El administrador principal no se puede eliminar ni desactivar, para que nunca
> te quedes sin acceso.

### Inicio de sesión

- Contraseñas cifradas con **bcrypt**
- Sesiones con **JWT HS256**, 7 días de duración
- Máximo 20 intentos fallidos por IP cada 15 minutos

---

## 9. Copias de seguridad

### Con SQLite

```bash
cp backend/src/db.sqlite /respaldos/crm-$(date +%F).sqlite
```

Programalo con cron para hacerlo automático:

```cron
0 2 * * * cp /ruta/crm/backend/src/db.sqlite /respaldos/crm-$(date +\%F).sqlite
```

### Con PostgreSQL

```bash
pg_dump -h HOST -U USUARIO -d crm > /respaldos/crm-$(date +%F).sql
```

### Con MySQL

```bash
mysqldump -u USUARIO -p crm > /respaldos/crm-$(date +%F).sql
```

### Con MongoDB

```bash
mongodump --uri "mongodb://USUARIO:CLAVE@HOST:27017/crm" --out /respaldos/crm-$(date +%F)
```

Además, `backend/src/db.json` se mantiene actualizado como respaldo secondary.
No lo borres sin tener otra copia.

---

## 10. Problemas frecuentes

### "No se pudo contactar con el servidor"

El backend no está corriendo. Verificá que esté en otra terminal y que el puerto
4000 esté libre:

```bash
lsof -i :4000
```

### El asistente aparece aunque ya instalé

Significa que la configuración no se está leyendo. Verificá que exista
`DATABASE_URL` en `backend/.env` y reiniciá el backend.

### Cambié `JWT_SECRET` y ahora no puedo enviar facturas

Es lo esperado: las claves de SMTP y WhatsApp se cifran con una clave derivada de
`JWT_SECRET`. Volvé a cargar las credenciales en *Ajustes → Envío*.

También se invalidaron las sesiones abiertas: volvé a iniciar sesión.

### El PDF sale con los datos viejos

El destinatario se copia a la factura la primera vez que se genera el PDF, para
que una reimpresión siga mostrando la dirección original. Si querés actualizar
los datos del cliente, editá la **empresa** y generá el PDF de nuevo para una
factura nueva.

### Gmail dice "credenciales incorrectas"

Google no permite el login con la contraseña normal. Generá una **contraseña de
aplicación** en la configuración de seguridad de la cuenta.

### El email funciona en "Probar conexión" pero no al enviar

Si tu servidor exige TLS y lo dejaste en "Sin cifrado", el envío falla pero la
verificación puede pasar. Probá con **STARTTLS** en el puerto 587.

### WhatsApp dice "el número no está registrado"

El teléfono debe tener **WhatsApp**, no solo SMS, y el formato debe incluir el
código de país: `+54 9 11 5555-1111`.

### "No puedes eliminar la etapa X"

Correcto, y es a propósito: esa etapa tiene oportunidades asociadas. Primero
mové las oportunidades a otra etapa, después eliminala.

### "No se pudo generar el PDF"

Revisá que *Ajustes → General* tenga los datos de la empresa. El PDF necesita un
nombre de empresa para el encabezado.

---

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `cd backend && node src/index.js` | Levanta la API (puerto 4000) |
| `cd frontend && npm run dev` | Levanta la interfaz (puerto 5173) |
| `cd backend && npm run seed` | Carga datos de demostración |
| `lsof -i :4000` | Ver qué ocupa el puerto del backend |
| `tail -f /tmp/crm-backend.log` | Sigue el log del backend |

---

*CRM Pro — sistema de gestión comercial para pymes.*