import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDocument,
  HiOutlineDocumentText,
  HiOutlinePlay,
} from 'react-icons/hi';
import campaignBuilderApiService from '../services/campaignBuilderApi.service';

/**
 * Section UI cho node lấy danh sách bạn bè Zalo.
 *
 * @param {Object} props section props
 * @returns {JSX.Element}
 */
export const NodeConfigGetAllFriendsSection = ({
  formData,
  setFormData,
  upstreamNodes = [],
}) => {
  /**
   * Resolve friend id from normalized/raw preview item.
   *
   * @param {any} item
   * @returns {string}
   */
  const resolveFriendId = (item) => String(
    item?.uid
    || item?.id
    || item?.userId
    || item?.zaloUserId
    || item?.raw?.uid
    || item?.raw?.id
    || item?.raw?.userId
    || item?.raw?.zaloUserId
    || ''
  ).trim();

  /**
   * Resolve friend display name from normalized/raw preview item.
   *
   * @param {any} item
   * @returns {string}
   */
  const resolveFriendName = (item) => String(
    item?.display_name
    || item?.displayName
    || item?.zalo_name
    || item?.zaloName
    || item?.name
    || item?.raw?.display_name
    || item?.raw?.displayName
    || item?.raw?.zalo_name
    || item?.raw?.zaloName
    || item?.raw?.name
    || ''
  ).trim();

  /**
   * Resolve friend phone from normalized/raw preview item.
   *
   * @param {any} item
   * @returns {string}
   */
  const resolveFriendPhone = (item) => String(
    item?.phoneNumber
    || item?.phone
    || item?.zaloPhone
    || item?.zalo_phone
    || item?.raw?.phoneNumber
    || item?.raw?.phone
    || item?.raw?.zaloPhone
    || item?.raw?.zalo_phone
    || ''
  ).trim();

  const [selectedSection, setSelectedSection] = useState('basic');
  const [previewItems, setPreviewItems] = useState([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastAutoLoadedAccountId, setLastAutoLoadedAccountId] = useState('');

  const selectedFriendIds = (Array.isArray(formData.zaloSelectedFriendIds) ? formData.zaloSelectedFriendIds : [])
    .map((value) => String(value || '').trim())
    .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
  const excludedFriendIds = (Array.isArray(formData.zaloExcludedFriendIds) ? formData.zaloExcludedFriendIds : [])
    .map((value) => String(value || '').trim())
    .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
  const friendSelectionMode = (() => {
    const explicitMode = String(formData.zaloFriendSelectionMode || '').trim().toLowerCase();
    if (explicitMode === 'fixed' || explicitMode === 'all_exclude') return explicitMode;
    return selectedFriendIds.length > 0 ? 'fixed' : 'all';
  })();

  const accountSourceNodes = useMemo(() => {
    const sourceNodes = Array.isArray(upstreamNodes) ? upstreamNodes : [];
    return sourceNodes
      .filter((node) => {
        const nodeType = node?.data?.nodeType || node?.type;
        return nodeType === 'select_zalo_account';
      })
      .map((node) => ({
        nodeId: String(node?.id || '').trim(),
        nodeName: String(node?.data?.label || '').trim() || `Node ${String(node?.id || '').trim()}`,
        accountId: String(node?.data?.config?.zaloAccountId || '').trim(),
      }))
      .filter((item) => item.nodeId);
  }, [upstreamNodes]);

  const selectedAccountSourceNodeId = String(formData.zaloFriendAccountNodeId || '').trim();
  const selectedAccountSourceNode = accountSourceNodes.find((item) => item.nodeId === selectedAccountSourceNodeId) || null;
  const fallbackAccountSourceNode = accountSourceNodes[accountSourceNodes.length - 1] || null;

  const resolvePreviewAccountId = () => String(
    selectedAccountSourceNode?.accountId
    || fallbackAccountSourceNode?.accountId
    || formData.zaloAccountId
    || ''
  ).trim();

  useEffect(() => {
    if (accountSourceNodes.length === 0) return;
    const currentSourceNodeId = String(formData.zaloFriendAccountNodeId || '').trim();
    const isCurrentValid = currentSourceNodeId
      && accountSourceNodes.some((item) => item.nodeId === currentSourceNodeId);
    if (isCurrentValid) return;

    const defaultSource = accountSourceNodes[accountSourceNodes.length - 1];
    setFormData((prev) => ({
      ...prev,
      zaloFriendAccountNodeId: defaultSource.nodeId,
      zaloAccountId: defaultSource.accountId || prev.zaloAccountId || '',
    }));
  }, [accountSourceNodes, formData.zaloFriendAccountNodeId, setFormData]);

  const toggleFriend = (friendId) => {
    const normalizedFriendId = String(friendId || '').trim();
    if (!normalizedFriendId) return;
    setFormData((prev) => {
      const currentSelected = (Array.isArray(prev.zaloSelectedFriendIds) ? prev.zaloSelectedFriendIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const currentExcluded = (Array.isArray(prev.zaloExcludedFriendIds) ? prev.zaloExcludedFriendIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const mode = String(prev.zaloFriendSelectionMode || '').trim().toLowerCase() || 'all';
      if (mode === 'fixed') {
        const nextSelected = currentSelected.includes(normalizedFriendId)
          ? currentSelected.filter((value) => value !== normalizedFriendId)
          : [...currentSelected, normalizedFriendId];
        return { ...prev, zaloSelectedFriendIds: nextSelected };
      }
      if (mode === 'all_exclude') {
        const nextExcluded = currentExcluded.includes(normalizedFriendId)
          ? currentExcluded.filter((value) => value !== normalizedFriendId)
          : [...currentExcluded, normalizedFriendId];
        return { ...prev, zaloExcludedFriendIds: nextExcluded };
      }
      return prev;
    });
  };

  const filteredPreviewItems = previewItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      resolveFriendName(item).toLowerCase().includes(q)
      || resolveFriendPhone(item).toLowerCase().includes(q)
      || resolveFriendId(item).toLowerCase().includes(q)
    );
  });

  const allFilteredIds = filteredPreviewItems
    .map((item) => resolveFriendId(item))
    .filter(Boolean);
  const activeFriendIds = friendSelectionMode === 'fixed' ? selectedFriendIds : excludedFriendIds;
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => activeFriendIds.includes(id));

  const toggleAllFiltered = () => {
    if (friendSelectionMode === 'all') return;
    setFormData((prev) => {
      const currentSelected = (Array.isArray(prev.zaloSelectedFriendIds) ? prev.zaloSelectedFriendIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const currentExcluded = (Array.isArray(prev.zaloExcludedFriendIds) ? prev.zaloExcludedFriendIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const mode = String(prev.zaloFriendSelectionMode || '').trim().toLowerCase() || 'all';
      if (mode === 'fixed') {
        const nextSelected = allSelected
          ? currentSelected.filter((id) => !allFilteredIds.includes(id))
          : Array.from(new Set([...currentSelected, ...allFilteredIds]));
        return { ...prev, zaloSelectedFriendIds: nextSelected };
      }
      if (mode === 'all_exclude') {
        const nextExcluded = allSelected
          ? currentExcluded.filter((id) => !allFilteredIds.includes(id))
          : Array.from(new Set([...currentExcluded, ...allFilteredIds]));
        return { ...prev, zaloExcludedFriendIds: nextExcluded };
      }
      return prev;
    });
  };

  const handleLoadPreview = async () => {
    const accountId = resolvePreviewAccountId();
    if (!accountId) {
      toast.error('Chưa có tài khoản Zalo để tải danh sách bạn bè. Vui lòng cấu hình node "Chọn tài khoản Zalo" trước.');
      return;
    }
    try {
      setIsLoadingPreview(true);
      setPreviewItems([]);
      const count = Number.isFinite(parseInt(formData.zaloFriendsCount, 10))
        ? parseInt(formData.zaloFriendsCount, 10)
        : 200;
      const page = Number.isFinite(parseInt(formData.zaloFriendsPage, 10))
        ? parseInt(formData.zaloFriendsPage, 10)
        : 1;
      const response = await campaignBuilderApiService.getPreviewZaloFriends({
        accountId,
        count,
        page,
      });
      const items = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
      setPreviewItems(items);
      toast.success(`Đã tải ${items.length} bạn bè Zalo`);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Không thể tải danh sách bạn bè Zalo';
      toast.error(message);
      setPreviewItems([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (selectedSection !== 'select') return;
    if (isLoadingPreview) return;
    if (previewItems.length > 0) return;

    const accountId = resolvePreviewAccountId();
    if (!accountId) return;
    if (lastAutoLoadedAccountId === accountId) return;

    setLastAutoLoadedAccountId(accountId);
    handleLoadPreview();
  }, [
    formData.zaloAccountId,
    formData.zaloFriendsCount,
    formData.zaloFriendsPage,
    isLoadingPreview,
    lastAutoLoadedAccountId,
    previewItems.length,
    selectedAccountSourceNodeId,
    selectedSection,
  ]);

  const sections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineDocument },
    {
      id: 'select',
      name: 'Lựa chọn bạn bè',
      icon: HiOutlinePlay,
      badge: selectedFriendIds.length > 0,
      badgeLabel: selectedFriendIds.length,
    },
  ];

  const renderBasicSection = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder="Lấy danh sách bạn bè Zalo"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng mỗi trang</label>
          <input
            type="number"
            min={1}
            max={20000}
            value={formData.zaloFriendsCount || 200}
            onChange={(e) => setFormData((prev) => ({ ...prev, zaloFriendsCount: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Trang</label>
          <input
            type="number"
            min={1}
            value={formData.zaloFriendsPage || 1}
            onChange={(e) => setFormData((prev) => ({ ...prev, zaloFriendsPage: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Node nguồn tài khoản Zalo</label>
        {accountSourceNodes.length > 0 ? (
          <select
            value={selectedAccountSourceNodeId}
            onChange={(e) => {
              const nextNodeId = String(e.target.value || '').trim();
              const nextNode = accountSourceNodes.find((item) => item.nodeId === nextNodeId) || null;
              setFormData((prev) => ({
                ...prev,
                zaloFriendAccountNodeId: nextNodeId,
                zaloAccountId: nextNode?.accountId || prev.zaloAccountId || '',
              }));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            {accountSourceNodes.map((item) => (
              <option key={item.nodeId} value={item.nodeId}>
                {item.nodeName}
                {item.accountId ? ` (ID ${item.accountId})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="px-3 py-2 border border-dashed border-amber-300 rounded-lg bg-amber-50 text-amber-700 text-sm">
            Chưa có node <strong>Chọn tài khoản Zalo</strong> ở phía trước. Vui lòng thêm node này trước khi tải dữ liệu thử.
          </div>
        )}
      </div>

      <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
        <strong>Tài khoản dùng để tải thử:</strong>{' '}
        {resolvePreviewAccountId()
          ? `ID ${resolvePreviewAccountId()}${selectedAccountSourceNode?.nodeName ? ` · từ node "${selectedAccountSourceNode.nodeName}"` : ''}`
          : 'Chưa xác định từ flow hiện tại'}
      </div>
    </div>
  );

  const renderSelectSection = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleLoadPreview}
          disabled={isLoadingPreview}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isLoadingPreview
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {isLoadingPreview ? 'Đang tải...' : previewItems.length > 0 ? 'Tải lại' : 'Tải dữ liệu thử'}
        </button>
        {previewItems.length > 0 && (
          <span className="text-sm text-gray-500">
            {previewItems.length} bạn bè
            {friendSelectionMode === 'fixed' && (
              <>
                {' '}· đã chọn <strong className="text-primary-700">{selectedFriendIds.length}</strong>
              </>
            )}
            {friendSelectionMode === 'all_exclude' && (
              <>
                {' '}· đã loại trừ <strong className="text-red-600">{excludedFriendIds.length}</strong>
              </>
            )}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {[
          { value: 'all', label: 'Tất cả', desc: 'Mặc định lấy toàn bộ, continuous sẽ cập nhật khách mới.' },
          { value: 'fixed', label: 'Cố định', desc: 'Chỉ chạy danh sách đã chọn, không nhận khách mới ngoài danh sách.' },
          { value: 'all_exclude', label: 'Tất cả trừ', desc: 'Lấy tất cả nhưng loại trừ những người đã tick.' },
        ].map((option) => (
          <label
            key={option.value}
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              friendSelectionMode === option.value
                ? 'bg-primary-50 border-primary-400'
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <input
                type="radio"
                name="zaloFriendSelectionMode"
                className="mt-0.5 text-primary-600 focus:ring-primary-500"
                checked={friendSelectionMode === option.value}
                onChange={() => {
                  setFormData((prev) => ({
                    ...prev,
                    zaloFriendSelectionMode: option.value,
                    ...(option.value === 'all'
                      ? { zaloSelectedFriendIds: [], zaloExcludedFriendIds: [] }
                      : option.value === 'fixed'
                        ? { zaloExcludedFriendIds: [] }
                        : { zaloSelectedFriendIds: [] }),
                  }));
                }}
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{option.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{option.desc}</p>
              </div>
            </div>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Nhấn để lấy danh sách bạn bè theo tài khoản Zalo đã chọn. Kết quả chỉ để cấu hình và xem trước.
      </p>

      {isLoadingPreview ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Đang tải danh sách bạn bè...</p>
        </div>
      ) : previewItems.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
          <HiOutlineDocumentText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Chưa có dữ liệu</p>
          <p className="text-xs text-gray-400 mt-1">Nhấn "Tải dữ liệu thử" để xem trước và tích chọn bạn bè</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Tìm theo tên, số điện thoại hoặc uid..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={toggleAllFiltered}
              disabled={friendSelectionMode === 'all'}
              className="px-3 py-2 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors whitespace-nowrap"
            >
              {friendSelectionMode === 'all'
                ? 'Đang lấy tất cả'
                : allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {filteredPreviewItems.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-500">Không tìm thấy bạn bè phù hợp</p>
                </div>
              ) : (
                filteredPreviewItems.map((item, idx) => {
                  const friendId = resolveFriendId(item);
                  const displayName = resolveFriendName(item);
                  const phoneNumber = resolveFriendPhone(item);
                  const checked = friendId && activeFriendIds.includes(friendId);
                  return (
                    <label
                      key={`${friendId || 'friend'}-${idx}`}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                        checked ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={!!checked}
                        onChange={() => toggleFriend(friendId)}
                        disabled={!friendId || friendSelectionMode === 'all'}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {displayName || '(Chưa có tên hiển thị)'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          uid: {friendId || '(không xác định)'}
                          {phoneNumber ? ` · ${phoneNumber}` : ''}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {friendSelectionMode !== 'all' && activeFriendIds.length > 0 && (
            <div className="mt-2 p-2 bg-primary-50 rounded-lg flex items-center justify-between">
              <p className={`text-xs ${friendSelectionMode === 'all_exclude' ? 'text-red-700' : 'text-primary-700'}`}>
                {friendSelectionMode === 'fixed'
                  ? <>Đã chọn <strong>{selectedFriendIds.length}</strong> bạn bè. Khi chạy node sẽ chỉ lấy các bạn bè đã chọn.</>
                  : <>Đã loại trừ <strong>{excludedFriendIds.length}</strong> bạn bè. Continuous vẫn lấy khách mới nhưng bỏ qua các bạn đã loại trừ.</>}
              </p>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({
                  ...prev,
                  ...(friendSelectionMode === 'fixed'
                    ? { zaloSelectedFriendIds: [] }
                    : { zaloExcludedFriendIds: [] }),
                }))}
                className="text-xs text-gray-500 hover:text-red-500 ml-3 flex-shrink-0"
              >
                Xóa chọn
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-green-50 p-3 rounded-lg">
        <p className="text-sm text-green-700">
          <strong>Lưu ý:</strong>{' '}
          {friendSelectionMode === 'all'
            ? 'Đang ở chế độ lấy tất cả (mặc định). Continuous sẽ tự lấy thêm bạn bè mới theo chu kỳ.'
            : friendSelectionMode === 'fixed'
              ? 'Đang ở chế độ cố định. Chỉ những bạn bè đã tích mới đi vào luồng.'
              : 'Đang ở chế độ tất cả trừ. Continuous sẽ lấy thêm bạn mới, trừ những bạn đã tích loại trừ.'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Cài đặt</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-primary-600 text-white font-medium">
                      {section.badgeLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {selectedSection === 'basic' ? renderBasicSection() : renderSelectSection()}
      </div>
    </div>
  );
};

/**
 * Section UI cho node lấy thông tin nhóm Zalo.
 *
 * @param {Object} props section props
 * @returns {JSX.Element}
 */
export const NodeConfigGetAllGroupsSection = ({
  formData,
  setFormData,
  upstreamNodes = [],
}) => {
  const [selectedSection, setSelectedSection] = useState('basic');
  const [previewItems, setPreviewItems] = useState([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastAutoLoadedAccountId, setLastAutoLoadedAccountId] = useState('');

  const selectedGroupIds = (Array.isArray(formData.zaloSelectedGroupIds) ? formData.zaloSelectedGroupIds : [])
    .map((value) => String(value || '').trim())
    .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
  const isGroupSelectionSnapshotLocked = Boolean(formData.zaloGroupSelectionSnapshotLocked);

  const accountSourceNodes = useMemo(() => {
    const sourceNodes = Array.isArray(upstreamNodes) ? upstreamNodes : [];
    return sourceNodes
      .filter((node) => {
        const nodeType = node?.data?.nodeType || node?.type;
        return nodeType === 'select_zalo_account';
      })
      .map((node) => ({
        nodeId: String(node?.id || '').trim(),
        nodeName: String(node?.data?.label || '').trim() || `Node ${String(node?.id || '').trim()}`,
        accountId: String(node?.data?.config?.zaloAccountId || '').trim(),
      }))
      .filter((item) => item.nodeId);
  }, [upstreamNodes]);

  const selectedAccountSourceNodeId = String(formData.zaloGroupAccountNodeId || '').trim();
  const selectedAccountSourceNode = accountSourceNodes.find((item) => item.nodeId === selectedAccountSourceNodeId) || null;
  const fallbackAccountSourceNode = accountSourceNodes[accountSourceNodes.length - 1] || null;

  const resolvePreviewAccountId = () => String(
    selectedAccountSourceNode?.accountId
    || fallbackAccountSourceNode?.accountId
    || formData.zaloAccountId
    || ''
  ).trim();

  useEffect(() => {
    if (accountSourceNodes.length === 0) return;
    const currentSourceNodeId = String(formData.zaloGroupAccountNodeId || '').trim();
    const isCurrentValid = currentSourceNodeId
      && accountSourceNodes.some((item) => item.nodeId === currentSourceNodeId);
    if (isCurrentValid) return;

    const defaultSource = accountSourceNodes[accountSourceNodes.length - 1];
    setFormData((prev) => ({
      ...prev,
      zaloGroupAccountNodeId: defaultSource.nodeId,
      zaloAccountId: defaultSource.accountId || prev.zaloAccountId || '',
    }));
  }, [accountSourceNodes, formData.zaloGroupAccountNodeId, setFormData]);

  const toggleGroup = (groupId) => {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) return;
    setFormData((prev) => {
      const current = (Array.isArray(prev.zaloSelectedGroupIds) ? prev.zaloSelectedGroupIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const next = current.includes(normalizedGroupId)
        ? current.filter((value) => value !== normalizedGroupId)
        : [...current, normalizedGroupId];
      return {
        ...prev,
        zaloSelectedGroupIds: next,
        // Người dùng chỉnh tay danh sách thì tắt trạng thái khóa snapshot "chọn tất cả".
        zaloGroupSelectionSnapshotLocked: false,
      };
    });
  };

  const filteredPreviewItems = previewItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(item?.groupName || '').toLowerCase().includes(q)
      || String(item?.groupId || '').toLowerCase().includes(q)
    );
  });
  const allFilteredIds = filteredPreviewItems
    .map((item) => String(item?.groupId || '').trim())
    .filter(Boolean);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedGroupIds.includes(id));
  const toggleAllFiltered = () => {
    setFormData((prev) => {
      const current = (Array.isArray(prev.zaloSelectedGroupIds) ? prev.zaloSelectedGroupIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const next = allSelected
        ? current.filter((id) => !allFilteredIds.includes(id))
        : Array.from(new Set([...current, ...allFilteredIds]));
      return {
        ...prev,
        zaloSelectedGroupIds: next,
        // "Chọn tất cả" sẽ khóa snapshot hiện tại để các lần quét sau không tự thêm nhóm mới.
        zaloGroupSelectionSnapshotLocked: !allSelected && allFilteredIds.length > 0,
      };
    });
  };

  const handleLoadPreview = async () => {
    const accountId = resolvePreviewAccountId();
    if (!accountId) {
      toast.error('Chưa có tài khoản Zalo để tải thông tin nhóm. Vui lòng cấu hình node "Chọn tài khoản Zalo" trước.');
      return;
    }
    try {
      setIsLoadingPreview(true);
      setPreviewItems([]);
      const response = await campaignBuilderApiService.getPreviewZaloGroups({ accountId });
      const items = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
      setPreviewItems(items);
      toast.success(`Đã tải ${items.length} nhóm Zalo`);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Không thể tải thông tin nhóm Zalo';
      toast.error(message);
      setPreviewItems([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (selectedSection !== 'select') return;
    if (isLoadingPreview) return;
    if (previewItems.length > 0) return;

    const accountId = resolvePreviewAccountId();
    if (!accountId) return;
    if (lastAutoLoadedAccountId === accountId) return;

    setLastAutoLoadedAccountId(accountId);
    handleLoadPreview();
  }, [
    isLoadingPreview,
    lastAutoLoadedAccountId,
    previewItems.length,
    selectedSection,
    selectedAccountSourceNodeId,
    formData.zaloAccountId,
  ]);

  const sections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineDocument },
    {
      id: 'select',
      name: 'Lựa chọn nhóm',
      icon: HiOutlinePlay,
      badge: selectedGroupIds.length > 0,
      badgeLabel: selectedGroupIds.length,
    },
  ];

  const renderBasicSection = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder="Lấy thông tin nhóm Zalo"
        />
      </div>

      <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
        Node này lấy thông tin nhóm từ tài khoản đã chọn ở node <strong>Chọn tài khoản Zalo</strong>.
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Node nguồn tài khoản Zalo</label>
        {accountSourceNodes.length > 0 ? (
          <select
            value={selectedAccountSourceNodeId}
            onChange={(e) => {
              const nextNodeId = String(e.target.value || '').trim();
              const nextNode = accountSourceNodes.find((item) => item.nodeId === nextNodeId) || null;
              setFormData((prev) => ({
                ...prev,
                zaloGroupAccountNodeId: nextNodeId,
                zaloAccountId: nextNode?.accountId || prev.zaloAccountId || '',
              }));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            {accountSourceNodes.map((item) => (
              <option key={item.nodeId} value={item.nodeId}>
                {item.nodeName}
                {item.accountId ? ` (ID ${item.accountId})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="px-3 py-2 border border-dashed border-amber-300 rounded-lg bg-amber-50 text-amber-700 text-sm">
            Chưa có node <strong>Chọn tài khoản Zalo</strong> ở phía trước. Vui lòng thêm node này trước khi tải dữ liệu thử.
          </div>
        )}
      </div>

      <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
        <strong>Tài khoản dùng để tải thử:</strong>{' '}
        {resolvePreviewAccountId()
          ? `ID ${resolvePreviewAccountId()}${selectedAccountSourceNode?.nodeName ? ` · từ node "${selectedAccountSourceNode.nodeName}"` : ''}`
          : 'Chưa xác định từ flow hiện tại'}
      </div>
    </div>
  );

  const renderSelectSection = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleLoadPreview}
          disabled={isLoadingPreview}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isLoadingPreview
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {isLoadingPreview ? 'Đang tải...' : previewItems.length > 0 ? 'Tải lại' : 'Tải dữ liệu thử'}
        </button>
        {previewItems.length > 0 && (
          <span className="text-sm text-gray-500">
            {previewItems.length} nhóm · đã chọn <strong className="text-primary-700">{selectedGroupIds.length}</strong>
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Nhấn để lấy thông tin nhóm theo tài khoản Zalo đã chọn. Kết quả chỉ để cấu hình và xem trước.
      </p>

      {isLoadingPreview ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Đang tải thông tin nhóm...</p>
        </div>
      ) : previewItems.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
          <HiOutlineDocumentText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Chưa có dữ liệu</p>
          <p className="text-xs text-gray-400 mt-1">Nhấn "Tải dữ liệu thử" để xem trước và tích chọn nhóm</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Tìm theo tên nhóm hoặc group id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={toggleAllFiltered}
              className="px-3 py-2 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors whitespace-nowrap"
            >
              {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {filteredPreviewItems.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-500">Không tìm thấy nhóm phù hợp</p>
                </div>
              ) : (
                filteredPreviewItems.map((item, idx) => {
                  const groupId = String(item?.groupId || '').trim();
                  const groupName = String(item?.groupName || '').trim();
                  const checked = groupId && selectedGroupIds.includes(groupId);
                  return (
                    <label
                      key={`${groupId || 'group'}-${idx}`}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                        checked ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={!!checked}
                        onChange={() => toggleGroup(groupId)}
                        disabled={!groupId}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {groupName || '(Chưa có tên nhóm)'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          groupId: {groupId || '(không xác định)'}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {selectedGroupIds.length > 0 && (
            <div className="mt-2 p-2 bg-primary-50 rounded-lg flex items-center justify-between">
              <p className="text-xs text-primary-700">
                Đã chọn <strong>{selectedGroupIds.length}</strong> nhóm. Khi chạy node sẽ chỉ lấy các nhóm đã tích.
                {isGroupSelectionSnapshotLocked ? ' Đang khóa snapshot từ thao tác "Chọn tất cả".' : ''}
              </p>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({
                  ...prev,
                  zaloSelectedGroupIds: [],
                  zaloGroupSelectionSnapshotLocked: false,
                }))}
                className="text-xs text-gray-500 hover:text-red-500 ml-3 flex-shrink-0"
              >
                Xóa chọn
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-green-50 p-3 rounded-lg">
        <p className="text-sm text-green-700">
          <strong>Lưu ý:</strong> Node này cho phép chọn nhiều nhóm và bắt buộc chọn ít nhất 1 nhóm trước khi lưu.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Cài đặt</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-primary-600 text-white font-medium">
                      {section.badgeLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {selectedSection === 'basic' ? renderBasicSection() : renderSelectSection()}
      </div>
    </div>
  );
};
