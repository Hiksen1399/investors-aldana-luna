import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './shared/config/env.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { portfolioRouter } from './modules/portfolios/portfolio.routes.js';
import { accountRouter } from './modules/broker-accounts/account.routes.js';
import { transactionRouter } from './modules/transactions/transaction.routes.js';
import { referenceRouter } from './modules/reference/reference.routes.js';
import { importRouter, importRowRouter } from './modules/imports/import.routes.js';
import { livePortfolioRouter, marketDataRouter } from './modules/market-data/market-data.routes.js';

const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Mi Portafolio API', version: '0.1.0', description: 'API del MVP para consolidación de inversiones en Hapi y XTB.' },
  servers: [{ url: 'http://localhost:3000/api' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/health': { get: { summary: 'Estado del servicio', responses: { 200: { description: 'Servicio disponible' } } } },
    '/auth/register': { post: { summary: 'Crear cuenta', responses: { 201: { description: 'Cuenta creada' } } } },
    '/auth/login': { post: { summary: 'Iniciar sesión', responses: { 200: { description: 'Sesión iniciada' } } } },
    '/portfolios': { get: { summary: 'Listar portafolios', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Listado' } } }, post: { summary: 'Crear portafolio', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Creado' } } } },
    '/broker-accounts': { get: { summary: 'Listar cuentas de broker', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Listado' } } }, post: { summary: 'Crear cuenta de broker', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Creada' } } } },
    '/transactions': { get: { summary: 'Listar transacciones', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Listado paginado' } } }, post: { summary: 'Registrar operación', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Registrada' } } } },
    '/imports': { get: { summary: 'Listar importaciones del usuario', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Historial de lotes importados' } } } },
    '/imports/files': { post: { summary: 'Procesar un archivo EML, PDF, CSV o TXT', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, accountId: { type: 'string', format: 'uuid' }, broker: { type: 'string', enum: ['HAPI', 'XTB'] }, documentPassword: { type: 'string', format: 'password' } } } } } }, responses: { 201: { description: 'Archivo analizado y filas preparadas para revisión' } } } },
    '/imports/forwarding-address': { get: { summary: 'Obtener la dirección privada de reenvío', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Conexión de correo del usuario' } } } },
    '/imports/outlook/status': { get: { summary: 'Estado de la conexión OAuth con Outlook', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Configuración, cuenta y última sincronización' } } } },
    '/imports/outlook/connect': { post: { summary: 'Iniciar autorización OAuth con Microsoft Graph', security: [{ bearerAuth: [] }], responses: { 200: { description: 'URL segura de autorización' }, 503: { description: 'Credenciales Microsoft no configuradas' } } } },
    '/imports/outlook/sync': { post: { summary: 'Sincronizar confirmaciones Hapi/XTB desde Outlook', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { lookbackMonths: { type: 'integer', minimum: 1, maximum: 60 } } } } } }, responses: { 200: { description: 'Resultado de la sincronización histórica o incremental' } } } },
    '/imports/xtb-password/status': { get: { summary: 'Consultar qué cuentas XTB tienen contraseña PDF configurada', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Estado sin revelar secretos' } } } },
    '/imports/xtb-password': { put: { summary: 'Guardar cifrada la contraseña de PDF para una cuenta XTB', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Contraseña cifrada y configurada' } } } },
    '/imports/{id}/confirm': { post: { summary: 'Registrar las filas aprobadas como transacciones', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Resultado de la importación y duplicados omitidos' } } } },
    '/import-rows/{rowId}': { patch: { summary: 'Corregir y aprobar una fila importada', security: [{ bearerAuth: [] }], parameters: [{ name: 'rowId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Fila revisada' } } } },
    '/imports/inbound/email': { post: { summary: 'Webhook del proveedor de correo entrante', parameters: [{ name: 'x-inbound-secret', in: 'header', required: true, schema: { type: 'string' } }], responses: { 202: { description: 'Correo aceptado y analizado' }, 401: { description: 'Secreto inválido' } } } },
    '/portfolios/{id}/summary': { get: { summary: 'Resumen financiero FIFO', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Resumen' } } } },
    '/market-data/assets/{assetId}/quote': { get: { summary: 'Última cotización normalizada', security: [{ bearerAuth: [] }], parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Cotización vigente o último valor conocido' } } } },
    '/market-data/quotes': { get: { summary: 'Cotizaciones de varios activos', security: [{ bearerAuth: [] }], parameters: [{ name: 'assetIds', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Cotizaciones deduplicadas' } } } },
    '/market-data/assets/{assetId}/history': { get: { summary: 'Historial OHLCV', security: [{ bearerAuth: [] }], parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'interval', in: 'query', schema: { type: 'string', default: '1day' } }, { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } }, { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } }], responses: { 200: { description: 'Velas históricas' } } } },
    '/portfolios/{portfolioId}/live-summary': { get: { summary: 'Valoración del portafolio con precios de mercado', security: [{ bearerAuth: [] }], parameters: [{ name: 'portfolioId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Resumen y posiciones en vivo' } } } },
  },
};

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false }));
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '18mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'mi-portafolio-api', timestamp: new Date().toISOString() }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'Mi Portafolio API' }));
app.use('/api/auth', authRouter);
app.use('/api/portfolios', portfolioRouter);
app.use('/api/broker-accounts', accountRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/reference', referenceRouter);
app.use('/api/imports', importRouter);
app.use('/api/import-rows', importRowRouter);
app.use('/api/market-data', marketDataRouter);
app.use('/api/portfolios', livePortfolioRouter);

app.use(notFoundHandler);
app.use(errorHandler);
