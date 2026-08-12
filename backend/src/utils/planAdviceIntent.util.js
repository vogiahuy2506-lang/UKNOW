/**
 * Deterministic plan-advice intent (M7).
 * Runs before sensitive-help; must not catch campaign "plan", incidents, or content creation.
 */

function canonicalize(text = '') {
  return String(text || '')
    .normalize('NFC')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Contrast / clause boundaries — negation must not kill a later advice clause. */
const CLAUSE_SPLIT_RE = /(?:[,.;:!?…—–]|[\n\r]+|\bmà\b|\bnhưng\b|\bnhung\b|\bbut\b|\binstead\b)+/iu;

/** Account/payment incidents only — not "billing plan" / subscription choice. */
const ACCOUNT_INCIDENT_RE =
  /payment\s+failed|cannot\s+(?:log\s*in|sign\s*in)|can't\s+(?:log\s*in|sign\s*in)|forgot\s+(?:my\s+)?password|không\s+đăng\s*nhập|khong\s+dang\s*nhap|quên\s*mật\s*khẩu|quen\s*mat\s*khau|thanh\s*toán\s*thất\s*bại|thanh\s*toan\s*that\s*bai|\brefund\b|hoàn\s*tiền|hoan\s*tien|\binvoice\b|hoá\s*đơn|hóa\s*đơn|\bvat\b|mã\s*số\s*thuế|ma\s*so\s*thue|tax\s*id|cách\s*thanh\s*toán|cach\s*thanh\s*toan|thanh\s*toán\s*gói|thanh\s*toan\s*goi|how\s+(?:do\s+i\s+)?(?:pay|make\s+a\s+payment)|billing\s+(?:issue|error|problem|failed)|payment\s+(?:issue|error|problem)/i;

const CONTENT_CREATION_GUARD_RE =
  /(?:viết|viet|soạn|soan|write|draft|compose|create|tạo|tao|build|upgrade\s+this)\s+.{0,80}(?:email|mail|tin(?:\s*nhắn)?|message|template|campaign|chiến\s*dịch|chien\s*dich|landing(?:\s*page)?|zalo)|(?:chiến\s*dịch|chien\s*dich|campaign|landing(?:\s*page)?).{0,48}(?:cho|for|về|ve|about).{0,40}(?:gói|goi|plan|starter|basic|professional|enterprise|pricing|bảng\s*giá|bang\s*gia)/i;

const CAMPAIGN_PLAN_RE =
  /(?:lập|lap|tạo|tao|create|viết|viet|soạn|soan|draft)\s+(?:a\s+|một\s+|mot\s+)?(?:campaign\s+plan|content\s+plan|kế\s*hoạch\s*chiến\s*dịch|ke\s*hoach\s*chien\s*dich)|(?:campaign|content)\s+plan\b|kế\s*hoạch\s*chiến\s*dịch|ke\s*hoach\s*chien\s*dich|lập\s*plan\b|lap\s*plan\b/i;

const CUSTOM_QUOTE_RE =
  /(?:mua\s*thêm|mua\s*them|add(?:\s+on)?|extra|báo\s*giá\s*custom|bao\s*gia\s*custom|custom\s+plan).{0,40}(?:zalo|email|landing|nhân\s*viên|nhan\s*vien|tài\s*khoản|tai\s*khoan)|(?:giá|gia|price|cost).{0,40}(?:custom\s+plan|gói\s*riêng|goi\s*rieng)/i;

const UPGRADE_NEGATION_RE =
  /(?:không|khong|đừng|dung|chưa|chua|không\s+muốn|khong\s+muon|don't|do\s*not|never|no)\s+(?:[\p{L}']+\s+){0,6}(?:nâng\s*gói|nang\s*goi|hạ\s*gói|ha\s*goi|upgrade|downgrade)/iu;

const PLAN_TOPIC_RE =
  /(?:gói\s*(?:dịch\s*vụ|dich\s*vu)?|goi\s*(?:dich\s*vu)?|bảng\s*giá|bang\s*gia|\bpricing\b|\bsubscription\b|\bbilling\s+plan\b|(?:subscription\s+)?plans?|\bstarter\b|\bbasic\b|\bprofessional\b|\benterprise\b|gói\s*trial|goi\s*trial)/i;

const CURRENT_PLAN_RE =
  /(?:gói|goi|plan|subscription).{0,24}(?:hiện\s*tại|hien\s*tai|đang\s*(?:dùng|dung|ở|o)|dang\s*(?:dung|o)|của\s*tôi|cua\s*toi|của\s*minh|cua\s*minh)|(?:tôi|toi|mình|minh).{0,24}(?:đang\s*(?:dùng|dung|ở|o)|dang\s*(?:dung|o)).{0,16}(?:gói|goi|plan|subscription)|what\s+(?:plan|subscription)\s+am\s+i\s+(?:currently\s+)?on|which\s+(?:plan|subscription)\s+am\s+i\s+(?:on|using)|my\s+current\s+(?:plan|subscription)|current\s+(?:plan|subscription)\b/i;

const COMPARE_RE =
  /(?:so\s*sánh|so\s*sanh|compare|vs\.?|versus|khác\s*gì|khac\s*gi|difference)/i;

const FIT_RE =
  /(?:phù\s*hợp|phu\s*hop|nên\s*chọn|nen\s*chon|nên\s*dùng|nen\s*dung|gói\s*nào|goi\s*nao|which\s+(?:plan|billing\s+plan|subscription)|what\s+(?:plan|subscription)|should\s+i\s+(?:choose|pick|get|upgrade)|recommend(?:ed)?\s+plan|best\s+plan|cho\s+(?:shop|cửa\s*hàng|cua\s*hang|doanh\s*nghiệp|doanh\s*nghiep))/i;

const PRICE_FEATURE_RE =
  /(?:giá|gia|bao\s*nhiêu|bao\s*nhieu|cost|price|how\s+much|tính\s*năng|tinh\s*nang|hạn\s*mức|han\s*muc|limit|quota|supports?|landing\s*pages?|emails?\s*per|zalo)/i;

const UPGRADE_RE =
  /(?:nâng\s*gói|nang\s*goi|hạ\s*gói|ha\s*goi|upgrade|downgrade|(?:switch|change)\s+(?:my\s+)?(?:plan|subscription))/i;

const LIST_PLANS_RE =
  /(?:bảng\s*giá|bang\s*gia|pricing).{0,40}(?:gói|goi|plans?|có\s*những|co\s*nhung|available)|(?:những|nhung|các|cac)\s+gói.{0,20}(?:hiện|hien|có|co|available)|(?:what|which)\s+plans?\s+(?:do\s+you\s+have|are\s+available|exist)/i;

/**
 * Drop clauses that only negate upgrade/downgrade so contrast clauses can still match.
 * "I do not want to upgrade, but compare Starter and Basic" → "compare Starter and Basic"
 */
function adviceTextWithoutNegatedUpgradeClauses(text = '') {
  const clauses = String(text || '')
    .split(CLAUSE_SPLIT_RE)
    .map((c) => c.trim())
    .filter(Boolean);
  if (!clauses.length) return '';
  const kept = clauses.filter((clause) => !UPGRADE_NEGATION_RE.test(clause));
  return kept.join('. ').trim();
}

function hasAdviceSignal(text = '') {
  if (!text) return false;
  if (CURRENT_PLAN_RE.test(text)) return true;
  if (LIST_PLANS_RE.test(text)) return true;
  if (!PLAN_TOPIC_RE.test(text)) return false;
  return (
    COMPARE_RE.test(text)
    || FIT_RE.test(text)
    || PRICE_FEATURE_RE.test(text)
    || UPGRADE_RE.test(text)
  );
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isPlanAdviceQuestion(text = '') {
  const question = canonicalize(text);
  if (!question) return false;

  if (ACCOUNT_INCIDENT_RE.test(question)) return false;
  if (CONTENT_CREATION_GUARD_RE.test(question)) return false;
  if (CAMPAIGN_PLAN_RE.test(question)) return false;
  if (CUSTOM_QUOTE_RE.test(question)) return false;

  const adviceText = adviceTextWithoutNegatedUpgradeClauses(question);
  // Pure upgrade negation with no remaining advice clause.
  if (!adviceText) return false;

  return hasAdviceSignal(adviceText);
}

export default { isPlanAdviceQuestion };
