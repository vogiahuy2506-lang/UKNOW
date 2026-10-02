// Worker giả cho legacySpreadsheetParser.util.spec.js: quay vòng CPU mãi mãi (giống một tệp gây
// ReDoS) và không bao giờ trả kết quả — chỉ timeout + terminate() mới dừng được nó.
for (;;) {
  // cố ý để trống
}
