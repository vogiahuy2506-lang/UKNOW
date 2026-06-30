import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import * as ctrl from '../controllers/admin/notification.controller.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(authMiddleware);
router.use(requireRole('admin'));

// =====================
// CRUD Operations
// =====================

/**
 * GET /admin/notifications
 * Get all notifications with filters
 */
router.get('/', ctrl.getNotifications);

/**
 * GET /admin/notifications/types
 * Get available notification types
 */
router.get('/types', ctrl.getNotificationTypes);

/**
 * GET /admin/notifications/variables
 * Get available variables for templates
 */
router.get('/variables', ctrl.getAvailableVariables);

/**
 * GET /admin/notifications/dashboard-stats
 * Get dashboard statistics
 */
router.get('/dashboard-stats', ctrl.getDashboardStats);

/**
 * GET /admin/notifications/:id
 * Get single notification by ID
 */
router.get('/:id', ctrl.getNotificationById);

/**
 * POST /admin/notifications
 * Create a new notification (draft)
 */
router.post('/', ctrl.createNotification);

/**
 * POST /admin/notifications/preview-recipients
 * Preview recipients based on criteria
 */
router.post('/preview-recipients', ctrl.previewRecipients);

/**
 * POST /admin/notifications/preview-content
 * Preview notification content with variables
 */
router.post('/preview-content', ctrl.previewNotification);

/**
 * POST /admin/notifications/count-recipients
 * Count eligible recipients
 */
router.post('/count-recipients', ctrl.countRecipients);

/**
 * POST /admin/notifications/send-direct
 * Create and send notification immediately
 */
router.post('/send-direct', ctrl.createAndSend);

/**
 * PATCH /admin/notifications/:id
 * Update notification by ID
 */
router.patch('/:id', ctrl.updateNotification);

/**
 * DELETE /admin/notifications/:id
 * Delete notification by ID
 */
router.delete('/:id', ctrl.deleteNotification);

/**
 * POST /admin/notifications/:id/send
 * Send notification immediately
 */
router.post('/:id/send', ctrl.sendNotification);

/**
 * POST /admin/notifications/:id/schedule
 * Schedule notification for later
 */
router.post('/:id/schedule', ctrl.scheduleNotification);

/**
 * POST /admin/notifications/:id/cancel
 * Cancel scheduled notification
 */
router.post('/:id/cancel', ctrl.cancelScheduled);

/**
 * GET /admin/notifications/:id/stats
 * Get notification statistics
 */
router.get('/:id/stats', ctrl.getNotificationStats);

/**
 * GET /admin/notifications/:id/logs
 * Get email logs for notification
 */
router.get('/:id/logs', ctrl.getEmailLogs);

export default router;
