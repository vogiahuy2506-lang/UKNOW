import {
  getPendingScheduledChange,
} from '../services/payment/scheduledPlanChange.service.js';

export const getScheduledPlanChange = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const scheduledChange = await getPendingScheduledChange(userId);
    res.json({ success: true, scheduledChange });
  } catch (err) {
    next(err);
  }
};
