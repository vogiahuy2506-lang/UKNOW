import { useState, useEffect, useMemo, useCallback } from 'react';
import { FaUsers, FaSearch, FaTimes, FaCheck, FaEnvelope } from 'react-icons/fa';
import { HiOutlineUserGroup } from 'react-icons/hi';
import adminNotificationApiService from '../services/adminNotificationApi.service';
import { useI18n } from '../../../i18n';

// Mã gói THẬT (plans.code): trial/starter/basic/professional/enterprise. Bảng này chỉ cấp màu + nhãn dự phòng cho huy hiệu;
// danh sách lọc lấy từ chính các gói có trong người dùng đã tải (gói riêng/gói mới cũng lọc được).
const PLANS = [
  { value: 'trial', label: 'Trial', color: 'gray' },
  { value: 'starter', label: 'Starter', color: 'blue' },
  { value: 'basic', label: 'Basic', color: 'green' },
  { value: 'professional', label: 'Professional', color: 'purple' },
  { value: 'enterprise', label: 'Enterprise', color: 'orange' }
];

// Giới hạn chip "Người dùng đã chọn": chọn hàng trăm người thì chỉ in 20 chip đầu + "+N người khác".
const MAX_SELECTED_CHIPS = 20;

// /admin/members trả camelCase (fullName, planCode, planName); giữ nhánh snake_case làm dự phòng.
const userName = (u) => u.fullName ?? u.full_name;
const userPlanCode = (u) => u.planCode ?? u.plan_code ?? u.plan ?? null;
const userPlanName = (u) => u.planName ?? u.plan_name ?? null;

const STATUSES = [
  { value: 'active', label: 'Hoạt động', color: 'green' },
  { value: 'inactive', label: 'Không hoạt động', color: 'gray' },
  { value: 'suspended', label: 'Bị khóa', color: 'red' }
];

export default function TargetingPanel({ criteria, onChange, onCountChange }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState(criteria?.user_ids || []);
  
  // Filters
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchAllUsers = async () => {
      setLoadingUsers(true);
      try {
        const response = await adminNotificationApiService.getAllUsers();
        if (!cancelled && response.data?.success) {
          setAllUsers(response.data.data || []);
        }
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    };
    fetchAllUsers();
    return () => { cancelled = true; };
  }, []);

  const fetchRecipientCount = useCallback(async () => {
    if (selectedUserIds.length === 0) {
      onCountChange?.(null);
      return;
    }

    setLoading(true);
    try {
      const response = await adminNotificationApiService.countRecipients({
        user_ids: selectedUserIds
      });
      onCountChange?.(response.data?.data?.count || 0);
    } catch (error) {
      console.error('Error counting recipients:', error);
      onCountChange?.(selectedUserIds.length);
    } finally {
      setLoading(false);
    }
  }, [selectedUserIds, onCountChange]);

  useEffect(() => {
    if (onCountChange) {
      fetchRecipientCount();
    }
  }, [onCountChange, fetchRecipientCount]);

  const updateCriteria = (updates) => {
    onChange?.({ ...criteria, ...updates });
  };

  const toggleUserSelection = (userId) => {
    const updated = selectedUserIds.includes(userId)
      ? selectedUserIds.filter(id => id !== userId)
      : [...selectedUserIds, userId];
    setSelectedUserIds(updated);
    updateCriteria({ user_ids: updated });
  };

  const selectAllFiltered = () => {
    const filteredIds = filteredUsers.map(u => u.id);
    const allSelected = filteredIds.every(id => selectedUserIds.includes(id));
    if (allSelected) {
      const updated = selectedUserIds.filter(id => !filteredIds.includes(id));
      setSelectedUserIds(updated);
      updateCriteria({ user_ids: updated });
    } else {
      const updated = [...new Set([...selectedUserIds, ...filteredIds])];
      setSelectedUserIds(updated);
      updateCriteria({ user_ids: updated });
    }
  };

  const selectAllUsers = () => {
    const updated = [...new Set([...selectedUserIds, ...allUsers.map(u => u.id)])];
    setSelectedUserIds(updated);
    updateCriteria({ user_ids: updated });
  };

  const clearUserSelection = () => {
    setSelectedUserIds([]);
    updateCriteria({ user_ids: [] });
  };

  const filteredUsers = useMemo(() => {
    return allUsers.filter(user => {
      const matchesSearch = !searchTerm || 
        userName(user)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesPlan = !filterPlan || userPlanCode(user) === filterPlan;
      const matchesStatus = !filterStatus || user.status === filterStatus;
      
      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [allUsers, searchTerm, filterPlan, filterStatus]);

  const userById = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  // Danh sách gói để lọc = các plan_code CÓ THẬT trong người dùng đã tải; nhãn lấy tên gói từ API, không có thì dùng mã.
  const planOptions = useMemo(() => {
    const byCode = new Map();
    for (const user of allUsers) {
      const code = userPlanCode(user);
      if (!code || byCode.has(code)) continue;
      byCode.set(code, userPlanName(user) || code);
    }
    return [...byCode.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allUsers]);

  const planLabelByCode = useMemo(() => new Map(planOptions.map(o => [o.value, o.label])), [planOptions]);

  const hasActiveFilter = Boolean(searchTerm.trim() || filterPlan || filterStatus);
  const allUsersSelected = allUsers.length > 0 && allUsers.every(u => selectedSet.has(u.id));
  const filteredAllSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedSet.has(u.id));

  const getPlanBadge = (planCode) => {
    if (!planCode) return null;
    const planConfig = PLANS.find(p => p.value === planCode);

    const colors = {
      green: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
      gray: 'bg-gray-100 text-gray-700 dark:bg-dk-raised dark:text-dk-text',
      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
      purple: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
      orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
    };
    
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[planConfig?.color] || colors.gray}`}>
        {planLabelByCode.get(planCode) || planConfig?.label || planCode}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const statusConfig = STATUSES.find(s => s.value === status);
    if (!statusConfig) return null;
    
    const colors = {
      green: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
      gray: 'bg-gray-100 text-gray-600 dark:bg-dk-raised dark:text-dk-text2',
      red: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
    };
    
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[statusConfig.color]}`}>
        {t(`notificationCenter.targeting.statusesList.${statusConfig.value}`, statusConfig.label)}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Recipient Preview */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/40 rounded-xl flex items-center justify-center">
              <FaUsers className="text-orange-600 dark:text-orange-400 text-xl" />
            </div>
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">
                {t('notificationCenter.targeting.recipientCount', 'Số lượng người nhận')}
              </p>
              {loading ? (
                <p className="text-lg text-orange-900 dark:text-orange-100 font-bold">
                  {t('notificationCenter.targeting.calculating', 'Đang tính...')}
                </p>
              ) : selectedUserIds.length === 0 ? (
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  {t('notificationCenter.targeting.selectUsersHint', 'Chọn người dùng để gửi thông báo')}
                </p>
              ) : (
                <p className="text-lg text-orange-900 dark:text-orange-100 font-bold">
                  {t('notificationCenter.targeting.userCount', { count: selectedUserIds.length })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bộ chọn người dùng: luôn hiện (đã nằm trong tab "Đối tượng" của modal Cài đặt) */}
      <div className="bg-white dark:bg-dk-surface border border-gray-200 dark:border-dk-border rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 bg-gray-50 dark:bg-dk-raised border-b border-gray-200 dark:border-dk-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HiOutlineUserGroup className="w-5 h-5 text-gray-600 dark:text-dk-text2" />
              <h4 className="font-semibold text-gray-900 dark:text-dk-text">
                {t('notificationCenter.targeting.userList', 'Danh sách người dùng')}
              </h4>
              <span className="text-sm text-gray-500 dark:text-dk-text2">
                {t('notificationCenter.targeting.resultsCount', { count: filteredUsers.length })}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {allUsersSelected ? (
                <button
                  type="button"
                  onClick={clearUserSelection}
                  className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                >
                  {t('notificationCenter.targeting.deselectAll')}
                </button>
              ) : (
                <>
                  {selectedUserIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearUserSelection}
                      className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    >
                      {t('notificationCenter.targeting.deselectAll')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={selectAllUsers}
                    disabled={allUsers.length === 0}
                    className="px-3 py-1.5 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('notificationCenter.targeting.selectAllUsers', { count: allUsers.length })}
                  </button>
                </>
              )}
              {hasActiveFilter && filteredUsers.length > 0 && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-3 py-1.5 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-lg transition-colors"
                >
                  {filteredAllSelected
                    ? t('notificationCenter.targeting.deselectFiltered', { count: filteredUsers.length })
                    : t('notificationCenter.targeting.selectFiltered', { count: filteredUsers.length })}
                </button>
              )}
            </div>
          </div>
          
          {/* Search */}
          <div className="relative mb-4">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-dk-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('notificationCenter.targeting.searchPlaceholder', 'Tìm kiếm theo tên, email, username...')}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text rounded-xl focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/40 focus:border-orange-400 transition-all"
            />
          </div>
          
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text rounded-lg hover:border-orange-300 dark:hover:border-orange-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-800 transition-all"
            >
              <option value="">{t('notificationCenter.targeting.allPlans', 'Tất cả gói')}</option>
              {planOptions.map(plan => (
                <option key={plan.value} value={plan.value}>{plan.label}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text rounded-lg hover:border-orange-300 dark:hover:border-orange-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-800 transition-all"
            >
              <option value="">{t('notificationCenter.targeting.allStatuses', 'Tất cả trạng thái')}</option>
              {STATUSES.map(status => (
                <option key={status.value} value={status.value}>
                  {t(`notificationCenter.targeting.statusesList.${status.value}`, status.label)}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* User List */}
        <div className="max-h-80 overflow-y-auto">
          {loadingUsers ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-2 text-gray-500 dark:text-dk-text2 text-sm">
                {t('common.loading', 'Đang tải danh sách...')}
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <FaUsers className="w-12 h-12 text-gray-300 dark:text-dk-muted mx-auto" />
              <p className="mt-2 text-gray-500 dark:text-dk-text2">
                {t('common.noData', 'Không tìm thấy người dùng')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-dk-border">
              {filteredUsers.map(user => {
                const isSelected = selectedSet.has(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => toggleUserSelection(user.id)}
                    className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-orange-50/50 dark:hover:bg-dk-raised transition-colors ${
                      isSelected ? 'bg-orange-50 dark:bg-orange-950/30' : ''
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      isSelected 
                        ? 'bg-orange-500 border-orange-500' 
                        : 'border-gray-300 dark:border-dk-border-strong'
                    }`}>
                      {isSelected && <FaCheck className="w-4 h-4 text-white" />}
                    </div>
                    
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center text-white font-bold">
                      {userName(user)?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-dk-text truncate">
                          {userName(user) || user.username}
                        </p>
                        {getPlanBadge(userPlanCode(user))}
                        {getStatusBadge(user.status)}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-dk-text2 truncate flex items-center gap-1">
                        <FaEnvelope className="w-3 h-3" />
                        {user.email}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-xs text-gray-400 dark:text-dk-muted capitalize">{user.role}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-dk-raised border-t border-gray-200 dark:border-dk-border">
          <p className="text-sm text-gray-600 dark:text-dk-text">
            {t('common.selected')}:{' '}
            <span className="font-semibold text-orange-600 dark:text-orange-400">
              {t('notificationCenter.targeting.userCount', { count: selectedUserIds.length })}
            </span>
          </p>
        </div>
      </div>

      {/* Selected Users Tags */}
      {selectedUserIds.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-dk-text mb-2">
            {t('notificationCenter.targeting.selectedUsersLabel', 'Người dùng đã chọn')}
          </label>
          <div className="flex flex-wrap gap-2">
            {selectedUserIds.slice(0, MAX_SELECTED_CHIPS).map(id => {
              const user = userById.get(id);
              if (!user) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/40 rounded-xl text-sm"
                >
                  <span className="w-5 h-5 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {userName(user)?.[0]?.toUpperCase() || 'U'}
                  </span>
                  {userName(user) || user.email}
                  <button
                    type="button"
                    onClick={() => toggleUserSelection(id)}
                    aria-label={`${t('notificationCenter.targeting.deselectUser')} ${userName(user) || user.email}`}
                    className="hover:text-orange-900 dark:hover:text-orange-100"
                  >
                    <FaTimes className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            {selectedUserIds.length > MAX_SELECTED_CHIPS && (
              <span className="inline-flex items-center px-3 py-1.5 text-sm text-gray-500 dark:text-dk-text2">
                {t('notificationCenter.targeting.moreSelected', { count: selectedUserIds.length - MAX_SELECTED_CHIPS })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { PLANS, STATUSES };
