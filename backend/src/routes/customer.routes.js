import express from 'express';
import { body } from 'express-validator';
import customerController from '../controllers/customer.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();

// Public email tracking routes (không yêu cầu auth)
router.get('/email-tracking/open/:token', customerController.trackEmailOpen.bind(customerController));
router.get('/email-tracking/click/:token', customerController.trackEmailClick.bind(customerController));
router.get('/email-tracking/unsubscribe/:token', customerController.trackEmailUnsubscribe.bind(customerController));
router.get('/zalo-tracking/click/:token', customerController.trackZaloClick.bind(customerController));

router.use(authMiddleware);


// Get all
router.get('/', customerController.getAll.bind(customerController));
router.get(
  '/campaigns/:campaignId/zalo-group/messages',
  customerController.getCampaignZaloGroupMessages.bind(customerController),
);

// Data node: khach hang da de lai thong tin + khoa hoc
router.get('/interested-courses', customerController.getInterestedCustomersWithCourses.bind(customerController));

// Data node: khach hang tu UKNOW API
router.get('/interested-courses-from-api', customerController.getInterestedCustomersFromUknowApi.bind(customerController));

// Journey
router.get('/:id/journey', customerController.getJourney.bind(customerController));
router.get('/:id/campaign-participations', customerController.getCampaignParticipations.bind(customerController));
router.get('/:id/campaigns/:campaignId/journey', customerController.getCampaignJourneyDetail.bind(customerController));

// Get by id
router.get('/:id', customerController.getById.bind(customerController));

// Create
router.post('/',
  [
    body('email').optional().isEmail().withMessage('Email không hợp lệ'),
    body('phone').optional().trim().notEmpty(),
    body('fullName').optional().trim()
  ],
  handleValidationErrors,
  customerController.create.bind(customerController)
);

// Bulk import/update
router.post('/bulk', customerController.bulkUpsert.bind(customerController));

// Update
router.put('/:id',
  [
    body('email').optional().isEmail().withMessage('Email không hợp lệ')
  ],
  handleValidationErrors,
  customerController.update.bind(customerController)
);

// Delete
router.delete('/:id', customerController.delete.bind(customerController));

export default router;


