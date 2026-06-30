import landingPageSectionService from '../services/landingPageSection.service.js';

class LandingPageSectionController {
  async list(req, res) {
    try {
      const sections = await landingPageSectionService.getAllSections();
      return res.json({ success: true, data: sections });
    } catch (error) {
      console.error('[LandingPageSectionController.list]', error);
      return res.status(500).json({
        success: false,
        message: 'Khong the tai danh sach sections',
      });
    }
  }

  async getByPage(req, res) {
    try {
      const { page } = req.params;
      const sections = await landingPageSectionService.getSectionsByPage(page);
      return res.json({ success: true, data: sections });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageSectionController.getByPage]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Khong the tai sections',
      });
    }
  }

  async getByPageAndSection(req, res) {
    try {
      const { page, section } = req.params;
      const sectionData = await landingPageSectionService.getSectionByPageAndSection(page, section);
      return res.json({ success: true, data: sectionData });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageSectionController.getByPageAndSection]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Khong the tai section',
      });
    }
  }

  async create(req, res) {
    try {
      const section = await landingPageSectionService.createSection(req.body || {});
      return res.status(201).json({ success: true, data: section });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageSectionController.create]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Khong the tao section',
      });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const section = await landingPageSectionService.updateSection(id, req.body || {});
      return res.json({ success: true, data: section });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageSectionController.update]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Khong the cap nhat section',
      });
    }
  }

  async upsertByPageAndSection(req, res) {
    try {
      const { page, section } = req.params;
      const result = await landingPageSectionService.upsertByPageAndSection(page, section, req.body || {});
      return res.json({ success: true, data: result });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageSectionController.upsertByPageAndSection]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Khong the luu section',
      });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;
      await landingPageSectionService.deleteSection(id);
      return res.json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageSectionController.delete]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Khong the xoa section',
      });
    }
  }

  async deleteByPageAndSection(req, res) {
    try {
      const { page, section } = req.params;
      await landingPageSectionService.deleteByPageAndSection(page, section);
      return res.json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageSectionController.deleteByPageAndSection]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Khong the xoa section',
      });
    }
  }
}

export default new LandingPageSectionController();
