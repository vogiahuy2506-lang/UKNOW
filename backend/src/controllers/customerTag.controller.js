import customerTagService from '../services/customer/customerTag.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';

function sendError(res, error, label) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error(`${label}:`, error);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
}

/** HTTP cho tag khách hàng. Phạm vi luôn là workspace của người gọi (không nhận owner id từ client). */
class CustomerTagController {
  async list(req, res) {
    try {
      const { workspaceOwnerId } = getWorkspaceContext(req.user);
      const data = await customerTagService.listTags(workspaceOwnerId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error, 'List customer tags error');
    }
  }

  async create(req, res) {
    try {
      const { workspaceOwnerId } = getWorkspaceContext(req.user);
      const data = await customerTagService.createTag(workspaceOwnerId, req.body || {});
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendError(res, error, 'Create customer tag error');
    }
  }

  async update(req, res) {
    try {
      const { workspaceOwnerId } = getWorkspaceContext(req.user);
      const data = await customerTagService.updateTag(workspaceOwnerId, Number(req.params.tagId), req.body || {});
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error, 'Update customer tag error');
    }
  }

  async remove(req, res) {
    try {
      const { workspaceOwnerId } = getWorkspaceContext(req.user);
      const data = await customerTagService.deleteTag(workspaceOwnerId, Number(req.params.tagId));
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error, 'Delete customer tag error');
    }
  }

  async assign(req, res) {
    try {
      const { workspaceOwnerId, actorUserId } = getWorkspaceContext(req.user);
      const { customerIds, tagIds, tagNames } = req.body || {};
      const data = await customerTagService.assignTags(workspaceOwnerId, {
        customerIds,
        tagIds,
        tagNames,
        actorUserId,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error, 'Assign customer tags error');
    }
  }

  async unassign(req, res) {
    try {
      const { workspaceOwnerId } = getWorkspaceContext(req.user);
      const { customerIds, tagIds } = req.body || {};
      const data = await customerTagService.unassignTags(workspaceOwnerId, { customerIds, tagIds });
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error, 'Unassign customer tags error');
    }
  }

  async listForCustomer(req, res) {
    try {
      const { workspaceOwnerId } = getWorkspaceContext(req.user);
      const data = await customerTagService.getCustomerTags(workspaceOwnerId, req.params.id);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error, 'Get customer tags error');
    }
  }
}

export default new CustomerTagController();
