const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

const MIN_IMAGE_BYTES = 1024;
const MIN_IMAGE_WIDTH = 180;
const MIN_IMAGE_HEIGHT = 180;
const MIN_SELFIE_SKIN_RATIO = 0.025;
const MIN_CARD_SKIN_RATIO = 0.01;
const MIN_MATCH_SCORE = 0.8;
const FACEPP_MAX_IMAGE_SIZE = 1024;
const FACEPP_CARD_FACE_SIZE = 640;
const DEFAULT_FACEPP_TIMEOUT_MS = 60000;
const CARD_FACE_MIN_SKIN_RATIO = 0.006;
const DEFAULT_FACEPP_API_URL = 'https://api-us.faceplusplus.com/facepp/v3/compare';
const DEFAULT_FACEPP_CONFIDENCE_THRESHOLD = 75;
const CLEAR_FACE_ERROR_MESSAGE = 'Khong tim thay khuon mat ro rang, vui long chup lai';
const FACE_VERIFY_ERROR_MESSAGE = 'Khong the xac minh khuon mat, vui long thu lai';

const clampRegion = ({ left, top, width, height }, imageWidth, imageHeight) => {
  const safeLeft = Math.max(0, Math.min(imageWidth - 1, Math.round(left)));
  const safeTop = Math.max(0, Math.min(imageHeight - 1, Math.round(top)));

  return {
    left: safeLeft,
    top: safeTop,
    width: Math.max(1, Math.min(imageWidth - safeLeft, Math.round(width))),
    height: Math.max(1, Math.min(imageHeight - safeTop, Math.round(height)))
  };
};

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getImageMetadata = async (imageBuffer) => {
  const metadata = await sharp(imageBuffer).rotate().metadata();

  if (!metadata.width || !metadata.height || metadata.width < MIN_IMAGE_WIDTH || metadata.height < MIN_IMAGE_HEIGHT) {
    throw new Error('Image is too small');
  }

  return metadata;
};

const isSkinLikePixel = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  return r > 55
    && g > 35
    && b > 20
    && r > b
    && max - min > 12
    && r - g > -15
    && r - b > 8;
};

const getRegionSkinProfile = async (imageBuffer, region) => {
  const raw = await sharp(imageBuffer)
    .rotate()
    .extract(region)
    .resize({ width: 120, height: 120, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const redValues = [];
  const greenValues = [];
  const blueValues = [];
  const brightnessValues = [];
  const pixelCount = raw.data.length / raw.info.channels;

  for (let index = 0; index < raw.data.length; index += raw.info.channels) {
    const r = raw.data[index];
    const g = raw.data[index + 1];
    const b = raw.data[index + 2];

    if (isSkinLikePixel(r, g, b)) {
      redValues.push(r);
      greenValues.push(g);
      blueValues.push(b);
      brightnessValues.push((r + g + b) / 3);
    }
  }

  return {
    skinRatio: pixelCount ? redValues.length / pixelCount : 0,
    red: average(redValues),
    green: average(greenValues),
    blue: average(blueValues),
    brightness: average(brightnessValues)
  };
};

const colorDistance = (first, second) => Math.sqrt(
  ((first.red - second.red) ** 2)
  + ((first.green - second.green) ** 2)
  + ((first.blue - second.blue) ** 2)
);

const scoreProfiles = (cardProfile, selfieProfile) => {
  const colorScore = Math.max(0, 1 - (colorDistance(cardProfile, selfieProfile) / 120));
  const brightnessScore = Math.max(0, 1 - (Math.abs(cardProfile.brightness - selfieProfile.brightness) / 120));
  const skinPresenceScore = Math.min(1, (cardProfile.skinRatio / 0.08) + (selfieProfile.skinRatio / 0.25)) / 2;

  return (colorScore * 0.55) + (brightnessScore * 0.25) + (skinPresenceScore * 0.2);
};

const getCardFaceCandidates = (width, height) => ([
  {
    left: width * 0.07,
    top: height * 0.32,
    width: width * 0.33,
    height: height * 0.52
  },
  {
    left: width * 0.76,
    top: height * 0.08,
    width: width * 0.22,
    height: height * 0.32
  },
  {
    left: width * 0.05,
    top: height * 0.18,
    width: width * 0.42,
    height: height * 0.66
  },
  {
    left: width * 0.02,
    top: height * 0.25,
    width: width * 0.36,
    height: height * 0.62
  },
  {
    left: width * 0.68,
    top: height * 0.04,
    width: width * 0.30,
    height: height * 0.42
  }
]);

const getSelfieFaceRegion = (width, height) => clampRegion({
  left: width * 0.22,
  top: height * 0.12,
  width: width * 0.56,
  height: height * 0.68
}, width, height);

const isForcedDemoResult = () => {
  const mode = (process.env.KYC_FACE_MATCH_DEMO_RESULT || process.env.KYC_DEMO_MODE || '').toLowerCase();
  if (mode === 'pass' || mode === 'true') return true;
  if (mode === 'fail' || mode === 'false') return false;
  return null;
};

const shouldUseFacePlusPlusProvider = () => (
  (process.env.KYC_FACE_MATCH_PROVIDER || '').toLowerCase() === 'facepp'
);

const hasFacePlusPlusConfig = () => (
  Boolean(process.env.FACEPP_API_KEY)
  && Boolean(process.env.FACEPP_API_SECRET)
);

const getFacePlusPlusConfidenceThreshold = () => {
  const parsedThreshold = Number(process.env.KYC_FACE_MATCH_THRESHOLD);
  if (!Number.isFinite(parsedThreshold) || parsedThreshold <= 0 || parsedThreshold > 100) {
    return DEFAULT_FACEPP_CONFIDENCE_THRESHOLD;
  }

  return parsedThreshold;
};

const isFacePlusPlusFaceMissingError = (errorMessage = '') => {
  const normalizedMessage = errorMessage.toUpperCase();
  return normalizedMessage.includes('NO_FACE_FOUND')
    || normalizedMessage.includes('INVALID_IMAGE')
    || normalizedMessage.includes('IMAGE_ERROR')
    || normalizedMessage.includes('INVALID_IMAGE_SIZE')
    || normalizedMessage.includes('IMAGE_FILE_TOO_LARGE');
};

const getFacePlusPlusTimeoutMs = () => {
  const parsedTimeout = Number(process.env.FACEPP_TIMEOUT_MS);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout < 10000 || parsedTimeout > 120000) {
    return DEFAULT_FACEPP_TIMEOUT_MS;
  }

  return parsedTimeout;
};

const normalizeImageForFacePlusPlus = async (imageBuffer) => sharp(imageBuffer)
  .rotate()
  .resize({
    width: FACEPP_MAX_IMAGE_SIZE,
    height: FACEPP_MAX_IMAGE_SIZE,
    fit: 'inside',
    withoutEnlargement: true
  })
  .jpeg({ quality: 86 })
  .toBuffer();

const buildCardOrientationCandidates = async (cardFrontImageBuffer) => {
  const autoRotatedBuffer = await sharp(cardFrontImageBuffer).rotate().toBuffer();

  return Promise.all([0, 90, 180, 270].map(async (rotation) => {
    const buffer = rotation === 0
      ? autoRotatedBuffer
      : await sharp(autoRotatedBuffer).rotate(rotation).toBuffer();
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid card image metadata');
    }

    return {
      buffer,
      width: metadata.width,
      height: metadata.height,
      rotation
    };
  }));
};

const prepareCardFaceForFacePlusPlus = async (cardFrontImageBuffer) => {
  const orientationCandidates = await buildCardOrientationCandidates(cardFrontImageBuffer);
  const scoredCandidates = (await Promise.all(
    orientationCandidates.flatMap((orientation) => getCardFaceCandidates(orientation.width, orientation.height)
      .map((candidate) => clampRegion(candidate, orientation.width, orientation.height))
      .map(async (region) => {
        const profile = await getRegionSkinProfile(orientation.buffer, region);
        const isLandscape = orientation.width >= orientation.height;

        return {
          orientation,
          region,
          profile,
          score: profile.skinRatio + (isLandscape ? 0.002 : 0)
        };
      }))
  ));

  const bestCandidate = scoredCandidates
    .sort((first, second) => second.score - first.score)[0];

  if (!bestCandidate || bestCandidate.profile.skinRatio < CARD_FACE_MIN_SKIN_RATIO) {
    console.warn('Could not confidently crop card portrait for Face++. Sending normalized full card image.');
    const defaultOrientation = orientationCandidates.find((candidate) => candidate.width >= candidate.height)
      || orientationCandidates[0];
    const normalizedFullCard = await normalizeImageForFacePlusPlus(defaultOrientation.buffer);
    return {
      buffer: normalizedFullCard,
      usedCrop: false,
      rotation: defaultOrientation.rotation
    };
  }

  const faceBuffer = await sharp(bestCandidate.orientation.buffer)
    .extract(bestCandidate.region)
    .resize({
      width: FACEPP_CARD_FACE_SIZE,
      height: FACEPP_CARD_FACE_SIZE,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    buffer: faceBuffer,
    usedCrop: true,
    rotation: bestCandidate.orientation.rotation,
    skinRatio: bestCandidate.profile.skinRatio
  };
};

const compareFacesWithFacePlusPlus = async (cardFrontImageBuffer, selfieImageBuffer) => {
  if (!cardFrontImageBuffer || !selfieImageBuffer) {
    return {
      isMatch: false,
      errorMessage: 'Thieu anh CCCD hoac anh selfie',
      provider: 'facepp'
    };
  }

  if (cardFrontImageBuffer.length < MIN_IMAGE_BYTES || selfieImageBuffer.length < MIN_IMAGE_BYTES) {
    return {
      isMatch: false,
      errorMessage: 'Anh selfie hoac anh CCCD khong hop le',
      provider: 'facepp'
    };
  }

  try {
    const threshold = getFacePlusPlusConfidenceThreshold();
    const [preparedCardFace, preparedSelfieImage] = await Promise.all([
      prepareCardFaceForFacePlusPlus(cardFrontImageBuffer),
      normalizeImageForFacePlusPlus(selfieImageBuffer)
    ]);

    const form = new FormData();
    form.append('api_key', process.env.FACEPP_API_KEY);
    form.append('api_secret', process.env.FACEPP_API_SECRET);
    form.append('image_file1', preparedCardFace.buffer, {
      filename: preparedCardFace.usedCrop ? 'card-face.jpg' : 'card-front.jpg',
      contentType: 'image/jpeg'
    });
    form.append('image_file2', preparedSelfieImage, {
      filename: 'selfie.jpg',
      contentType: 'image/jpeg'
    });

    const response = await axios.post(
      process.env.FACEPP_API_URL || DEFAULT_FACEPP_API_URL,
      form,
      {
        headers: form.getHeaders(),
        timeout: getFacePlusPlusTimeoutMs(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    const confidence = Number(response.data?.confidence);
    if (!Number.isFinite(confidence)) {
      return {
        isMatch: false,
        errorMessage: CLEAR_FACE_ERROR_MESSAGE,
        provider: 'facepp'
      };
    }

    const isMatch = confidence >= threshold;

    return {
      isMatch,
      errorMessage: isMatch ? null : 'Khuon mat khong khop voi CCCD',
      provider: 'facepp',
      confidence,
      threshold,
      cardFaceCropUsed: preparedCardFace.usedCrop,
      cardRotationApplied: preparedCardFace.rotation
    };
  } catch (error) {
    const facePlusPlusErrorMessage = error?.response?.data?.error_message || '';
    if (isFacePlusPlusFaceMissingError(facePlusPlusErrorMessage)) {
      return {
        isMatch: false,
        errorMessage: CLEAR_FACE_ERROR_MESSAGE,
        provider: 'facepp'
      };
    }

    console.error('Face++ Compare API failed:', facePlusPlusErrorMessage || error?.message || error?.name || error);

    return {
      isMatch: false,
      errorMessage: FACE_VERIFY_ERROR_MESSAGE,
      provider: 'facepp'
    };
  }
};

const compareFacesWithDemo = async (cardFrontImageBuffer, selfieImageBuffer) => {
  const forcedResult = isForcedDemoResult();
  if (forcedResult !== null) {
    return {
      isMatch: forcedResult,
      errorMessage: forcedResult ? null : 'Khuon mat khong khop voi CCCD',
      provider: 'demo'
    };
  }

  if (!cardFrontImageBuffer || !selfieImageBuffer) {
    return {
      isMatch: false,
      errorMessage: 'Thieu anh CCCD hoac anh selfie',
      provider: 'demo'
    };
  }

  if (cardFrontImageBuffer.length < MIN_IMAGE_BYTES || selfieImageBuffer.length < MIN_IMAGE_BYTES) {
    return {
      isMatch: false,
      errorMessage: 'Anh selfie hoac anh CCCD khong hop le',
      provider: 'demo'
    };
  }

  try {
    const [cardMetadata, selfieMetadata] = await Promise.all([
      getImageMetadata(cardFrontImageBuffer),
      getImageMetadata(selfieImageBuffer)
    ]);

    const selfieProfile = await getRegionSkinProfile(
      selfieImageBuffer,
      getSelfieFaceRegion(selfieMetadata.width, selfieMetadata.height)
    );

    if (selfieProfile.skinRatio < MIN_SELFIE_SKIN_RATIO) {
      return {
        isMatch: false,
        errorMessage: 'Anh selfie khong ro khuon mat',
        provider: 'demo'
      };
    }

    const cardProfiles = await Promise.all(
      getCardFaceCandidates(cardMetadata.width, cardMetadata.height)
        .map((candidate) => getRegionSkinProfile(
          cardFrontImageBuffer,
          clampRegion(candidate, cardMetadata.width, cardMetadata.height)
        ))
    );

    const usableCardProfiles = cardProfiles.filter((profile) => profile.skinRatio >= MIN_CARD_SKIN_RATIO);
    if (!usableCardProfiles.length) {
      return {
        isMatch: false,
        errorMessage: 'Khong tim thay khuon mat tren anh CCCD',
        provider: 'demo'
      };
    }

    const bestScore = Math.max(...usableCardProfiles.map((profile) => scoreProfiles(profile, selfieProfile)));

    if (bestScore < MIN_MATCH_SCORE) {
      return {
        isMatch: false,
        errorMessage: 'Khuon mat khong khop voi CCCD',
        provider: 'demo'
      };
    }

    return {
      isMatch: true,
      errorMessage: null,
      provider: 'demo'
    };
  } catch (error) {
    console.error('Demo face comparison failed:', error);

    return {
      isMatch: false,
      errorMessage: FACE_VERIFY_ERROR_MESSAGE,
      provider: 'demo'
    };
  }
};

const compareFaces = async (cardFrontImageBuffer, selfieImageBuffer) => {
  if (shouldUseFacePlusPlusProvider()) {
    if (hasFacePlusPlusConfig()) {
      return compareFacesWithFacePlusPlus(cardFrontImageBuffer, selfieImageBuffer);
    }

    console.warn('KYC_FACE_MATCH_PROVIDER is facepp but Face++ configuration is missing. Falling back to demo face comparison.');
  }

  return compareFacesWithDemo(cardFrontImageBuffer, selfieImageBuffer);
};

module.exports = {
  compareFaces
};
