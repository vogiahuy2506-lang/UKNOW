import api from '../../../services/api';

export const ADMIN_MENU_LAYOUT_UPDATED_EVENT = 'founder-admin-menu-layout-updated';

const adminMenuApiService = {
  getLayout() {
    return api.get('/admin/menu-layout');
  },
  updateLayout(categories) {
    return api.put('/admin/menu-layout', { categories });
  },
};

export default adminMenuApiService;
