import templateLabelRepository from '../repositories/templateLabel.repository.js';

class TemplateLabelController {
  async list(req, res) {
    try {
      const labels = await templateLabelRepository.findAll(req.user.id);
      return res.json({ success: true, data: labels });
    } catch (err) {
      console.error('[TemplateLabel] list error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  async create(req, res) {
    try {
      const { name, color } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: 'Tên nhãn không được để trống' });
      }
      const label = await templateLabelRepository.create({
        name: name.trim(),
        color: color || '#6366f1',
        createdBy: req.user.id,
      });
      return res.status(201).json({ success: true, data: label });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'Nhãn này đã tồn tại' });
      }
      console.error('[TemplateLabel] create error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'id không hợp lệ' });
      }
      const deleted = await templateLabelRepository.deleteById(id, req.user.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Không tìm thấy nhãn hoặc bạn không có quyền xoá' });
      return res.json({ success: true });
    } catch (err) {
      console.error('[TemplateLabel] remove error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
}

export default new TemplateLabelController();
