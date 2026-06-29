const sharp = require('sharp');

const MIN_IMAGE_BYTES = 1024;
const MIN_IMAGE_WIDTH = 180;
const MIN_IMAGE_HEIGHT = 180;
const MIN_SELFIE_SKIN_RATIO = 0.025;
const MIN_CARD_SKIN_RATIO = 0.01;
const MIN_MATCH_SCORE = 0.55;

const clampRegion = ({ left, top, width, height }, imageWidth, imageHeight) => ({
  left: Math.max(0, Math.min(imageWidth - 1, Math.round(left))),
  top: Math.max(0, Math.min(imageHeight - 1, Math.round(top))),
  width: Math.max(1, Math.min(imageWidth, Math.round(width))),
  height: Math.max(1, Math.min(imageHeight, Math.round(height)))
});

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
  }
]);

const getSelfieFaceRegion = (width, height) => clampRegion({
  left: width * 0.22,
  top: height * 0.12,
  width: width * 0.56,
  height: height * 0.68
}, width, height);

const isForcedDemoResult = () => {
  const mode = (process.env.KYC_FACE_MATCH_DEMO_RESULT || '').toLowerCase();
  if (mode === 'pass') return true;
  if (mode === 'fail') return false;
  return null;
};

const compareFaces = async (cardFrontImageBuffer, selfieImageBuffer) => {
  const forcedResult = isForcedDemoResult();
  if (forcedResult !== null) {
    return {
      isMatch: forcedResult,
      errorMessage: forcedResult ? null : 'Khuon mat khong khop voi CCCD'
    };
  }

  if (!cardFrontImageBuffer || !selfieImageBuffer) {
    return {
      isMatch: false,
      errorMessage: 'Thieu anh CCCD hoac anh selfie'
    };
  }

  if (cardFrontImageBuffer.length < MIN_IMAGE_BYTES || selfieImageBuffer.length < MIN_IMAGE_BYTES) {
    return {
      isMatch: false,
      errorMessage: 'Anh selfie hoac anh CCCD khong hop le'
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
        errorMessage: 'Anh selfie khong ro khuon mat'
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
        errorMessage: 'Khong tim thay khuon mat tren anh CCCD'
      };
    }

    const bestScore = Math.max(...usableCardProfiles.map((profile) => scoreProfiles(profile, selfieProfile)));

    if (bestScore < MIN_MATCH_SCORE) {
      return {
        isMatch: false,
        errorMessage: 'Khuon mat khong khop voi CCCD'
      };
    }

    return {
      isMatch: true,
      errorMessage: null
    };
  } catch (error) {
    console.error('Demo face comparison failed:', error);

    return {
      isMatch: false,
      errorMessage: 'Khong the xac minh khuon mat, vui long thu lai'
    };
  }
};

module.exports = {
  compareFaces
};
