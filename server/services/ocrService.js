const analyzeCitizenId = async (frontImageBuffer, backImageBuffer) => {
  if (!frontImageBuffer || !backImageBuffer) {
    return {
      isValid: false,
      errorMessage: 'Both front and back ID card images are required'
    };
  }

  // TODO Phase 2: Replace this placeholder with real OCR using tesseract.js.
  // Phase 1 keeps the service boundary ready without doing real OCR work yet.
  return {
    isValid: true,
    errorMessage: null
  };
};

module.exports = {
  analyzeCitizenId
};
