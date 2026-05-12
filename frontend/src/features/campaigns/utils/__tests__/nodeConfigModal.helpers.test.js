import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    getEmailTemplateById: vi.fn(),
    getInterestedCustomersByQuery: vi.fn(),
    getZaloAccounts: vi.fn(),
    getCourses: vi.fn(),
    previewLandingLeads: vi.fn(),
  },
}));

import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import {
  withDefaultNodeRef,
  buildDefaultCustomerFieldMap,
  normalizeTemplateVariables,
  fetchTemplateDetail,
  fetchInterestedCourseOptions,
  fetchInterestedCustomerCoursesLocal,
  fetchZaloAccountOptions,
  createNodeConfigFormData,
  handleNodeSheetConnectionCheck,
  handleNodeCoursesPreviewLoad,
  handleMappingTemplateSelect,
  handleNodeConfigSaveClick,
} from '../nodeConfigModal.helpers';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withDefaultNodeRef', () => {
  it('mapping rỗng + defaultNodeId → mode=node, nodeId=default', () => {
    expect(withDefaultNodeRef({}, 'NODE_A')).toEqual({
      mode: 'node',
      nodeId: 'NODE_A',
      field: '',
      value: '',
    });
  });

  it('mapping có sẵn các giá trị → giữ nguyên, không override', () => {
    const out = withDefaultNodeRef(
      { mode: 'manual', nodeId: 'X', field: 'name', value: 'abc' },
      'DEFAULT'
    );
    expect(out).toEqual({ mode: 'manual', nodeId: 'X', field: 'name', value: 'abc' });
  });

  it('không truyền mapping → defaults với defaultNodeId rỗng', () => {
    expect(withDefaultNodeRef()).toEqual({ mode: 'node', nodeId: '', field: '', value: '' });
  });
});

describe('buildDefaultCustomerFieldMap', () => {
  it('default tất cả field dùng defaultNodeId, customerSource có mode=manual + value=campaign', () => {
    const out = buildDefaultCustomerFieldMap({}, 'NODE_X');
    expect(out.email).toEqual({ mode: 'node', nodeId: 'NODE_X', field: '', value: '' });
    expect(out.phone.nodeId).toBe('NODE_X');
    expect(out.fullName.nodeId).toBe('NODE_X');
    expect(out.gender.nodeId).toBe('NODE_X');
    expect(out.customerSource).toEqual({
      mode: 'manual',
      nodeId: 'NODE_X',
      field: '',
      value: 'campaign',
    });
    expect(out.notes.nodeId).toBe('NODE_X');
    expect(out.zaloId.nodeId).toBe('NODE_X');
    expect(out.zaloPhone.nodeId).toBe('NODE_X');
  });

  it('customerSource có sẵn mode/value → giữ nguyên', () => {
    const out = buildDefaultCustomerFieldMap(
      { customerSource: { mode: 'column', value: 'fb_ads' } },
      'NODE_Y'
    );
    expect(out.customerSource.mode).toBe('column');
    expect(out.customerSource.value).toBe('fb_ads');
  });
});

describe('normalizeTemplateVariables', () => {
  it('array of {key} → trả key, dedupe', () => {
    const out = normalizeTemplateVariables({
      variables: [{ key: 'name' }, { key: 'email' }, { key: 'name' }],
    });
    expect(out).toEqual(['name', 'email']);
  });

  it('array of strings → trả nguyên', () => {
    expect(normalizeTemplateVariables({ variables: ['phone', 'age'] })).toEqual(['phone', 'age']);
  });

  it('variables là chuỗi JSON array → parse được', () => {
    expect(normalizeTemplateVariables({ variables: '["a","b"]' })).toEqual(['a', 'b']);
  });

  it('variables là JSON hỏng → bỏ qua, fallback scan body', () => {
    const out = normalizeTemplateVariables({
      variables: '{not json',
      subject: 'Xin chào {{ name }}',
      bodyHtml: '<p>{{ email }}</p>',
    });
    expect(out.sort()).toEqual(['email', 'name']);
  });

  it('scan {{var}} từ subject/bodyHtml/bodyText, merge với variables array, dedupe', () => {
    const out = normalizeTemplateVariables({
      variables: [{ key: 'name' }],
      subject: 'Hi {{ name }}',
      bodyHtml: '<p>{{ phone }}</p>',
      bodyText: 'Contact: {{ email }}',
    });
    expect(out.sort()).toEqual(['email', 'name', 'phone']);
  });

  it('không có gì → []', () => {
    expect(normalizeTemplateVariables({})).toEqual([]);
    expect(normalizeTemplateVariables(null)).toEqual([]);
  });
});

describe('fetchTemplateDetail', () => {
  it('templateId falsy → null, không gọi API', async () => {
    const out = await fetchTemplateDetail(0);
    expect(out).toBeNull();
    expect(campaignBuilderApiService.getEmailTemplateById).not.toHaveBeenCalled();
  });

  it('gọi API, trả data.data', async () => {
    campaignBuilderApiService.getEmailTemplateById.mockResolvedValueOnce({
      data: { data: { id: 7, subject: 'Hi' } },
    });
    const out = await fetchTemplateDetail(7);
    expect(out).toEqual({ id: 7, subject: 'Hi' });
    expect(campaignBuilderApiService.getEmailTemplateById).toHaveBeenCalledWith(7);
  });

  it('response không có data.data → null', async () => {
    campaignBuilderApiService.getEmailTemplateById.mockResolvedValueOnce({ data: {} });
    expect(await fetchTemplateDetail(9)).toBeNull();
  });
});

describe('fetchInterestedCourseOptions', () => {
  it('build query string đúng: limit=1, courseIds dedupe, customerType non-default, courseStatuses lowercase dedupe', async () => {
    campaignBuilderApiService.getInterestedCustomersByQuery.mockResolvedValueOnce({
      data: { data: { courses: [{ id: 1, title: 'JS' }] } },
    });
    const out = await fetchInterestedCourseOptions({
      selectedIds: [1, 2, '2', 'x'],
      customerType: 'purchased',
      dataSource: 'database',
      courseQuery: '  React  ',
      courseStatuses: ['Publish', 'publish', 'Draft'],
    });
    expect(out).toEqual([{ id: 1, title: 'JS' }]);
    const [qs, dataSource] = campaignBuilderApiService.getInterestedCustomersByQuery.mock.calls[0];
    expect(dataSource).toBe('database');
    const params = new URLSearchParams(qs);
    expect(params.get('limit')).toBe('1');
    expect(params.get('courseIds')).toBe('1,2');
    expect(params.get('customerType')).toBe('purchased');
    expect(params.get('courseQuery')).toBe('React');
    expect(params.get('courseStatuses')).toBe('publish,draft');
  });

  it('selectedIds rỗng + customerType=interested → không gắn courseIds/customerType vào query', async () => {
    campaignBuilderApiService.getInterestedCustomersByQuery.mockResolvedValueOnce({
      data: { data: {} },
    });
    const out = await fetchInterestedCourseOptions({});
    expect(out).toEqual([]);
    const qs = campaignBuilderApiService.getInterestedCustomersByQuery.mock.calls[0][0];
    const params = new URLSearchParams(qs);
    expect(params.has('courseIds')).toBe(false);
    expect(params.has('customerType')).toBe(false);
    expect(params.has('courseStatuses')).toBe(false);
  });
});

describe('fetchInterestedCustomerCoursesLocal', () => {
  it('limit clamp về tối đa 5000, customerType khác interested → set vào query', async () => {
    campaignBuilderApiService.getInterestedCustomersByQuery.mockResolvedValueOnce({
      data: { data: { items: [], pagination: { total: 0, limit: 5000 } } },
    });
    await fetchInterestedCustomerCoursesLocal({
      config: {
        interestedLimit: 99999,
        interestedCustomerType: 'all',
        interestedCourseIds: [1, '2', 2, NaN],
        interestedCourseQuery: 'React',
        interestedCourseStatuses: ['Publish', 'PUBLISH'],
        interestedDataSource: 'sheet',
      },
    });
    const [qs, dataSource] = campaignBuilderApiService.getInterestedCustomersByQuery.mock.calls[0];
    expect(dataSource).toBe('sheet');
    const params = new URLSearchParams(qs);
    expect(params.get('limit')).toBe('5000');
    expect(params.get('customerType')).toBe('all');
    expect(params.get('courseIds')).toBe('1,2');
    expect(params.get('courseQuery')).toBe('React');
    expect(params.get('courseStatuses')).toBe('publish');
  });

  it('default limit=1000 khi không set, dataSource default=database', async () => {
    campaignBuilderApiService.getInterestedCustomersByQuery.mockResolvedValueOnce({
      data: { data: { items: [{ id: 1 }], pagination: { total: 1, limit: 1000 } } },
    });
    const out = await fetchInterestedCustomerCoursesLocal({});
    const [qs, dataSource] = campaignBuilderApiService.getInterestedCustomersByQuery.mock.calls[0];
    expect(new URLSearchParams(qs).get('limit')).toBe('1000');
    expect(dataSource).toBe('database');
    expect(out.items).toHaveLength(1);
  });

  it('response không có data → trả default { items: [], pagination: { total: 0, limit } }', async () => {
    campaignBuilderApiService.getInterestedCustomersByQuery.mockResolvedValueOnce({ data: {} });
    const out = await fetchInterestedCustomerCoursesLocal({ config: { interestedLimit: 50 } });
    expect(out).toEqual({ items: [], pagination: { total: 0, limit: 50 } });
  });
});

describe('fetchZaloAccountOptions', () => {
  it('map items → id/displayName/status/isActive/isDefault với fallback', async () => {
    campaignBuilderApiService.getZaloAccounts.mockResolvedValueOnce({
      data: {
        data: {
          items: [
            { id: 1, displayName: 'A', status: 'connected', isActive: true, isDefault: true },
            { id: 2, name: 'B', status: undefined },
            { id: 3, zaloName: 'C' },
            { id: 4 },
          ],
        },
      },
    });
    const out = await fetchZaloAccountOptions();
    expect(out).toEqual([
      { id: '1', displayName: 'A', status: 'connected', isActive: true, isDefault: true },
      { id: '2', displayName: 'B', status: 'disconnected', isActive: true, isDefault: false },
      { id: '3', displayName: 'C', status: 'disconnected', isActive: true, isDefault: false },
      { id: '4', displayName: 'Tài khoản Zalo', status: 'disconnected', isActive: true, isDefault: false },
    ]);
  });

  it('items không phải array → []', async () => {
    campaignBuilderApiService.getZaloAccounts.mockResolvedValueOnce({ data: { data: {} } });
    expect(await fetchZaloAccountOptions()).toEqual([]);
  });

  it('isActive=false giữ nguyên', async () => {
    campaignBuilderApiService.getZaloAccounts.mockResolvedValueOnce({
      data: { data: { items: [{ id: 9, displayName: 'Z', isActive: false }] } },
    });
    const out = await fetchZaloAccountOptions();
    expect(out[0].isActive).toBe(false);
  });
});

describe('createNodeConfigFormData', () => {
  it('config rỗng → defaults đúng các trường core', () => {
    const out = createNodeConfigFormData({ config: {}, label: 'Node A' });
    expect(out.label).toBe('Node A');
    expect(out.sheetName).toBe('Sheet1');
    expect(out.headerRow).toBe(1);
    expect(out.dataStartRow).toBe(2);
    expect(out.builderSheetPreviewRowLimit).toBe('');
    expect(out.interestedLimit).toBe(1000);
    expect(out.mappings).toEqual([
      { variableName: '', sourceType: 'column', columnName: '', formula: '' },
    ]);
    expect(out.recipientMode).toBe('multiple');
    expect(out.sendMode).toBe('all');
    expect(out.zaloRecipientType).toBe('phone');
    expect(out.triggerType).toBe('object');
    expect(out.applyFields).toEqual(['Hợp đồng']);
  });

  it('resolveSelectionMode: mode rỗng + có selectedIds legacy → fixed', () => {
    const out = createNodeConfigFormData({
      config: { interestedSelectedCustomerIds: [1, 2] },
    });
    expect(out.interestedSelectionMode).toBe('fixed');
  });

  it('resolveSelectionMode: mode rỗng + no legacy → all', () => {
    const out = createNodeConfigFormData({ config: {} });
    expect(out.interestedSelectionMode).toBe('all');
    expect(out.zaloFriendSelectionMode).toBe('all');
  });

  it('resolveSelectionMode: mode=all_exclude giữ nguyên (case-insensitive)', () => {
    const out = createNodeConfigFormData({
      config: { interestedSelectionMode: 'ALL_EXCLUDE' },
    });
    expect(out.interestedSelectionMode).toBe('all_exclude');
  });

  it('normalizeEmailSteps=true → fill default delayFrom=start + enableLinkTracking=true', () => {
    const out = createNodeConfigFormData({
      config: { emailSteps: [{ templateId: 1 }, { templateId: 2, enableLinkTracking: false }] },
      normalizeEmailSteps: true,
    });
    expect(out.emailSteps[0].delayFrom).toBe('start');
    expect(out.emailSteps[0].enableLinkTracking).toBe(true);
    expect(out.emailSteps[0].templateId).toBe(1);
    expect(out.emailSteps[1].enableLinkTracking).toBe(false);
  });

  it('normalizeEmailSteps=false → giữ nguyên emailSteps', () => {
    const raw = [{ templateId: 1 }];
    const out = createNodeConfigFormData({ config: { emailSteps: raw } });
    expect(out.emailSteps).toBe(raw);
  });

  it('saveCustomerCustomFields fill default nodeId từ saveCustomerNodeId', () => {
    const out = createNodeConfigFormData({
      config: {
        saveCustomerNodeId: 'SAVE_NODE',
        saveCustomerCustomFields: [{ key: 'a' }, { key: 'b', nodeId: 'OVERRIDE' }],
      },
    });
    expect(out.saveCustomerCustomFields[0].nodeId).toBe('SAVE_NODE');
    expect(out.saveCustomerCustomFields[1].nodeId).toBe('OVERRIDE');
  });

  it('zaloFriendTemplateMappings: sourceType=recipient_field → đổi sang node', () => {
    const out = createNodeConfigFormData({
      config: {
        zaloFriendNodeId: 'FN',
        zaloFriendTemplateMappings: [
          { variableName: 'name', sourceType: 'recipient_field' },
          { variableName: 'x', sourceType: 'manual', value: 'hi' },
        ],
      },
    });
    expect(out.zaloFriendTemplateMappings[0].sourceType).toBe('node');
    expect(out.zaloFriendTemplateMappings[0].nodeId).toBe('FN');
    expect(out.zaloFriendTemplateMappings[1].sourceType).toBe('manual');
    expect(out.zaloFriendTemplateMappings[1].value).toBe('hi');
  });
});

describe('handleNodeSheetConnectionCheck', () => {
  const makeCtx = (overrides = {}) => ({
    onCheckSheetConnection: vi.fn(async () => ({ columns: [{ name: 'A' }, { name: 'B' }] })),
    formData: { sheetUrl: 'https://docs.google.com/abc' },
    setFormData: vi.fn(),
    setIsCheckingSheet: vi.fn(),
    toastNotifier: { success: vi.fn(), error: vi.fn() },
    ...overrides,
  });

  it('không có callback → null', async () => {
    const ctx = makeCtx({ onCheckSheetConnection: null });
    expect(await handleNodeSheetConnectionCheck(ctx)).toBeNull();
  });

  it('sheetUrl rỗng → toast error + null', async () => {
    const ctx = makeCtx({ formData: { sheetUrl: '   ' } });
    expect(await handleNodeSheetConnectionCheck(ctx)).toBeNull();
    expect(ctx.toastNotifier.error).toHaveBeenCalledWith('Vui lòng nhập URL Google Sheet');
  });

  it('success → set columns vào formData, toast success kèm số cột', async () => {
    const ctx = makeCtx();
    const out = await handleNodeSheetConnectionCheck(ctx);
    expect(out).toEqual([{ name: 'A' }, { name: 'B' }]);
    expect(ctx.setIsCheckingSheet).toHaveBeenNthCalledWith(1, true);
    expect(ctx.setIsCheckingSheet).toHaveBeenLastCalledWith(false);

    const updater = ctx.setFormData.mock.calls[0][0];
    expect(updater({ sheetUrl: 'x', columns: [] })).toEqual({
      sheetUrl: 'x',
      columns: [{ name: 'A' }, { name: 'B' }],
    });
    expect(ctx.toastNotifier.success).toHaveBeenCalledWith('Kết nối sheet. Đã lấy 2 cột');
  });

  it('columns rỗng → toast success "Kết nối sheet OK."', async () => {
    const ctx = makeCtx({
      onCheckSheetConnection: vi.fn(async () => ({ columns: [] })),
    });
    await handleNodeSheetConnectionCheck(ctx);
    expect(ctx.toastNotifier.success).toHaveBeenCalledWith('Kết nối sheet OK.');
  });

  it('callback throw có response.data.message → toast error + null', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeCtx({
      onCheckSheetConnection: vi.fn(async () => {
        const err = new Error('boom');
        err.response = { data: { message: 'Sheet riêng tư' } };
        throw err;
      }),
    });
    const out = await handleNodeSheetConnectionCheck(ctx);
    expect(out).toBeNull();
    expect(ctx.toastNotifier.error).toHaveBeenCalledWith('Sheet riêng tư');
    expect(ctx.setIsCheckingSheet).toHaveBeenLastCalledWith(false);
    errorSpy.mockRestore();
  });
});

describe('handleNodeCoursesPreviewLoad', () => {
  const makeCtx = (overrides = {}) => ({
    formData: { coursesDbLimit: 500, coursesDbSearchTerm: 'js', coursesDbStatuses: ['Publish', 'PUBLISH'] },
    setIsLoadingCoursesPreview: vi.fn(),
    setCoursesPreviewItems: vi.fn(),
    toastNotifier: { success: vi.fn(), error: vi.fn() },
    ...overrides,
  });

  it('success → fetch params đúng (limit, search, status lowercase dedupe), set items, toast success', async () => {
    campaignBuilderApiService.getCourses.mockResolvedValueOnce({
      data: { data: { courses: [{ id: 1 }, { id: 2 }] } },
    });
    const ctx = makeCtx();
    await handleNodeCoursesPreviewLoad(ctx);
    expect(campaignBuilderApiService.getCourses).toHaveBeenCalledWith({
      limit: 500,
      search: 'js',
      status: 'publish',
    });
    expect(ctx.setCoursesPreviewItems).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
    expect(ctx.toastNotifier.success).toHaveBeenCalledWith('Đã tải 2 khóa học');
    expect(ctx.setIsLoadingCoursesPreview).toHaveBeenLastCalledWith(false);
  });

  it('formData rỗng → default limit=1000, không có search/status', async () => {
    campaignBuilderApiService.getCourses.mockResolvedValueOnce({ data: { data: { courses: [] } } });
    const ctx = makeCtx({ formData: {} });
    await handleNodeCoursesPreviewLoad(ctx);
    expect(campaignBuilderApiService.getCourses).toHaveBeenCalledWith({ limit: 1000 });
  });

  it('lỗi → toast error + set items rỗng', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    campaignBuilderApiService.getCourses.mockRejectedValueOnce(
      Object.assign(new Error('x'), { response: { data: { message: 'Down' } } })
    );
    const ctx = makeCtx();
    await handleNodeCoursesPreviewLoad(ctx);
    expect(ctx.toastNotifier.error).toHaveBeenCalledWith('Down');
    expect(ctx.setCoursesPreviewItems).toHaveBeenCalledWith([]);
    errorSpy.mockRestore();
  });
});

describe('handleMappingTemplateSelect', () => {
  it('templateId rỗng/0 → reset template + keep mappings', async () => {
    const setMappingTemplate = vi.fn();
    const setFormData = vi.fn();
    await handleMappingTemplateSelect({ templateId: 0, setMappingTemplate, setFormData });
    expect(setMappingTemplate).toHaveBeenCalledWith(null);

    const updater = setFormData.mock.calls[0][0];
    const prev = { mappings: [{ variableName: 'name' }] };
    expect(updater(prev)).toEqual({ mappingTemplateId: '', mappings: prev.mappings });
  });

  it('templateId valid → fetch detail, set template, build mappings từ variables (merge existing)', async () => {
    campaignBuilderApiService.getEmailTemplateById.mockResolvedValueOnce({
      data: { data: { variables: [{ key: 'name' }, { key: 'email' }] } },
    });
    const setMappingTemplate = vi.fn();
    const setFormData = vi.fn();
    await handleMappingTemplateSelect({ templateId: '7', setMappingTemplate, setFormData });

    expect(campaignBuilderApiService.getEmailTemplateById).toHaveBeenCalledWith(7);
    expect(setMappingTemplate).toHaveBeenCalledWith({
      variables: [{ key: 'name' }, { key: 'email' }],
    });

    const updater = setFormData.mock.calls[0][0];
    const prev = {
      mappings: [{ variableName: 'name', sourceType: 'column', columnName: 'X' }],
    };
    const result = updater(prev);
    expect(result.mappingTemplateId).toBe(7);
    expect(result.mappings).toEqual([
      { variableName: 'name', sourceType: 'column', columnName: 'X' },
      { variableName: 'email', sourceType: 'column', columnName: 'email', formula: '' },
    ]);
  });

  it('template không có variable → giữ nguyên mappings cũ', async () => {
    campaignBuilderApiService.getEmailTemplateById.mockResolvedValueOnce({
      data: { data: { variables: [] } },
    });
    const setMappingTemplate = vi.fn();
    const setFormData = vi.fn();
    await handleMappingTemplateSelect({ templateId: 3, setMappingTemplate, setFormData });

    const updater = setFormData.mock.calls[0][0];
    const prev = { mappings: [{ variableName: 'kept' }] };
    expect(updater(prev).mappings).toEqual([{ variableName: 'kept' }]);
  });
});

describe('handleNodeConfigSaveClick — read_sheet', () => {
  it('check sheet trả columns → onSave(formData + columns)', async () => {
    const onSave = vi.fn();
    const handleCheckSheetConnection = vi.fn(async () => [{ name: 'A' }]);
    await handleNodeConfigSaveClick({
      nodeType: 'read_sheet',
      formData: { sheetUrl: 'x' },
      onSave,
      handleCheckSheetConnection,
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier: { success: vi.fn(), error: vi.fn() },
    });
    expect(onSave).toHaveBeenCalledWith({ sheetUrl: 'x', columns: [{ name: 'A' }] });
  });

  it('check sheet thất bại (null) → toast error + onSave(formData không columns)', async () => {
    const onSave = vi.fn();
    const toastNotifier = { success: vi.fn(), error: vi.fn() };
    await handleNodeConfigSaveClick({
      nodeType: 'read_sheet',
      formData: { sheetUrl: 'x' },
      onSave,
      handleCheckSheetConnection: vi.fn(async () => null),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier,
    });
    expect(toastNotifier.error).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith({ sheetUrl: 'x' });
  });
});

describe('handleNodeConfigSaveClick — read_interested_customers', () => {
  it('preview success → toast success + onSave', async () => {
    campaignBuilderApiService.getInterestedCustomersByQuery.mockResolvedValueOnce({
      data: { data: { items: [], pagination: { total: 42 } } },
    });
    const onSave = vi.fn();
    const toastNotifier = { success: vi.fn(), error: vi.fn() };
    const setLoading = vi.fn();
    await handleNodeConfigSaveClick({
      nodeType: 'read_interested_customers',
      formData: { interestedLimit: 100 },
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: setLoading,
      toastNotifier,
      campaignId: 7,
    });
    expect(toastNotifier.success).toHaveBeenCalledWith('Kết nối OK. Tìm thấy 42 khách hàng phù hợp');
    expect(onSave).toHaveBeenCalledWith({ interestedLimit: 100 });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('preview lỗi → toast error, không onSave', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    campaignBuilderApiService.getInterestedCustomersByQuery.mockRejectedValueOnce(
      Object.assign(new Error('x'), { response: { data: { message: 'API lỗi' } } })
    );
    const onSave = vi.fn();
    const toastNotifier = { success: vi.fn(), error: vi.fn() };
    await handleNodeConfigSaveClick({
      nodeType: 'read_interested_customers',
      formData: {},
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier,
    });
    expect(toastNotifier.error).toHaveBeenCalledWith('API lỗi');
    expect(onSave).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('handleNodeConfigSaveClick — read_courses_db', () => {
  it('luôn onSave trực tiếp', async () => {
    const onSave = vi.fn();
    await handleNodeConfigSaveClick({
      nodeType: 'read_courses_db',
      formData: { coursesDbLimit: 50 },
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier: { success: vi.fn(), error: vi.fn() },
    });
    expect(onSave).toHaveBeenCalledWith({ coursesDbLimit: 50 });
  });
});

describe('handleNodeConfigSaveClick — read_landing_leads', () => {
  it('preview success → toast success + onSave với JSON stringified filters', async () => {
    campaignBuilderApiService.previewLandingLeads.mockResolvedValueOnce({
      data: { data: { pagination: { total: 15 } } },
    });
    const onSave = vi.fn();
    const toastNotifier = { success: vi.fn(), error: vi.fn() };
    await handleNodeConfigSaveClick({
      nodeType: 'read_landing_leads',
      formData: {
        landingLeadsUseDateRange: true,
        landingLeadsDateFrom: '2026-01-01',
        landingLeadsDateTo: '2026-12-31',
        landingLeadsOccupations: ['student'],
        landingLeadsInterests: ['react'],
        landingLeadsSlugs: ['lp1'],
      },
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier,
    });
    expect(campaignBuilderApiService.previewLandingLeads).toHaveBeenCalledWith({
      landingLeadsUseDateRange: true,
      landingLeadsDateFrom: '2026-01-01',
      landingLeadsDateTo: '2026-12-31',
      landingLeadsOccupations: '["student"]',
      landingLeadsInterests: '["react"]',
      landingLeadsSlugs: '["lp1"]',
      landingLeadsLimit: 50,
    });
    expect(toastNotifier.success).toHaveBeenCalledWith(
      'Kết nối OK. Có 15 lead phù hợp (xem trước tối đa 50 dòng)'
    );
    expect(onSave).toHaveBeenCalled();
  });

  it('preview lỗi → toast error, không onSave', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    campaignBuilderApiService.previewLandingLeads.mockRejectedValueOnce(new Error('Network'));
    const onSave = vi.fn();
    const toastNotifier = { success: vi.fn(), error: vi.fn() };
    await handleNodeConfigSaveClick({
      nodeType: 'read_landing_leads',
      formData: {},
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier,
    });
    expect(toastNotifier.error).toHaveBeenCalledWith('Network');
    expect(onSave).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('handleNodeConfigSaveClick — get_all_groups', () => {
  it('selectedGroupIds rỗng → toast error, không onSave', async () => {
    const onSave = vi.fn();
    const toastNotifier = { success: vi.fn(), error: vi.fn() };
    await handleNodeConfigSaveClick({
      nodeType: 'get_all_groups',
      formData: { zaloSelectedGroupIds: [] },
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier,
    });
    expect(toastNotifier.error).toHaveBeenCalledWith('Vui lòng chọn ít nhất 1 nhóm Zalo trước khi lưu');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('có selectedGroupIds → onSave với dedupe + cast string + snapshotLocked boolean', async () => {
    const onSave = vi.fn();
    await handleNodeConfigSaveClick({
      nodeType: 'get_all_groups',
      formData: {
        zaloSelectedGroupIds: ['g1', 'g1', 'g2', '', '  g3  '],
        zaloGroupSelectionSnapshotLocked: 1,
      },
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier: { success: vi.fn(), error: vi.fn() },
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        zaloSelectedGroupIds: ['g1', 'g2', 'g3'],
        zaloGroupSelectionSnapshotLocked: true,
      })
    );
  });
});

describe('handleNodeConfigSaveClick — default branch', () => {
  it('nodeType khác → onSave(formData) trực tiếp', async () => {
    const onSave = vi.fn();
    await handleNodeConfigSaveClick({
      nodeType: 'send_email',
      formData: { emailSubject: 'Hi' },
      onSave,
      handleCheckSheetConnection: vi.fn(),
      setIsLoadingTestPreview: vi.fn(),
      toastNotifier: { success: vi.fn(), error: vi.fn() },
    });
    expect(onSave).toHaveBeenCalledWith({ emailSubject: 'Hi' });
  });
});
