/**
 * Danh sách cột có thể chọn cho node «khách quan tâm» (khớp field API/DB).
 */
export const INTERESTED_CUSTOMER_COLUMN_OPTIONS = [
  { key: 'id', label: 'id (bản ghi purchase)' },
  { key: 'customerId', label: 'customerId' },
  { key: 'courseId', label: 'courseId' },
  { key: 'campaignId', label: 'campaignId' },
  { key: 'orderId', label: 'orderId' },
  { key: 'productName', label: 'productName' },
  { key: 'productType', label: 'productType' },
  { key: 'amount', label: 'amount' },
  { key: 'currency', label: 'currency' },
  { key: 'paymentMethod', label: 'paymentMethod' },
  { key: 'purchaseDate', label: 'purchaseDate' },
  { key: 'orderStatus', label: 'orderStatus' },
  { key: 'fullName', label: 'fullName' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'zaloId', label: 'zaloId' },
  { key: 'zaloPhone', label: 'zaloPhone' },
  { key: 'customerSource', label: 'customerSource' },
  { key: 'courseName', label: 'courseName' },
  { key: 'courseCode', label: 'courseCode' },
  { key: 'campaignName', label: 'campaignName' },
];

/**
 * Danh sách cột lead landing (khớp `mapLeadRowToCampaignItem`).
 */
export const LANDING_LEAD_COLUMN_OPTIONS = [
  { key: 'leadId', label: 'leadId' },
  { key: 'id', label: 'id' },
  { key: 'lastName', label: 'lastName (họ)' },
  { key: 'firstName', label: 'firstName (tên)' },
  { key: 'fullName', label: 'fullName' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'occupation', label: 'occupation' },
  { key: 'interestArea', label: 'interestArea' },
  { key: 'marketingConsent', label: 'marketingConsent' },
  { key: 'createdAt', label: 'createdAt' },
];
