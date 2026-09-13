import api from '../../../services/api';

export const ADMIN_MENU_LAYOUT_UPDATED_EVENT = 'founder-admin-menu-layout-updated';

const adminMenuApiService = {
  getLayout() {
    return api.get('/admin/menu-layout');
  },
  updateLayout(categories) {
    return api.put('/admin/menu-layout', { categories });
  },
  getAppLayout() {
    return api.get('/admin/menu-layout/app');
  },
  updateAppLayout(categories) {
    return api.put('/admin/menu-layout/app', { categories });
  },
  getUserAppMenuLayout() {
    return api.get('/users/app-menu-layout');
  },
};

export default adminMenuApiService;
