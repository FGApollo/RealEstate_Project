// So tên đọc được trên CCCD (OCR) với tên môi giới tự khai.
const normalizePersonName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toUpperCase()
  .replace(/[^A-Z ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Chỉ coi là lệch khi có đủ cả hai tên; thiếu tên OCR thì không có gì để so.
const isNameMismatch = (ocrName, declaredName) => {
  const ocr = normalizePersonName(ocrName);
  const declared = normalizePersonName(declaredName);
  return Boolean(ocr && declared && ocr !== declared);
};

module.exports = { normalizePersonName, isNameMismatch };
