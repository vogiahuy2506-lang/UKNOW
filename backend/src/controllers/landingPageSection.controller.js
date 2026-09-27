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

}

export default new LandingPageSectionController();
