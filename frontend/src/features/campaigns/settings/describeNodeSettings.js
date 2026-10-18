/**
 * Tóm tắt TƯỜNG MINH cài đặt của MỘT khối chiến dịch cho tab "Thiết lập" (PLAN_THIET_LAP_VA_SO_DO_2026-10-17).
 *
 * Hàm THUẦN: không gọi API, không đọc store. Tên mẫu / tài khoản tra bằng `lookups` mà trang đã tải sẵn.
 * Mỗi subtype trong registry `nodeConfigs` (`CampaignBuilderFlowNodes.jsx`) có đúng một nhánh; subtype lạ rơi về dòng chung.
 * Điều kiện "thiếu bắt buộc" bám `validateNodeForRun` (campaignBuilderRunValidation.js) để dòng đỏ khớp với lỗi lúc chạy.
 */
import { getFormIdsFromConfig } from '../utils/readFormSubmissionsFormIds.js';

/** Mọi subtype có nhánh tóm tắt riêng. Test ghim từng phần tử và đối chiếu với registry `nodeConfigs`. */
export const DESCRIBED_NODE_SUBTYPES = Object.freeze([
  'manual_trigger',
  'send_email',
  'send_zalo_personal',
  'send_zalo_friend_request',
  'send_zalo_group',
  'send_telegram',
  'send_whatsapp',
  'condition',
  'tag_contact',
  'update_attribute',
  'read_sheet',
  'read_courses_db',
  'read_products_db',
  'read_interested_customers',
  'read_landing_leads',
  'read_form_submissions',
  'save_customer',
  'select_zalo_account',
  'get_all_friends',
  'get_all_groups',
]);

const PREFIX = 'campaignSettings';
const MAX_NAMES_SHOWN = 2;
const EXCERPT_LENGTH = 48;

const text = (value) => String(value ?? '').trim();

/**
 * `role` = dòng này thuộc mục nào của checklist "Trước khi chạy": 'sender' (gửi từ) | 'audience' (gửi cho ai) | 'content' (nội dung) |
 * 'timing' (thời điểm) | 'other'. Bỏ trống → lấy vai mặc định theo loại khối (`DEFAULT_ROLE_BY_SUBTYPE`). MỘT nguồn sự thật cho cả thẻ khối lẫn checklist.
 */
const line = (label, value, tone = 'normal', role = undefined) => ({ label, value, tone, ...(role ? { role } : {}) });
const withRole = (role, lines) => lines.map((item) => ({ ...item, role }));

/** Cắt chuỗi dài, thêm "…". */
const excerpt = (value, max = EXCERPT_LENGTH) => {
  const clean = text(value).replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/** Đếm mục của một ô nhập tay (mỗi dòng / dấu phẩy / chấm phẩy một mục) hoặc một mảng. */
const countListEntries = (raw) => {
  if (Array.isArray(raw)) return raw.filter((item) => text(typeof item === 'object' && item ? (item.recipientKey ?? item.id ?? '') : item)).length;
  return text(raw).split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean).length;
};

const joinShown = (names) => {
  const clean = names.map(text).filter(Boolean);
  const shown = clean.slice(0, MAX_NAMES_SHOWN).join(', ');
  const rest = clean.length - MAX_NAMES_SHOWN;
  return rest > 0 ? `${shown} +${rest}` : shown;
};

const sameId = (a, b) => text(a) !== '' && text(a) === text(b);

const findNode = (lookups, nodeId) => (
  (Array.isArray(lookups?.nodes) ? lookups.nodes : []).find((node) => sameId(node?.id, nodeId)) || null
);

const nodeTitle = (node, t) => text(node?.data?.label) || text(node?.data?.nodeType) || t(`${PREFIX}.node.unnamed`);

/** "30 phút", "2 ngày"… Đơn vị lạ giữ nguyên chữ đã lưu. */
const formatWait = (value, unit, t) => {
  const n = Number.parseInt(value, 10) || 0;
  const known = ['minutes', 'hours', 'days', 'weeks'];
  return known.includes(unit) ? t(`${PREFIX}.wait.${unit}`, { n }) : `${n} ${text(unit)}`.trim();
};

/**
 * Nhịp chờ của một tin trong chuỗi.
 * `scheduled=false` (chế độ "gửi tất cả") hoặc chờ 0 → "Gửi ngay". Tin đầu chờ > 0 → "sau khi chạy"; các tin sau
 * tính "sau tin trước" (`delayFrom='prev'`) hoặc "sau tin đầu" (`delayFrom='start'`, mốc bắt đầu chuỗi).
 */
const describeTiming = ({ index, scheduled, delayValue, delayUnit, delayFrom }, t) => {
  const n = Number.parseInt(delayValue, 10) || 0;
  if (!scheduled || n <= 0) return t(`${PREFIX}.timing.now`);
  const wait = formatWait(n, delayUnit || 'minutes', t);
  if (index === 0) return t(`${PREFIX}.timing.afterRun`, { wait });
  return t(delayFrom === 'prev' ? `${PREFIX}.timing.afterPrev` : `${PREFIX}.timing.afterFirst`, { wait });
};

/** Tài khoản email gửi: "Tên (địa chỉ)". */
const describeEmailSender = (config, lookups, t) => {
  const label = t(`${PREFIX}.label.sender`);
  const id = text(config.fromEmailId);
  if (!id) return line(label, t(`${PREFIX}.missing.emailSender`), 'missing', 'sender');
  const found = (Array.isArray(lookups?.emailSettings) ? lookups.emailSettings : []).find((item) => sameId(item?.id, id));
  if (!found) return line(label, t(`${PREFIX}.accountById`, { id }), 'normal', 'sender');
  const name = text(found.name);
  const email = text(found.email);
  return line(label, name && email ? `${name} (${email})` : (email || name), 'normal', 'sender');
};

/** "Dữ liệu từ khối “X”, cột “Y”" — khối/cột thiếu thì thành dòng đỏ. */
const describeNodeSource = (label, nodeId, field, lookups, t) => {
  if (!text(nodeId)) return line(label, t(`${PREFIX}.missing.sourceNode`), 'missing', 'audience');
  const node = findNode(lookups, nodeId);
  if (!node) return line(label, t(`${PREFIX}.missing.sourceNodeGone`), 'missing', 'audience');
  if (!text(field)) return line(label, t(`${PREFIX}.missing.column`), 'missing', 'audience');
  return line(label, t(`${PREFIX}.fromNode`, { node: nodeTitle(node, t), field: text(field) }), 'normal', 'audience');
};

const templateName = (templates, id, t) => {
  const found = (Array.isArray(templates) ? templates : []).find((item) => sameId(item?.id, id));
  return text(found?.templateName) || text(found?.name) || t(`${PREFIX}.templateById`, { id: text(id) });
};

/** Người nhận email: danh sách nhập tay hoặc cột của khối dữ liệu. */
const describeEmailRecipients = (config, lookups, t) => {
  const label = t(`${PREFIX}.label.recipients`);
  const source = text(config.recipientSource);
  if (source === 'manual') {
    const n = countListEntries(config.recipientEmails);
    return n > 0
      ? line(label, t(`${PREFIX}.manualEmails`, { n }))
      : line(label, t(`${PREFIX}.missing.emailList`), 'missing');
  }
  if (source === 'node') return describeNodeSource(label, config.recipientNodeId, config.recipientField, lookups, t);
  return line(label, t(`${PREFIX}.missing.recipientSource`), 'missing');
};

/** Các tin dựng từ mẫu (email / Zalo cá nhân / Zalo nhóm): "Tin N: <tên mẫu> · <nhịp chờ>". */
const describeTemplateSteps = ({ steps, templates, scheduled }, t) => steps.map((step, index) => {
  const label = t(`${PREFIX}.label.step`, { n: index + 1 });
  if (!text(step?.templateId)) return line(label, t(`${PREFIX}.missing.template`), 'missing', 'content');
  const timing = describeTiming({
    index,
    scheduled,
    delayValue: step.delayValue,
    delayUnit: step.delayUnit,
    delayFrom: step.delayFrom,
  }, t);
  return line(label, `${templateName(templates, step.templateId, t)} · ${timing}`, 'normal', 'content');
});

const describeEmail = (config, lookups, t) => {
  const rawSteps = Array.isArray(config.emailSteps) ? config.emailSteps : [];
  const steps = rawSteps.length === 0 && config.emailTemplateId ? [{ templateId: config.emailTemplateId }] : rawSteps;
  const lines = [describeEmailSender(config, lookups, t), ...withRole('audience', [describeEmailRecipients(config, lookups, t)])];
  if (steps.length === 0) {
    lines.push(line(t(`${PREFIX}.label.step`, { n: 1 }), t(`${PREFIX}.missing.emailTemplate`), 'missing', 'content'));
    return lines;
  }
  lines.push(...describeTemplateSteps({
    steps,
    templates: lookups?.emailTemplates,
    scheduled: config.sendMode === 'schedule',
  }, t));
  return lines;
};

/** Tên tài khoản Zalo đã chọn (một hoặc cả pool). Trả null nếu chưa chọn gì. */
const resolveZaloAccountNames = (config, lookups, t) => {
  const accounts = Array.isArray(lookups?.zaloAccounts) ? lookups.zaloAccounts : [];
  const nameOf = (id) => {
    const found = accounts.find((item) => sameId(item?.id, id));
    return text(found?.displayName) || t(`${PREFIX}.accountById`, { id: text(id) });
  };
  const poolIds = Array.isArray(config.zaloPoolAccountIds) ? config.zaloPoolAccountIds.map(text).filter(Boolean) : [];
  if (config.zaloPoolMultiAccountEnabled && poolIds.length > 0) return { names: poolIds.map(nameOf), pool: true };
  if (config.zaloPoolMultiAccountEnabled) return { names: [], pool: true };
  if (text(config.zaloAccountId)) return { names: [nameOf(config.zaloAccountId)], pool: false };
  return null;
};

const describeSelectZaloAccount = (config, lookups, t) => {
  const label = t(`${PREFIX}.label.zaloAccount`);
  const resolved = resolveZaloAccountNames(config, lookups, t);
  if (!resolved || resolved.names.length === 0) {
    return [line(label, t(`${PREFIX}.missing.${resolved?.pool ? 'zaloPool' : 'zaloAccount'}`), 'missing')];
  }
  if (resolved.pool) {
    return [
      line(label, t(`${PREFIX}.zaloPool`, { n: resolved.names.length, names: joinShown(resolved.names) })),
    ];
  }
  return [line(label, resolved.names[0])];
};

/** Dòng "Tài khoản gửi" cho khối gửi — chỉ hiện khi chính khối đó giữ id tài khoản (thường tài khoản nằm ở khối «Chọn tài khoản Zalo»). */
const describeOwnZaloAccount = (config, lookups, t) => {
  if (!text(config.zaloAccountId)) return [];
  const resolved = resolveZaloAccountNames({ zaloAccountId: config.zaloAccountId }, lookups, t);
  return resolved ? [line(t(`${PREFIX}.label.zaloAccount`), resolved.names[0], 'normal', 'sender')] : [];
};

const describeZaloPersonal = (config, lookups, t) => {
  const lines = describeOwnZaloAccount(config, lookups, t);
  const audienceFrom = lines.length;
  const recipientLabel = t(`${PREFIX}.label.recipients`);
  const source = text(config.zaloRecipientSource) || 'manual';
  const isUid = text(config.zaloRecipientType) === 'uid';
  if (source === 'manual') {
    const n = countListEntries(config.zaloRecipientPhones);
    lines.push(n > 0
      ? line(recipientLabel, t(`${PREFIX}.${isUid ? 'manualUids' : 'manualPhones'}`, { n }))
      : line(recipientLabel, t(`${PREFIX}.missing.${isUid ? 'uidList' : 'phoneList'}`), 'missing'));
  } else if (source === 'node') {
    lines.push(describeNodeSource(recipientLabel, config.zaloRecipientNodeId, config.zaloRecipientField, lookups, t));
  } else {
    lines.push(line(recipientLabel, t(`${PREFIX}.missing.recipientSource`), 'missing'));
  }
  lines.splice(audienceFrom, lines.length - audienceFrom, ...withRole('audience', lines.slice(audienceFrom)));
  const steps = Array.isArray(config.zaloPersonalTemplateSteps) ? config.zaloPersonalTemplateSteps : [];
  if (steps.length > 0) {
    lines.push(...describeTemplateSteps({
      steps,
      templates: lookups?.zaloTemplates,
      scheduled: text(config.zaloPersonalSendMode) === 'schedule',
    }, t));
  } else if (text(config.zaloMessage)) {
    lines.push(line(t(`${PREFIX}.label.content`), t(`${PREFIX}.typedMessage`, { text: excerpt(config.zaloMessage) }), 'normal', 'content'));
  } else {
    lines.push(line(t(`${PREFIX}.label.step`, { n: 1 }), t(`${PREFIX}.missing.zaloContent`), 'missing', 'content'));
  }
  return lines;
};

const describeZaloFriendRequest = (config, lookups, t) => {
  const lines = describeOwnZaloAccount(config, lookups, t);
  const audienceFrom = lines.length;
  const recipientLabel = t(`${PREFIX}.label.recipients`);
  const source = text(config.zaloFriendSource) || 'manual';
  if (source === 'manual') {
    const n = countListEntries(config.zaloFriendPhones);
    lines.push(n > 0
      ? line(recipientLabel, t(`${PREFIX}.manualPhones`, { n }))
      : line(recipientLabel, t(`${PREFIX}.missing.phoneList`), 'missing'));
  } else if (source === 'node') {
    lines.push(describeNodeSource(recipientLabel, config.zaloFriendNodeId, config.zaloFriendField, lookups, t));
  } else {
    lines.push(line(recipientLabel, t(`${PREFIX}.missing.recipientSource`), 'missing'));
  }
  lines.splice(audienceFrom, lines.length - audienceFrom, ...withRole('audience', lines.slice(audienceFrom)));
  const contentLabel = t(`${PREFIX}.label.requestMessage`);
  if ((text(config.zaloFriendContentMode) || 'manual') === 'template') {
    lines.push(text(config.zaloFriendTemplateId)
      ? line(contentLabel, templateName(lookups?.zaloTemplates, config.zaloFriendTemplateId, t), 'normal', 'content')
      : line(contentLabel, t(`${PREFIX}.missing.friendTemplate`), 'missing', 'content'));
  } else {
    lines.push(text(config.zaloFriendRequestMessage)
      ? line(contentLabel, t(`${PREFIX}.typedMessage`, { text: excerpt(config.zaloFriendRequestMessage) }), 'normal', 'content')
      : line(contentLabel, t(`${PREFIX}.missing.friendMessage`), 'missing', 'content'));
  }
  return lines;
};

/** Số nhóm đã chọn ở khối «Lấy danh sách nhóm» (rỗng + chưa khoá = TẤT CẢ nhóm — đúng như lúc chạy). */
const describeGroupSelection = (config, t) => {
  const ids = (Array.isArray(config.zaloSelectedGroupIds) ? config.zaloSelectedGroupIds : []).map(text).filter(Boolean);
  if (ids.length > 0) return { tone: 'normal', value: t(`${PREFIX}.groupsSelected`, { n: ids.length }) };
  if (config.zaloGroupSelectionSnapshotLocked) return { tone: 'missing', value: t(`${PREFIX}.missing.groups`) };
  return { tone: 'normal', value: t(`${PREFIX}.groupsAll`) };
};

const describeGetAllGroups = (config, lookups, t) => {
  const lines = [];
  const accountLabel = t(`${PREFIX}.label.zaloAccount`);
  const accountNode = findNode(lookups, config.zaloGroupAccountNodeId);
  const resolved = resolveZaloAccountNames(
    accountNode ? (accountNode.data?.config || {}) : config,
    lookups,
    t,
  );
  if (resolved && resolved.names.length > 0) {
    lines.push(line(accountLabel, resolved.pool
      ? t(`${PREFIX}.zaloPool`, { n: resolved.names.length, names: joinShown(resolved.names) })
      : resolved.names[0], 'normal', 'other'));
  } else if (accountNode) {
    lines.push(line(accountLabel, t(`${PREFIX}.fromAccountNode`, { node: nodeTitle(accountNode, t) }), 'normal', 'other'));
  }
  const selection = describeGroupSelection(config, t);
  lines.push(line(t(`${PREFIX}.label.groups`), selection.value, selection.tone));
  return lines;
};

const describeZaloGroup = (config, lookups, t) => {
  const lines = describeOwnZaloAccount(config, lookups, t);
  const audienceFrom = lines.length;
  const label = t(`${PREFIX}.label.groups`);
  const source = text(config.zaloGroupSource) || 'manual';
  if (source === 'manual') {
    const n = countListEntries(config.zaloGroupIds);
    lines.push(n > 0
      ? line(label, t(`${PREFIX}.groupsSelected`, { n }))
      : line(label, t(`${PREFIX}.missing.groupList`), 'missing'));
  } else if (source === 'node') {
    const node = findNode(lookups, config.zaloGroupNodeId);
    if (!text(config.zaloGroupNodeId)) {
      lines.push(line(label, t(`${PREFIX}.missing.sourceNode`), 'missing'));
    } else if (!node) {
      lines.push(line(label, t(`${PREFIX}.missing.sourceNodeGone`), 'missing'));
    } else if ((node.data?.nodeType || node.type) === 'get_all_groups') {
      const selection = describeGroupSelection(node.data?.config || {}, t);
      lines.push(line(label, t(`${PREFIX}.groupsFromNode`, { node: nodeTitle(node, t), summary: selection.value }), selection.tone));
    } else {
      lines.push(line(label, t(`${PREFIX}.fromNode`, { node: nodeTitle(node, t), field: text(config.zaloGroupField) || 'groupId' })));
    }
  } else {
    lines.push(line(label, t(`${PREFIX}.missing.recipientSource`), 'missing'));
  }
  lines.splice(audienceFrom, lines.length - audienceFrom, ...withRole('audience', lines.slice(audienceFrom)));
  const steps = Array.isArray(config.zaloGroupTemplateSteps) ? config.zaloGroupTemplateSteps : [];
  if (steps.length > 0) {
    lines.push(...describeTemplateSteps({
      steps,
      templates: lookups?.zaloTemplates,
      scheduled: text(config.zaloGroupSendMode) === 'schedule',
    }, t));
  } else if (text(config.zaloGroupMessage)) {
    lines.push(line(t(`${PREFIX}.label.content`), t(`${PREFIX}.typedMessage`, { text: excerpt(config.zaloGroupMessage) }), 'normal', 'content'));
  } else {
    lines.push(line(t(`${PREFIX}.label.step`, { n: 1 }), t(`${PREFIX}.missing.zaloGroupContent`), 'missing', 'content'));
  }
  return lines;
};

const describeGetAllFriends = (config, lookups, t) => {
  const lines = [];
  const accountNode = findNode(lookups, config.zaloFriendAccountNodeId);
  if (accountNode) {
    const resolved = resolveZaloAccountNames(accountNode.data?.config || {}, lookups, t);
    lines.push(line(
      t(`${PREFIX}.label.zaloAccount`),
      resolved && resolved.names.length > 0
        ? (resolved.pool ? t(`${PREFIX}.zaloPool`, { n: resolved.names.length, names: joinShown(resolved.names) }) : resolved.names[0])
        : t(`${PREFIX}.fromAccountNode`, { node: nodeTitle(accountNode, t) }),
      'normal',
      'other',
    ));
  }
  const mode = text(config.zaloFriendSelectionMode) || 'all';
  const n = (Array.isArray(mode === 'all_exclude' ? config.zaloExcludedFriendIds : config.zaloSelectedFriendIds)
    ? (mode === 'all_exclude' ? config.zaloExcludedFriendIds : config.zaloSelectedFriendIds)
    : []).length;
  const label = t(`${PREFIX}.label.friends`);
  if (mode === 'fixed') {
    lines.push(n > 0
      ? line(label, t(`${PREFIX}.friendsSelected`, { n }))
      : line(label, t(`${PREFIX}.missing.friends`), 'missing'));
  } else if (mode === 'all_exclude') {
    lines.push(line(label, n > 0 ? t(`${PREFIX}.friendsAllExcept`, { n }) : t(`${PREFIX}.friendsAll`)));
  } else {
    lines.push(line(label, t(`${PREFIX}.friendsAll`)));
  }
  return lines;
};

/** Nhịp chờ của tin Telegram / WhatsApp: tin đầu gửi ngay, tin sau chờ sau tin trước. */
const describeChannelStepTiming = (step, index, t) => {
  if (index === 0) return t(`${PREFIX}.timing.now`);
  const n = Number.parseInt(step?.delayValue, 10) || 0;
  if (n <= 0) return t(`${PREFIX}.timing.rightAfterPrev`);
  return t(`${PREFIX}.timing.afterPrev`, { wait: formatWait(n, step?.delayUnit || 'minutes', t) });
};

const describeChannelSteps = (config, lookups, t) => {
  const steps = Array.isArray(config.steps) ? config.steps : [];
  const hasContent = (step) => text(step?.templateId) || text(step?.message);
  if (steps.length === 0 || !steps.some(hasContent)) {
    return [line(t(`${PREFIX}.label.step`, { n: 1 }), t(`${PREFIX}.missing.channelMessage`), 'missing', 'content')];
  }
  return steps.map((step, index) => {
    const label = t(`${PREFIX}.label.step`, { n: index + 1 });
    if (!hasContent(step)) return line(label, t(`${PREFIX}.missing.channelMessage`), 'missing', 'content');
    const body = text(step.templateId)
      ? templateName(lookups?.zaloTemplates, step.templateId, t)
      : t(`${PREFIX}.typedMessage`, { text: excerpt(step.message) });
    return line(label, `${body} · ${describeChannelStepTiming(step, index, t)}`, 'normal', 'content');
  });
};

/** Người nhận Telegram / WhatsApp theo nguồn đã lưu. */
const describeChannelRecipients = (config, lookups, t, channel) => withRole('audience', [describeChannelRecipientsRaw(config, lookups, t, channel)])[0];

const describeChannelRecipientsRaw = (config, lookups, t, channel) => {
  const label = t(`${PREFIX}.label.recipients`);
  const source = text(config.recipientSource);
  const conversations = `${channel}_conversations`;
  const groups = `${channel}_groups`;
  if (source === conversations || (!source && channel)) return line(label, t(`${PREFIX}.${channel}Conversations`));
  if (source === groups) {
    const n = countListEntries(config.recipientKeys);
    return n > 0
      ? line(label, t(`${PREFIX}.groupsSelected`, { n }))
      : line(label, t(`${PREFIX}.missing.groups`), 'missing');
  }
  if (source === 'manual') {
    const n = countListEntries(config.recipientKeys);
    return n > 0
      ? line(label, t(`${PREFIX}.manualChats`, { n }))
      : line(label, t(`${PREFIX}.missing.chatList`), 'missing');
  }
  if (source === 'node') return describeNodeSource(label, config.recipientNodeId, config.recipientColumn || config.recipientField, lookups, t);
  return line(label, t(`${PREFIX}.missing.recipientSource`), 'missing');
};

const describeTelegram = (config, lookups, t) => {
  const label = t(`${PREFIX}.label.telegramAccount`);
  const id = text(config.telegramAccountId);
  const found = (Array.isArray(lookups?.telegramAccounts) ? lookups.telegramAccounts : []).find((item) => sameId(item?.id, id));
  const account = !id
    ? line(label, t(`${PREFIX}.missing.telegramAccount`), 'missing', 'sender')
    : line(label, found ? (text(found.username) ? `${text(found.name)} (@${text(found.username).replace(/^@/, '')})` : text(found.name)) : t(`${PREFIX}.accountById`, { id }), 'normal', 'sender');
  return [account, describeChannelRecipients(config, lookups, t, 'telegram'), ...describeChannelSteps(config, lookups, t)];
};

const describeWhatsApp = (config, lookups, t) => {
  const label = t(`${PREFIX}.label.whatsappAccount`);
  const key = text(config.whatsappSessionKey);
  const found = (Array.isArray(lookups?.whatsappAccounts) ? lookups.whatsappAccounts : []).find((item) => text(item?.sessionKey) === key);
  const account = !key
    ? line(label, t(`${PREFIX}.missing.whatsappAccount`), 'missing', 'sender')
    : line(label, text(found?.display) || t(`${PREFIX}.accountById`, { id: key }), 'normal', 'sender');
  return [account, describeChannelRecipients(config, lookups, t, 'whatsapp'), ...describeChannelSteps(config, lookups, t)];
};

const describeCondition = (config, lookups, t) => {
  const rules = (Array.isArray(config.rules) ? config.rules : []).filter((rule) => text(rule?.field));
  const label = t(`${PREFIX}.label.conditions`);
  if (rules.length === 0) return [line(label, t(`${PREFIX}.missing.conditions`), 'missing')];
  return [
    line(t(`${PREFIX}.label.matchMode`), t(`${PREFIX}.matchMode.${text(config.matchMode) === 'any' ? 'any' : 'all'}`)),
    line(label, t(`${PREFIX}.rulesCount`, { n: rules.length, first: rules[0].field })),
  ];
};

const describeTagContact = (config, lookups, t) => {
  const lines = [line(t(`${PREFIX}.label.action`), t(`${PREFIX}.tagAction.${text(config.tagAction) === 'remove' ? 'remove' : 'add'}`))];
  lines.push(text(config.tagName)
    ? line(t(`${PREFIX}.label.tag`), text(config.tagName))
    : line(t(`${PREFIX}.label.tag`), t(`${PREFIX}.missing.tagName`), 'missing'));
  const source = findNode(lookups, config.tagSourceNodeId);
  lines.push(source
    ? line(t(`${PREFIX}.label.contacts`), t(`${PREFIX}.fromNodeOnly`, { node: nodeTitle(source, t) }))
    : line(t(`${PREFIX}.label.contacts`), t(`${PREFIX}.missing.sourceNode`), 'missing'));
  return lines;
};

const describeUpdateAttribute = (config, lookups, t) => {
  const lines = [text(config.attributeField)
    ? line(t(`${PREFIX}.label.attribute`), text(config.attributeField))
    : line(t(`${PREFIX}.label.attribute`), t(`${PREFIX}.missing.attribute`), 'missing')];
  if (text(config.attributeValue)) lines.push(line(t(`${PREFIX}.label.newValue`), excerpt(config.attributeValue)));
  const source = findNode(lookups, config.attributeSourceNodeId);
  lines.push(source
    ? line(t(`${PREFIX}.label.contacts`), t(`${PREFIX}.fromNodeOnly`, { node: nodeTitle(source, t) }))
    : line(t(`${PREFIX}.label.contacts`), t(`${PREFIX}.missing.sourceNode`), 'missing'));
  return lines;
};

const describeReadSheet = (config, lookups, t) => {
  const lines = [text(config.sheetUrl)
    ? line(t(`${PREFIX}.label.sheet`), excerpt(config.sheetUrl, 64))
    : line(t(`${PREFIX}.label.sheet`), t(`${PREFIX}.missing.sheetUrl`), 'missing')];
  if (text(config.sheetName)) lines.push(line(t(`${PREFIX}.label.sheetTab`), text(config.sheetName)));
  return lines;
};

const describeSelectedIds = (ids, labelKey, missingKey, t) => {
  const n = (Array.isArray(ids) ? ids : []).length;
  return [n > 0
    ? line(t(`${PREFIX}.label.${labelKey}`), t(`${PREFIX}.selectedCount`, { n }))
    : line(t(`${PREFIX}.label.${labelKey}`), t(`${PREFIX}.missing.${missingKey}`), 'missing')];
};

const describeInterestedCustomers = (config, lookups, t) => {
  const type = text(config.interestedCustomerType) || 'interested';
  const typeKey = { all: 'nodeConfig.allCustomers', interested: 'nodeConfig.interestedStatus', purchased: 'nodeConfig.purchased', both: 'nodeConfig.both' }[type];
  const lines = [line(t(`${PREFIX}.label.customerType`), typeKey ? t(typeKey) : type)];
  const mode = text(config.interestedSelectionMode);
  const selected = Array.isArray(config.interestedSelectedCustomerIds) ? config.interestedSelectedCustomerIds.length : 0;
  const excluded = Array.isArray(config.interestedExcludedCustomerIds) ? config.interestedExcludedCustomerIds.length : 0;
  if (mode === 'fixed' || (!mode && selected > 0)) {
    lines.push(selected > 0
      ? line(t(`${PREFIX}.label.customers`), t(`${PREFIX}.customersSelected`, { n: selected }))
      : line(t(`${PREFIX}.label.customers`), t(`${PREFIX}.missing.customers`), 'missing'));
  } else if (mode === 'all_exclude' && excluded > 0) {
    lines.push(line(t(`${PREFIX}.label.customers`), t(`${PREFIX}.customersAllExcept`, { n: excluded })));
  } else {
    lines.push(line(t(`${PREFIX}.label.customers`), t(`${PREFIX}.customersAll`)));
  }
  if (Number(config.interestedLimit) > 0) lines.push(line(t(`${PREFIX}.label.limit`), t(`${PREFIX}.limitRecords`, { n: Number(config.interestedLimit) })));
  return lines;
};

const describeLandingLeads = (config, lookups, t) => {
  const slugs = (Array.isArray(config.landingLeadsSlugs) ? config.landingLeadsSlugs : []).map(text).filter(Boolean);
  const lines = [slugs.length > 0
    ? line(t(`${PREFIX}.label.landingPages`), joinShown(slugs))
    : line(t(`${PREFIX}.label.landingPages`), t(`${PREFIX}.landingAll`))];
  if (config.landingLeadsUseDateRange) {
    const from = text(config.landingLeadsDateFrom);
    const to = text(config.landingLeadsDateTo);
    lines.push(from && to
      ? line(t(`${PREFIX}.label.dateRange`), t(`${PREFIX}.dateRange`, { from, to }))
      : line(t(`${PREFIX}.label.dateRange`), t(`${PREFIX}.missing.dateRange`), 'missing'));
  }
  if (Number(config.landingLeadsLimit) > 0) lines.push(line(t(`${PREFIX}.label.limit`), t(`${PREFIX}.limitRecords`, { n: Number(config.landingLeadsLimit) })));
  return lines;
};

const describeFormSubmissions = (config, lookups, t) => {
  const ids = getFormIdsFromConfig(config);
  const lines = describeSelectedIds(ids, 'forms', 'forms', t);
  if (Number(config.formSubmissionsLimit) > 0) lines.push(line(t(`${PREFIX}.label.limit`), t(`${PREFIX}.limitRecords`, { n: Number(config.formSubmissionsLimit) })));
  return lines;
};

const describeSaveCustomer = (config, lookups, t) => {
  const fieldMap = config.saveCustomerFieldMap || {};
  const contactFields = ['email', 'phone', 'zaloId'].filter((key) => {
    const mapping = fieldMap[key] || {};
    if (mapping.mode === 'manual') return text(mapping.value);
    if (mapping.mode === 'node') return text(mapping.field);
    return false;
  });
  const sourceNodeId = text(config.saveCustomerNodeId)
    || text(Object.values(fieldMap).find((mapping) => mapping?.mode === 'node' && text(mapping?.nodeId))?.nodeId);
  const source = findNode(lookups, sourceNodeId);
  const lines = [source
    ? line(t(`${PREFIX}.label.dataSource`), t(`${PREFIX}.fromNodeOnly`, { node: nodeTitle(source, t) }))
    : line(t(`${PREFIX}.label.dataSource`), t(`${PREFIX}.missing.sourceNode`), 'missing')];
  lines.push(contactFields.length > 0
    ? line(t(`${PREFIX}.label.contactFields`), contactFields.map((key) => t(`${PREFIX}.contactField.${key}`)).join(', '))
    : line(t(`${PREFIX}.label.contactFields`), t(`${PREFIX}.missing.contactFields`), 'missing'));
  return lines;
};

/**
 * Vai mặc định của dòng KHÔNG ghi `role` riêng: khối nguồn → 'audience', chọn tài khoản → 'sender', khởi chạy → 'timing'.
 * Test ghim từng phần tử (`describeNodeSettings.spec.js`).
 */
export const DEFAULT_ROLE_BY_SUBTYPE = Object.freeze({
  manual_trigger: 'timing',
  select_zalo_account: 'sender',
  read_sheet: 'audience',
  read_courses_db: 'audience',
  read_products_db: 'audience',
  read_interested_customers: 'audience',
  read_landing_leads: 'audience',
  read_form_submissions: 'audience',
  get_all_friends: 'audience',
  get_all_groups: 'audience',
});

const DESCRIBERS = Object.freeze({
  manual_trigger: (config, lookups, t) => [line(t(`${PREFIX}.label.start`), t(`${PREFIX}.triggerManual`))],
  send_email: describeEmail,
  send_zalo_personal: describeZaloPersonal,
  send_zalo_friend_request: describeZaloFriendRequest,
  send_zalo_group: describeZaloGroup,
  send_telegram: describeTelegram,
  send_whatsapp: describeWhatsApp,
  condition: describeCondition,
  tag_contact: describeTagContact,
  update_attribute: describeUpdateAttribute,
  read_sheet: describeReadSheet,
  read_courses_db: (config, lookups, t) => describeSelectedIds(config.coursesDbSelectedIds, 'courses', 'courses', t),
  read_products_db: (config, lookups, t) => describeSelectedIds(config.productsDbSelectedIds, 'products', 'products', t),
  read_interested_customers: describeInterestedCustomers,
  read_landing_leads: describeLandingLeads,
  read_form_submissions: describeFormSubmissions,
  save_customer: describeSaveCustomer,
  select_zalo_account: describeSelectZaloAccount,
  get_all_friends: describeGetAllFriends,
  get_all_groups: describeGetAllGroups,
});

/**
 * @param {object} node nút ReactFlow `{ id, type, data: { label, nodeType, config } }`
 * @param {object} lookups dữ liệu tra tên đã tải: `emailTemplates`, `zaloTemplates`, `emailSettings`, `zaloAccounts`,
 *   `telegramAccounts`, `whatsappAccounts`, `nodes` (mọi khối của chiến dịch, để tra khối nguồn)
 * @param {(key: string, params?: object) => string} t
 * @returns {Array<{ label: string, value: string, tone: 'normal'|'missing', role: 'sender'|'audience'|'content'|'timing'|'other' }>}
 *   các dòng "Nhãn: giá trị"; khối lạ → một dòng chung
 */
export function describeNodeSettings(node, lookups, t) {
  const nodeType = text(node?.data?.nodeType || node?.type);
  const config = node?.data?.config && typeof node.data.config === 'object' ? node.data.config : {};
  const describer = Object.prototype.hasOwnProperty.call(DESCRIBERS, nodeType) ? DESCRIBERS[nodeType] : null;
  if (!describer) return [{ ...line(t(`${PREFIX}.label.settings`), t(`${PREFIX}.unknownNode`)), role: 'other' }];
  const fallbackRole = DEFAULT_ROLE_BY_SUBTYPE[nodeType] || 'other';
  return describer(config, lookups || {}, t).map((item) => ({ ...item, role: item.role || fallbackRole }));
}

export default describeNodeSettings;
