// Worker giả cho legacySpreadsheetParser.util.spec.js: cấp phát bộ nhớ không ngừng (giống một tệp
// làm bộ đọc phình heap) để chạm `resourceLimits.maxOldGenerationSizeMb`.
const hog = [];
for (;;) {
  hog.push(new Array(100_000).fill(hog.length));
}
