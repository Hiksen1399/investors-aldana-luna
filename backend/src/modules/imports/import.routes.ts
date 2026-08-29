import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { importController } from './import.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = /\.(eml|pdf|csv|txt)$/i.test(file.originalname) || ['message/rfc822', 'application/pdf', 'text/csv', 'text/plain', 'application/csv'].includes(file.mimetype);
    if (allowed) callback(null, true);
    else callback(new Error('Formato de importación no compatible.'));
  },
});

const router = Router();
router.post('/inbound/email', importController.inbound);
router.get('/outlook/callback', importController.outlookCallback);
router.use(authenticate);
router.get('/', importController.list);
router.post('/files', upload.single('file'), importController.upload);
router.get('/outlook/status', importController.outlookStatus);
router.post('/outlook/connect', importController.outlookConnect);
router.post('/outlook/sync', importController.outlookSync);
router.delete('/outlook', importController.outlookDisconnect);
router.get('/xtb-password/status', importController.xtbPasswordStatus);
router.put('/xtb-password', importController.xtbPasswordSave);
router.delete('/xtb-password/:accountId', importController.xtbPasswordRemove);
router.get('/forwarding-address', importController.forwardingAddress);
router.get('/:id', importController.get);
router.get('/:id/rows', importController.rows);
router.post('/:id/confirm', importController.confirm);
router.post('/:id/retry', importController.retry);

export { router as importRouter };

export const importRowRouter = Router();
importRowRouter.use(authenticate);
importRowRouter.patch('/:rowId', importController.reviewRow);
importRowRouter.post('/:rowId/approve', importController.approveRow);
importRowRouter.post('/:rowId/reject', importController.rejectRow);
