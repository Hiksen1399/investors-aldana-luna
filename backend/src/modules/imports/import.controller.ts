import type { Request, Response } from 'express';
import { env } from '../../shared/config/env.js';
import { batchIdParamsSchema, inboundEmailSchema, outlookCallbackSchema, outlookSyncSchema, reviewImportRowSchema, rowIdParamsSchema, uploadImportSchema, xtbAccountParamsSchema, xtbPdfPasswordSchema } from './import.schemas.js';
import { importService, type ImportService } from './import.service.js';
import { outlookGraphService, type OutlookGraphService } from './outlook-graph.service.js';
import { xtbPdfCredentialService, type XtbPdfCredentialService } from './xtb-pdf-credential.service.js';

export class ImportController {
  constructor(
    private readonly service: ImportService = importService,
    private readonly outlook: OutlookGraphService = outlookGraphService,
    private readonly xtbCredentials: XtbPdfCredentialService = xtbPdfCredentialService,
  ) {}

  list = async (req: Request, res: Response) => res.json({ data: await this.service.list(req.auth!.userId) });
  get = async (req: Request, res: Response) => {
    const { id } = batchIdParamsSchema.parse(req.params);
    res.json({ data: await this.service.get(req.auth!.userId, id) });
  };
  rows = async (req: Request, res: Response) => {
    const { id } = batchIdParamsSchema.parse(req.params);
    const batch = await this.service.get(req.auth!.userId, id);
    res.json({ data: batch.rows });
  };
  upload = async (req: Request, res: Response) => {
    const input = uploadImportSchema.parse(req.body);
    const data = await this.service.upload(req.auth!.userId, req.file, input);
    res.status(201).json({ data });
  };
  confirm = async (req: Request, res: Response) => {
    const { id } = batchIdParamsSchema.parse(req.params);
    res.json({ data: await this.service.confirm(req.auth!.userId, id) });
  };
  retry = async (req: Request, res: Response) => {
    const { id } = batchIdParamsSchema.parse(req.params);
    res.json({ data: await this.service.confirm(req.auth!.userId, id) });
  };
  forwardingAddress = async (req: Request, res: Response) => res.json({ data: await this.service.forwardingAddress(req.auth!.userId) });
  outlookStatus = async (req: Request, res: Response) => res.json({ data: await this.outlook.status(req.auth!.userId) });
  outlookConnect = async (req: Request, res: Response) => res.json({ data: await this.outlook.authorizationUrl(req.auth!.userId) });
  outlookSync = async (req: Request, res: Response) => res.json({ data: await this.outlook.sync(req.auth!.userId, outlookSyncSchema.parse(req.body)) });
  outlookDisconnect = async (req: Request, res: Response) => res.json({ data: await this.outlook.disconnect(req.auth!.userId) });
  xtbPasswordStatus = async (req: Request, res: Response) => res.json({ data: await this.xtbCredentials.status(req.auth!.userId) });
  xtbPasswordSave = async (req: Request, res: Response) => {
    const input = xtbPdfPasswordSchema.parse(req.body);
    res.json({ data: await this.xtbCredentials.save(req.auth!.userId, input.accountId, input.password) });
  };
  xtbPasswordRemove = async (req: Request, res: Response) => {
    const { accountId } = xtbAccountParamsSchema.parse(req.params);
    res.json({ data: await this.xtbCredentials.remove(req.auth!.userId, accountId) });
  };
  outlookCallback = async (req: Request, res: Response) => {
    const query = outlookCallbackSchema.parse(req.query);
    const target = new URL('/app/importaciones', env.FRONTEND_URL);
    if (query.error || !query.code || !query.state) {
      target.searchParams.set('outlook', 'denied');
      res.redirect(target.toString());
      return;
    }
    try {
      await this.outlook.callback(query.code, query.state);
      target.searchParams.set('outlook', 'connected');
    } catch {
      target.searchParams.set('outlook', 'error');
    }
    res.redirect(target.toString());
  };
  inbound = async (req: Request, res: Response) => res.status(202).json({ data: await this.service.processInbound(req.get('x-inbound-secret'), inboundEmailSchema.parse(req.body)) });
  reviewRow = async (req: Request, res: Response) => {
    const { rowId } = rowIdParamsSchema.parse(req.params);
    res.json({ data: await this.service.reviewRow(req.auth!.userId, rowId, reviewImportRowSchema.parse(req.body)) });
  };
  approveRow = async (req: Request, res: Response) => {
    const { rowId } = rowIdParamsSchema.parse(req.params);
    res.json({ data: await this.service.approveRow(req.auth!.userId, rowId) });
  };
  rejectRow = async (req: Request, res: Response) => {
    const { rowId } = rowIdParamsSchema.parse(req.params);
    res.json({ data: await this.service.rejectRow(req.auth!.userId, rowId) });
  };
}

export const importController = new ImportController();
