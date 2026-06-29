const compareFaces = async (cardFrontImageBuffer, selfieImageBuffer) => {
  if (!cardFrontImageBuffer || !selfieImageBuffer) {
    return {
      isMatch: false,
      score: 0,
      errorMessage: 'Both card front image and selfie image are required'
    };
  }

  // TODO Phase 4: Replace this placeholder with a real face matching provider.
  // This returns a controlled pass so the Phase 1 backend flow can be tested.
  return {
    isMatch: true,
    score: 0.8,
    errorMessage: null
  };
};

module.exports = {
  compareFaces
};
