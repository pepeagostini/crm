import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * In-app user manual.
 *
 * Two tabs, because the reader matters:
 *  - "Guía de uso" — how to work with the CRM day to day. Visible to everyone.
 *  - "Instalación y configuración" — setting the system up. Admin only, since it
 *    contains server commands and credentials guidance.
 *
 * The table of contents scrolls programmatically instead of using bare anchors:
 * a plain <a href="#id"> is swallowed by the client-side router and can leave the
 * page unmoved.
 */

type SectionId =
  | "dia-a-dia"
  | "facturas-envio"
  | "reportes"
  | "tareas-agenda"
  | "consejos"
  | "instalacion"
  | "basedatos"
  | "email-whatsapp"
  | "usuarios"
  | "backups"
  | "problemas";

interface TocEntry {
  id: SectionId;
  label: string;
}

const TOC_USO: TocEntry[] = [
  { id: "dia-a-dia", label: "Primer arranque" },
  { id: "facturas-envio", label: "Facturas y envío" },
  { id: "reportes", label: "Reportes" },
  { id: "tareas-agenda", label: "Tareas y agenda" },
  { id: "consejos", label: "Consejos" },
];

const TOC_TECNICO: TocEntry[] = [
  { id: "instalacion", label: "Instalación" },
  { id: "basedatos", label: "Base de datos" },
  { id: "email-whatsapp", label: "Configurar el envío" },
  { id: "usuarios", label: "Usuarios y roles" },
  { id: "backups", label: "Respaldos" },
  { id: "problemas", label: "Problemas frecuentes" },
];

/**
 * Questions a seller can answer on their own. Nothing here mentions servers,
 * credentials or configuration, so it is safe for every role.
 */
const FAQ_USO = [
  {
    q: "El PDF sale con los datos viejos",
    a: "El destinatario se copia a la factura la primera vez que se genera el PDF, para que una reimpresión siga mostrando la dirección original. Para actualizarlo, pedile al administrador que edite la empresa.",
  },
  {
    q: "No se pudo generar el PDF",
    a: "Significa que a la empresa le falta el nombre o los datos fiscales. Avisale al administrador: aparecen en Ajustes → General.",
  },
  {
    q: "WhatsApp dice que el número no está registrado",
    a: "El teléfono debe tener WhatsApp, no solo SMS, y el formato debe incluir el código de país: +58 412 1234567.",
  },
  {
    q: "La factura salió sin el PDF",
    a: "Revisá que la casilla «Adjuntar la factura en PDF» siga marcada antes de enviar.",
  },
  {
    q: "No puedo eliminar una etapa del pipeline",
    a: "Es a propósito: esa etapa tiene oportunidades asociadas. Primero mové las oportunidades a otra etapa y después eliminarla.",
  },
  {
    q: "Olvidé mi contraseña",
    a: "No hay recuperación automática: pedile a un administrador que la restablezca.",
  },
  {
    q: "No veo la sección de Ajustes",
    a: "Ajustes, Usuarios y la configuración de envío son exclusivos del administrador. Todo lo demás funciona igual para tu rol.",
  },
  {
    q: "Mi venta no aparece en el reporte de vendedores",
    a: "Significa que la oportunidad no tiene vendedor asignado. Editala y elegí tu usuario en el campo «Vendedor asignado».",
  },
];

/** Troubleshooting that involves the server, credentials or configuration. */
const FAQ_ADMIN = [
  {
    q: "No se pudo contactar con el servidor",
    a: "El backend no está corriendo. Verificá que esté abierto en otra terminal y que el puerto 4000 esté libre con «lsof -i :4000».",
  },
  {
    q: "Aparece el asistente de instalación aunque ya lo hice",
    a: "Significa que la configuración no se está leyendo. Verificá que exista DATABASE_URL en backend/.env y reiniciá el backend.",
  },
  {
    q: "Cambié JWT_SECRET y ahora no puedo enviar facturas",
    a: "Es lo esperado: las claves de SMTP y WhatsApp se cifran con una clave derivada de JWT_SECRET. Volvé a cargar las credenciales. También se invalidaron las sesiones abiertas.",
  },
  {
    q: "Gmail dice «credenciales incorrectas»",
    a: "Google no permite iniciar sesión con la contraseña normal. Generá una contraseña de aplicación en la configuración de seguridad de la cuenta.",
  },
  {
    q: "El email pasa la prueba pero no se envía",
    a: "Si tu servidor exige TLS y lo dejaste en «Sin cifrado», el envío falla aunque la verificación pase. Probá con STARTTLS en el puerto 587.",
  },
  {
    q: "Un vendedor no puede probar el envío",
    a: "Es a propósito: probar conexiones abre enlaces salientes con credenciales del servidor, así que es exclusivo del administrador.",
  },
];

/** A code line: monospace block that never overflows its container. */
const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded break-words">{children}</code>
);

/** A terminal-style block for commands. */
const Terminal: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
    <code className="whitespace-pre">{children}</code>
  </pre>
);

/** Bulleted list with slate markers. */
const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="space-y-1.5">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2">
        <span className="text-slate-300 mt-1.5 shrink-0" aria-hidden="true">
          •
        </span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

/** Numbered steps for procedures. */
const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="space-y-2.5">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-semibold mt-0.5">
          {i + 1}
        </span>
        <span className="min-w-0">{item}</span>
      </li>
    ))}
  </ol>
);

/** Definition row inside a bordered box. */
const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-2 border-b border-slate-100 last:border-0">
    <dt className="sm:w-48 shrink-0 font-medium text-slate-900">{k}</dt>
    <dd className="min-w-0 break-words">{v}</dd>
  </div>
);

/** A callout for warnings and tips. */
const Callout: React.FC<{ tone: "warn" | "info"; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    className={`rounded-lg border p-3 text-sm flex gap-2 ${
      tone === "warn"
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : "bg-primary-50 border-primary-200 text-primary-900"
    }`}
  >
    <span className="shrink-0 mt-0.5" aria-hidden="true">
      {tone === "warn" ? "⚠" : "💡"}
    </span>
    <div className="min-w-0">{children}</div>
  </div>
);

/**
 * Section wrapper with a stable id and scroll offset.
 *
 * Defined at module level on purpose: declaring it inside HelpPage would make
 * React see a new component type on every render, tearing down and rebuilding
 * the whole tree (losing ref registration and open <details> state).
 */
const Section: React.FC<{
  id: SectionId;
  title: string;
  sectionRef: (id: SectionId) => (node: HTMLElement | null) => void;
  children: React.ReactNode;
}> = ({ id, title, sectionRef, children }) => (
  <section ref={sectionRef(id)} id={id} className="scroll-mt-4">
    <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
    <div className="space-y-3 text-sm text-slate-600">{children}</div>
  </section>
);

export const HelpPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [tab, setTab] = useState<"uso" | "tecnico">(isAdmin ? "tecnico" : "uso");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SectionId | null>(null);

  // Section refs let the table of contents scroll without relying on native
  // anchors, which the client-side router intercepts.
  const refs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

  const goTo = useCallback((id: SectionId) => {
    const el = refs.current[id];
    if (!el) return;
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Jump to a section named in the URL hash (e.g. /help#reportes).
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as SectionId;
    if (!hash) return;
    // Wait for the tab that owns the section to be rendered.
    const timer = window.setTimeout(() => goTo(hash), 60);
    return () => window.clearTimeout(timer);
  }, [goTo]);

  const q = query.trim().toLowerCase();
  const show = (text: string) => !q || text.toLowerCase().includes(q);

  const toc = tab === "uso" ? TOC_USO : TOC_TECNICO;
  // Each tab shows only the questions that belong to that audience.
  const faq = tab === "uso" ? FAQ_USO : FAQ_ADMIN;
  const visibleFaq = faq.filter((f) => show(`${f.q} ${f.a}`));

  /** Registers a section so the table of contents can scroll to it. */
  const sectionRef = (id: SectionId) => (node: HTMLElement | null) => {
    refs.current[id] = node;
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Ayuda</h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? "Guía de uso e instalación del CRM. Buscá lo que necesitás o recorré las secciones."
            : "Guía de uso del CRM. Buscá lo que necesitás o recorré las secciones."}
        </p>
      </header>

      <div className="card p-3 space-y-3">
        <label htmlFor="help-search" className="sr-only">
          Buscar en la ayuda
        </label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar: factura, whatsapp, contraseña, respaldo…"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />

        {/* Tabs: everyone gets the user guide, admins also get the technical one */}
        <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Secciones de la ayuda">
          {(
            [
              { id: "uso" as const, label: "Guía de uso" },
              ...(isAdmin
                ? [{ id: "tecnico" as const, label: "Instalación y configuración" }]
                : []),
            ]
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setActive(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] items-start">
        <div className="space-y-8 min-w-0">
          {/* ================================ GUÍA DE USO ================================ */}
          {tab === "uso" && (
            <>
              <Section id="dia-a-dia" title="Tu primer día en el CRM" sectionRef={sectionRef}>
                {show("primer día arranque acceso entrar login administrador contraseña empezar credenciales") && (
                  <>
                    <p>
                      El CRM se organiza alrededor de una idea simple: <strong>cada cliente es una empresa</strong>, y
                      todo lo que hacés con esa empresa cuelga de ahí.
                    </p>
                    <Steps
                      items={[
                        <>
                          <strong>Cargá tus empresas.</strong> Con el botón <em>+ Nueva empresa</em> en la barra
                          lateral. Necesitás al menos el nombre; lo demás (teléfono, email, dirección) se completa
                          después.
                        </>,
                        <>
                          <strong>Agregá los contactos</strong> de cada empresa. Ahí están los teléfonos y emails
                          que vas a usar para mandar facturas, así que vale la pena cargarlos.
                        </>,
                        <>
                          <strong>Cargá tus oportunidades.</strong> Cada venta que estás negociando es una
                          oportunidad con un valor y una etapa.
                        </>,
                        <>
                          <strong>Facturá.</strong> Cuando ganes, creás la factura desde la ficha de la oportunidad
                          y la enviás al cliente con el PDF.
                        </>,
                      ]}
                    />
                    <Callout tone="info">
                      Todo se guarda solo. No hay botón de guardar: cada cambio queda escrito en el momento.
                    </Callout>
                  </>
                )}
              </Section>

              <Section id="facturas-envio" title="Facturas y envío al cliente" sectionRef={sectionRef}>
                {show("factura factura enviar correo email whatsapp pdf cliente factura") && (
                  <>
                    <h3 className="font-medium text-slate-900">Crear una factura</h3>
                    <Steps
                      items={[
                        <>Entrá a <strong>Facturas</strong> y apretá <em>+ Nueva factura</em>.</>,
                        <>
                          Elegí la empresa y el número se genera solo con el prefijo configurado
                          (por ejemplo <Code>F-2026-001</Code>).
                        </>,
                        <>
                          Cargá el <strong>detalle de servicios</strong>: una fila por concepto, con descripción,
                          cantidad y precio unitario. El subtotal y el IVA se calculan solos.
                        </>,
                        <>

                          Revisá las fechas de emisión y vencimiento, y apretá <em>Crear factura</em>.
                        </>,
                      ]}
                    />

                    <h3 className="font-medium text-slate-900">Mandársela al cliente</h3>
                    <p>Desde la ficha de la factura tenés tres botones:</p>
                    <dl className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
                      <Row k="Enviar por email" v="Se abre con el email del cliente ya cargado." />
                      <Row k="Enviar por WhatsApp" v="Se abre con el teléfono del contacto si lo hay." />
                      <Row k="Descargar PDF" v="Genera el PDF y lo baja a tu computadora." />
                    </dl>
                    <p>
                      El mensaje viene precargado con el número y el importe de la factura: solo editá lo que
                      quieras y apretá <em>Enviar</em>. El PDF se adjunta salvo que desmarques la casilla.
                    </p>

                    <h3 className="font-medium text-slate-900">Cómo leer los estados</h3>
                    <dl className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
                      <Row k="Borrador" v="La creaste pero todavía no la mandaste." />
                      <Row k="Enviada" v="Llegó al cliente y todavía no la pagó." />
                      <Row k="Pagada" v="Cerrada. La marcás cuando te confirmen el pago." />
                      <Row k="Vencida" v="Pasó la fecha de vencimiento sin pago." />
                    </dl>
                    <Callout tone="info">
                      Todo lo que hay en esta pestaña funciona con tu usuario, sin depender del administrador.
                      Lo único que necesitás pedirle es cambiar datos fiscales de una empresa, editar el
                      pipeline y configurar el envío.
                    </Callout>
                    <Callout tone="info">
                      Cuando mandás una factura, el sistema registra <strong>la fecha, el canal y el
                      destinatario</strong>. Después podés ver qué se mandó y a quién, sin buscar en tu mail.
                    </Callout>
                  </>
                )}
              </Section>

              <Section id="reportes" title="Reportes" sectionRef={sectionRef}>
                {show("reportes reporte grafico kpi rendimiento vendedor pipeline embudo exportar csv charts") && (
                  <>
                    <p>En <strong>Reportes</strong> vas a encontrar:</p>
                    <Bullets
                      items={[
                        <><strong>KPIs y embudo:</strong> cuánto hay en el pipeline ahora y cuántas oportunidades hay en cada etapa.</>,
                        <><strong>Evolución mensual:</strong> cuánto ganaste, facturaste y cobraste en los últimos 6 meses.</>,
                        <><strong>Distribución del pipeline:</strong> cómo se reparten las oportunidades por valor.</>,
                        <><strong>Empresas por volumen:</strong> cuáles clientes concentran más negocio.</>,
                        <><strong>Rendimiento por vendedor:</strong> deals totales, ganados, tasa de cierre y valor abierto de cada uno.</>,
                      ]}
                    />
                    <p>
                      Con el selector <strong>Todas las empresas / nombre</strong> filtrás todos los gráficos por
                      un cliente puntual, y el botón <em>Exportar CSV</em> te baja los números para Excel.
                    </p>
                    <Callout tone="info">
                      El reporte de vendedores depende de que cada oportunidad tenga un <strong>vendedor
                      asignado</strong>. Si están sin asignar, aparecen juntos bajo «Sin asignar».
                    </Callout>
                  </>
                )}
              </Section>

              <Section id="tareas-agenda" title="Tareas y agenda" sectionRef={sectionRef}>
                {show("tarea tareas agenda hoy vencidas recordatorio seguimiento") && (
                  <>
                    <p>
                      Las tareas se agrupan solas según cuándo vencen, así no tenés que filtrar nada:
                    </p>
                    <dl className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
                      <Row k="Vencidas" v="Ya pasó la fecha. estas primero." />
                      <Row k="Hoy" v="Para hoy." />
                      <Row k="Próximas" v="Vencen más adelante." />
                      <Row k="Sin fecha" v="Sin vencimiento: cosas para hacer cuando puedas." />
                      <Row k="Completadas" v="Las que ya hiciste." />
                    </dl>
                    <p>
                      Marcá una tarea como hecha con la casilla del costado. Si le asignás un vendedor, la ve en
                      su <em>Dashboard</em> y en el contador de la barra lateral.
                    </p>
                  </>
                )}
              </Section>

              <Section id="consejos" title="Consejos para trabajar mejor" sectionRef={sectionRef}>
                {show("consejo tips recommendation usar mejor") && (
                  <>
                    <Bullets
                      items={[
                        <>
                          <strong>Usá el tablero kanban.</strong> En Oportunidades podés cambiar la vista a
                          tablero y arrastrar las tarjetas entre etapas. En el celular usá el menú <em>Mover a…</em>.
                        </>,
                        <>
                          <strong>Cargá los datos fiscales de tus clientes.</strong> Dirección, teléfono y CUIT
                          aparecen solos en el PDF de la factura.
                        </>,
                        <>
                          <strong>Asigná siempre un vendedor</strong> a cada oportunidad: es lo que hace útil el
                          reporte de rendimiento.
                        </>,
                        <>
                          <strong>Elegí una moneda y no la cambies sobre la marcha.</strong> Todas las facturas
                          quedan en la moneda con la que las creaste.
                        </>,
                        <>
                          <strong>Revisá el Dashboard apenas llegás.</strong> Ahí están las tareas vencidas y la
                          actividad reciente del equipo.
                        </>,
                      ]}
                    />
                  </>
                )}
              </Section>
            </>
          )}

          {/* ================================ TÉCNICO ================================ */}
          {tab === "tecnico" && isAdmin && (
            <>
              <Section id="instalacion" title="Instalación" sectionRef={sectionRef}>
                {show("instalación instalar requisitos node npm terminal comandos") && (
                  <>
                    <p>
                      Necesitás <strong>Node.js 18 o superior</strong> y npm. Abrí dos terminales: una para el
                      backend y otra para el frontend.
                    </p>
                    <Terminal>
                      {`# Terminal 1 — API (puerto 4000)
cd backend && npm install
node src/index.js

# Terminal 2 — interfaz (puerto 5173)
cd frontend && npm install
npm run dev`}
                    </Terminal>
                    <p>
                      Después abrí <Code>http://localhost:5173</Code>. Si todavía no hay base de datos, el CRM te
                      redirige al asistente.
                    </p>
                    <Bullets
                      items={[
                        <>
                          <strong>JWT_SECRET</strong> en <Code>backend/.env</Code> es obligatorio (mínimo 32
                          caracteres). Copiá <Code>backend/.env.example</Code>.
                        </>,
                        <>
                          Los drivers <Code>pg</Code>, <Code>mysql2</Code> y <Code>mongodb</Code> son
                          opcionales: solo se cargan si elegís ese motor.
                        </>,
                        <>Los directorios <Code>uploads/invoices/</Code> y <Code>src/db.sqlite</Code> se crean solos.</>,
                      ]}
                    />
                    <Terminal>
                      {`# Generar una clave segura
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`}
                    </Terminal>
                    <Callout tone="warn">
                      Si regenerás <Code>JWT_SECRET</Code> más adelante, se invalidan las sesiones y hay que volver
                      a cargar el SMTP y el WhatsApp: esas claves se cifran con una clave derivada de él.
                    </Callout>
                  </>
                )}
              </Section>

              <Section id="basedatos" title="Base de datos" sectionRef={sectionRef}>
                {show("base de datos sqlite postgres postgresql mysql mariadb mongodb asistente esquema") && (
                  <>
                    <p>
                      El asistente web crea la base de datos, las tablas y el usuario administrador. No hace falta
                      tocar una terminal.
                    </p>
                    <h3 className="font-medium text-slate-900">Cuál elegir</h3>
                    <dl className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
                      <Row k="SQLite" v="Un equipo, sin DBA. Cero configuración: es un archivo en tu disco. Empezá acá." />
                      <Row k="PostgreSQL" v="Producción o varios usuarios simultáneos, con backups del servidor." />
                      <Row k="MySQL / MariaDB" v="Si tu hosting ya tiene MySQL y querés reutilizarlo." />
                      <Row k="MongoDB" v="Si tu empresa ya estandarizó MongoDB." />
                    </dl>
                    <h3 className="font-medium text-slate-900">El flujo</h3>
                    <Steps
                      items={[
                        <><strong>Elegí el motor.</strong> Con SQLite solo apretás Continuar.</>,
                        <><strong>Completá las credenciales.</strong> Hay una casilla para importar datos existentes, útil la primera vez.</>,
                        <><strong>Probá la conexión</strong> y, si funciona, apretá <em>Instalar ahora</em>.</>,
                      ]}
                    />
                    <h3 className="font-medium text-slate-900">Cambiar de motor más adelante</h3>
                    <p>
                      El asistente se bloquea a propósito cuando ya hay una instalación, para no pisar una base que
                      funciona. Para migrar, editá <Code>backend/.env</Code>:
                    </p>
                    <Terminal>
                      {`CRM_DB_PROVIDER=postgresql
DATABASE_URL=postgresql://usuario:clave@host:5432/crm`}
                    </Terminal>
                    <p>
                      Después borrá <Code>backend/src/db.json</Code> y reiniciá el backend: hidrata todo desde la base
                      nueva.
                    </p>
                  </>
                )}
              </Section>

              <Section id="email-whatsapp" title="Configurar el envío de facturas" sectionRef={sectionRef}>
                {show("email whatsapp smtp evolution meta cloud factura pdf configurar") && (
                  <>
                    <h3 className="font-medium text-slate-900">1. Datos de la empresa</h3>
                    <p>
                      En <Link to="/settings" className="text-primary-600 hover:underline">Ajustes → General</Link> completá
                      dirección, teléfono, CUIT/CIF, email y sitio web. Esos datos salen en el encabezado del PDF.
                    </p>

                    <h3 className="font-medium text-slate-900">2. Email por SMTP</h3>
                    <p>En <strong>Ajustes → Envío</strong>:</p>
                    <dl className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
                      <Row k="Gmail / Workspace" v={<><Code>smtp.gmail.com</Code> · 465 · SSL</>} />
                      <Row k="Outlook / Hotmail" v={<><Code>smtp-mail.outlook.com</Code> · 587 · STARTTLS</>} />
                      <Row k="Yahoo" v={<><Code>smtp.mail.yahoo.com</Code> · 465 · SSL</>} />
                      <Row k="Zoho Mail" v={<><Code>smtp.zoho.com</Code> · 465 · SSL</>} />
                    </dl>
                    <Callout tone="warn">
                      <strong>Gmail y Google Workspace</strong> necesitan una <em>contraseña de aplicación</em>, no
                      la contraseña de tu cuenta.
                    </Callout>

                    <h3 className="font-medium text-slate-900">3. WhatsApp</h3>
                    <Bullets
                      items={[
                        <>
                          <strong>Evolution API</strong> (recomendada): sin costo por mensaje y control total de los
                          datos. Necesitás un servidor propio con Docker. <em>Adjunta el PDF directamente.</em>
                        </>,
                        <>
                          <strong>Cloud API (Meta)</strong>: la oficial, requiere cuenta de Meta Business verificada
                          y número de WhatsApp Business. <em>Comparte el PDF como enlace</em>, por eso pide la URL
                          pública del CRM.
                        </>,
                      ]}
                    />
                    <Terminal>
                      {`docker run -d --name evolution -p 8080:8080 \\
  -e AUTHENTICATION_API_KEY=tu-clave-secreta \\
  --restart always \\
  atleastonce/evolution-api:latest`}
                    </Terminal>
                    <p>
                      Después creás una instancia en <Code>http://localhost:8080/manager</Code> con ese nombre y
                      escaneás el QR con tu celular.
                    </p>
                    <Callout tone="warn">
                      La Cloud API de Meta <strong>no puede subir adjuntos</strong>. Para recordatorios
                      automáticos de facturas vencidas vas a necesitar plantillas aprobadas por Meta.
                    </Callout>

                    <h3 className="font-medium text-slate-900">Seguridad</h3>
                    <Bullets
                      items={[
                        <>Las contraseñas y tokens se cifran con AES-256-GCM; el navegador nunca los recibe.</>,
                        <>Solo un administrador puede ver y probar la configuración de envío.</>,
                        <>Los envíos tienen límite de frecuencia para evitar uso indebido.</>,
                      ]}
                    />
                  </>
                )}
              </Section>

              <Section id="usuarios" title="Usuarios y roles" sectionRef={sectionRef}>
                {show("usuarios roles administrador vendedor permisos equipo crear editar eliminar") && (
                  <>
                    <dl className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
                      <Row k="Administrador" v="Todo, incluidos usuarios, ajustes, pipeline y envío." />
                      <Row k="Vendedor" v="Empresas, contactos, oportunidades, facturas, tareas y reportes." />
                    </dl>
                    <p>
                      En <Link to="/settings/users" className="text-primary-600 hover:underline">Ajustes → Equipo</Link> podés:
                    </p>
                    <Bullets
                      items={[
                        <><strong>Crear</strong> usuarios (el rol por defecto es Vendedor).</>,
                        <><strong>Editar</strong> nombre, rol y contraseña.</>,
                        <><strong>Activar o desactivar</strong>: desactivar impide iniciar sesión sin borrar nada.</>,
                        <><strong>Eliminar</strong> el usuario definitivamente.</>,
                      ]}
                    />
                    <p>
                      El administrador principal no se puede eliminar ni desactivar, para que nunca te quedes sin
                      acceso.
                    </p>
                    <Bullets
                      items={[
                        <>Contraseñas cifradas con bcrypt.</>,
                        <>Sesiones con JWT HS256 de 7 días.</>,
                        <>Máximo 20 intentos fallidos por IP cada 15 minutos.</>,
                      ]}
                    />
                  </>
                )}
              </Section>

              <Section id="backups" title="Respaldos" sectionRef={sectionRef}>
                {show("respaldo backup copia seguridad respaldar datos exportar") && (
                  <>
                    <p>Programá el respaldo con cron para no olvidarte:</p>
                    <Terminal>
                      {`# SQLite
cp /ruta/crm/backend/src/db.sqlite /respaldos/crm-$(date +\\%F).sqlite

# PostgreSQL
pg_dump -h HOST -U USUARIO -d crm > /respaldos/crm-$(date +\\%F).sql

# MySQL
mysqldump -u USUARIO -p crm > /respaldos/crm-$(date +\\%F).sql

# MongoDB
mongodump --uri "mongodb://…" --out /respaldos/crm-$(date +\\%F)`}
                    </Terminal>
                    <Callout tone="warn">
                      <Code>backend/src/db.json</Code> se mantiene actualizado como respaldo secundario. No lo
                      borres sin tener otra copia.
                    </Callout>
                  </>
                )}
              </Section>
            </>
          )}

          {/* ============================ PROBLEMAS (según el rol) ============================ */}
          {visibleFaq.length > 0 && (
            <section id="problemas" ref={sectionRef("problemas")} className="scroll-mt-4">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">
                {tab === "uso" ? "Problemas frecuentes" : "Problemas técnicos"}
              </h2>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {visibleFaq.map((f) => (
                  <details key={f.q} className="group px-4 py-3">
                    <summary className="cursor-pointer font-medium text-slate-900 flex items-start justify-between gap-3 list-none">
                      <span>{f.q}</span>
                      <span
                        className="text-slate-400 shrink-0 transition-transform group-open:rotate-45"
                        aria-hidden="true"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-2 text-slate-600">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {q && visibleFaq.length === 0 && (
            <p className="text-sm text-slate-500 border-t border-slate-200 pt-4">
              Ningún resultado para «{query}». Probá con otra palabra, o{" "}
              <button type="button" onClick={() => setQuery("")} className="text-primary-600 hover:underline">
                ver todo
              </button>
              .
            </p>
          )}
        </div>

        {/* ------------------------------- Índice lateral ------------------------------- */}
        <aside className="lg:sticky lg:top-4 card p-4 hidden lg:block">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Contenido</h2>
          <nav aria-label="Índice de la ayuda">
            <ul className="space-y-1">
              {toc.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => goTo(entry.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      active === entry.id
                        ? "bg-primary-50 text-primary-700 font-medium"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {entry.label}
                  </button>
                </li>
              ))}
              {visibleFaq.length > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => goTo("problemas")}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      active === "problemas"
                        ? "bg-primary-50 text-primary-700 font-medium"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {tab === "uso" ? "Problemas frecuentes" : "Problemas técnicos"}
                  </button>
                </li>
              )}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
};

export default HelpPage;