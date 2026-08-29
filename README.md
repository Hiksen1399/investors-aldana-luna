# Mi Portafolio

MVP full-stack para centralizar inversiones de Hapi y XTB, separar aportes de rentabilidad y mantener un historial financiero auditable.

## Estructura

```text
investors-aldana-luna/
├── frontend/   Angular standalone, Signals, formularios reactivos, ECharts y PWA
├── backend/    Node.js, Express, TypeScript, Zod, Prisma y Swagger
├── docker-compose.yml
└── package.json
```

## Inicio rápido

Requisitos: Node.js 22+, npm 11+ y Docker Desktop.

```bash
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Abre:

- Aplicación: http://localhost:4200
- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs

El seed solo crea catálogos de referencia. Cada usuario debe registrarse y cargar sus propias cuentas y operaciones.

## Base de datos

La migración inicial está en `backend/prisma/migrations/20260712230000_initial_schema/migration.sql`. Crea 27 tablas de aplicación para autenticación, colaboración, inversiones, lotes FIFO, importaciones, analítica, adjuntos, auditoría y notificaciones. También agrega los catálogos mínimos de monedas, Hapi y XTB.

Comandos útiles:

```bash
npm run db:migrate
npm run db:seed
npm run db:studio -w backend
```

Los importes se guardan como `DECIMAL(28,10)` y las fechas como `TIMESTAMPTZ`. Las ventas reconstruyen sus asignaciones de lotes FIFO dentro de una transacción de base de datos.

## Funcionalidad incluida

- Registro, login, refresh token rotatorio, cierre de sesión y recuperación de contraseña.
- Hash Argon2id, rate limit, bloqueo temporal, Helmet y auditoría de eventos principales.
- Espacio personal, permisos de colaboración y portafolio inicial al registrarse.
- Gestión de portafolios y cuentas Hapi/XTB.
- Registro, consulta y eliminación de compras, ventas, depósitos, retiros, dividendos, intereses, comisiones e impuestos.
- Posiciones, precio promedio, ganancia realizada FIFO, ganancia no realizada, flujo de caja y rendimiento total.
- Precios actuales e históricos mediante Twelve Data, caché persistente y fallback al último valor conocido.
- Dashboard responsive, historial, distribución por broker, ECharts y velas OHLCV con TradingView Lightweight Charts.
- PWA instalable y documentación Swagger.
- Importación funcional de correos EML de Hapi y documentos PDF/CSV/TXT de XTB, con revisión, asignación de cuenta y control de duplicados.
- Conexión OAuth con Outlook mediante Microsoft Graph, tokens cifrados, búsqueda histórica de hasta cinco años y sincronización automática de confirmaciones.
- Contraseñas de PDF XTB cifradas por cuenta con AES-256-GCM; se usan solo en memoria y nunca se muestran nuevamente.
- Dirección privada de reenvío y webhook disponibles como integración alternativa.

## Importaciones automáticas

El flujo por archivos y Microsoft Graph está activo y no depende de datos ficticios. En desarrollo puedes conectar una cuenta Outlook gratuitamente o cargar `.eml`, `.pdf`, `.csv` o `.txt` desde la pantalla **Importaciones**. Solo necesitas registrar la aplicación gratuita en Microsoft Entra y configurar el Client ID y Client Secret. La guía completa está en `backend/src/modules/imports/README.md`.

El reenvío mediante un dominio propio continúa disponible como alternativa, pero ya no es necesario para conectar Outlook.

## Verificación

```bash
npm run build
npm test -w backend -- --run
```

Antes de producción cambia `JWT_ACCESS_SECRET`, configura HTTPS, un gestor de secretos y almacenamiento S3 privado. El archivo `backend/.env` es solo para desarrollo local y está excluido de Git.

## Precios de mercado

Agrega tu clave gratuita de Twelve Data en `backend/.env`:

```env
TWELVE_DATA_API_KEY=tu_clave
```

Después reinicia el backend. La implementación, endpoints, caché y ejemplos están documentados en `backend/src/modules/market-data/README.md`. La clave permanece únicamente en el backend.
