import express from 'express';
import { body } from 'express-validator';
import customerController from '../controllers/customer.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { requirePermission, requireActivePlan, requirePasswordChange, requirePhone } from '../middleware/authorization.middleware.js';

const router = express.Router();

// Public email tracking routes (không yêu cầu auth)
router.get('/email-tracking/open/:token', customerController.trackEmailOpen.bind(customerController));
router.get('/email-tracking/click/:token', customerController.trackEmailClick.bind(customerController));
router.get('/email-tracking/unsubscribe/:token', customerController.trackEmailUnsubscribe.bind(customerController));
router.get('/zalo-tracking/click/:token', customerController.trackZaloClick.bind(customerController));

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);
router.use(requirePermission('customers'));

// Get all
router.get('/', customerController.getAll.bind(customerController));
router.get(
  '/campaigns/:campaignId/zalo-group/messages',
  customerController.getCampaignZaloGroupMessages.bind(customerController),
);

// Data node: khach hang da de lai thong tin + khoa hoc
router.get('/interested-courses', customerController.getInterestedCustomersWithCourses.bind(customerController));

// Data node: khach hang tu Founder AI API
router.get('/interested-courses-from-api', customerController.getInterestedCustomersFromUknowApi.bind(customerController));

// Journey
router.get('/:id/journey', customerController.getJourney.bind(customerController));
router.get('/:id/campaign-participations', customerController.getCampaignParticipations.bind(customerController));
router.get('/:id/campaigns/:campaignId/journey', customerController.getCampaignJourneyDetail.bind(customerController));

// Get by id — chỉ cần auth
router.get('/:id', customerController.getById.bind(customerController));

// Create — cần quyền customers
router.post('/',
  requirePermission('customers'),
  [
    body('email').optional().isEmail().withMessage('Email không hợp lệ'),
    body('phone').optional().trim().notEmpty(),
    body('fullName').optional().trim()
  ],
  handleValidationErrors,
  customerController.create.bind(customerController)
);

// Bulk import/update — cần quyền customers
router.post('/bulk', requirePermission('customers'), customerController.bulkUpsert.bind(customerController));

// Update — cần quyền customers
router.put('/:id',
  requirePermission('customers'),
  [
    body('email').optional().isEmail().withMessage('Email không hợp lệ')
  ],
  handleValidationErrors,
  customerController.update.bind(customerController)
);

// Delete — cần quyền customers
router.delete('/:id', requirePermission('customers'), customerController.delete.bind(customerController));

export default router;


