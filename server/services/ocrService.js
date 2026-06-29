const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const MIN_WIDTH = 700;
const MIN_HEIGHT = 450;
const MIN_KEYWORD_MATCHES = 2;
const ID_NUMBER_PATTERN = /\b\d{12}\b/;

const QUALITY_LIMITS = {
  maxBrightPixelRatio: 0.35,
  minDarkPixelRatio: 0.01,
  minContrast: 30,
  minSharpness: 15,
  maxTiltRatio: 0.18
};

const FRONT_KEYWORDS = [
  'CAN CUOC CONG DAN',
  'CONG HOA XA HOI CHU NGHIA VIET NAM',
  'HO VA TEN',
  'NGAY SINH',
  'QUOC TICH',
  'SO'
];

const BACK_KEYWORDS = [
  'DAC DIEM NHAN DANG',
  'NGAY CAP',
  'NOI CAP',
  'CUC CANH SAT'
];

const normalizeText = (text = '') => text
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/Đ/g, 'D')
  .replace(/đ/g, 'd')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const variance = (values) => {
  if (!values.length) return 0;
  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
};

const getImageStats = async (imageBuffer) => {
  const image = sharp(imageBuffer).rotate();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid image metadata');
  }

  const analysisWidth = 180;
  const analysisHeight = Math.max(1, Math.round((metadata.height / metadata.width) * analysisWidth));
  const raw = await image
    .resize({ width: analysisWidth, withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(raw.data);
  const brightPixels = pixels.filter((value) => value >= 245).length;
  const darkPixels = pixels.filter((value) => value <= 35).length;
  const contrast = Math.sqrt(variance(pixels));

  const width = raw.info.width || analysisWidth;
  const height = raw.info.height || analysisHeight;
  let edgeEnergy = 0;
  let edgeCount = 0;
  const leftEdgeRows = [];
  const rightEdgeRows = [];

  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = y * width + x;
      const horizontal = Math.abs(pixels[index] - pixels[index - 1]);
      const vertical = Math.abs(pixels[index] - pixels[index - width]);
      const gradient = horizontal + vertical;

      edgeEnergy += gradient;
      edgeCount += 1;

      if (gradient > 80) {
        if (x < width * 0.2) leftEdgeRows.push(y);
        if (x > width * 0.8) rightEdgeRows.push(y);
      }
    }
  }

  const sharpness = edgeCount ? edgeEnergy / edgeCount : 0;
  const tiltRatio = leftEdgeRows.length > 15 && rightEdgeRows.length > 15
    ? Math.abs(average(leftEdgeRows) - average(rightEdgeRows)) / height
    : 0;

  return {
    width: metadata.width,
    height: metadata.height,
    brightPixelRatio: brightPixels / pixels.length,
    darkPixelRatio: darkPixels / pixels.length,
    contrast,
    sharpness,
    tiltRatio
  };
};

const validateImageQuality = async (imageBuffer, label) => {
  const stats = await getImageStats(imageBuffer);

  if (stats.width < MIN_WIDTH || stats.height < MIN_HEIGHT) {
    return `${label} co do phan giai qua thap, vui long chup ro hon`;
  }

  if (stats.brightPixelRatio > QUALITY_LIMITS.maxBrightPixelRatio && stats.darkPixelRatio < QUALITY_LIMITS.minDarkPixelRatio) {
    return `${label} bi loa sang, vui long chup lai`;
  }

  if (stats.contrast < QUALITY_LIMITS.minContrast) {
    return `${label} qua mo hoac thieu tuong phan, vui long chup lai`;
  }

  if (stats.sharpness < QUALITY_LIMITS.minSharpness) {
    return `${label} bi mo, vui long chup lai`;
  }

  if (stats.tiltRatio > QUALITY_LIMITS.maxTiltRatio) {
    return `${label} bi nghieng qua nhieu, vui long chup thang lai`;
  }

  return null;
};

const runOcr = async (imageBuffer) => {
  const result = await Tesseract.recognize(imageBuffer, 'vie+eng', {
    logger: () => {}
  });

  return result?.data?.text || '';
};

const countKeywordMatches = (text, keywords) => keywords.reduce((count, keyword) => (
  text.includes(keyword) ? count + 1 : count
), 0);

const analyzeCitizenId = async (frontImageBuffer, backImageBuffer) => {
  if (!frontImageBuffer || !backImageBuffer) {
    return {
      isValid: false,
      errorMessage: 'Vui long tai du anh mat truoc va mat sau CCCD'
    };
  }

  try {
    const frontQualityError = await validateImageQuality(frontImageBuffer, 'Anh mat truoc CCCD');
    if (frontQualityError) {
      return {
        isValid: false,
        errorMessage: frontQualityError
      };
    }

    const backQualityError = await validateImageQuality(backImageBuffer, 'Anh mat sau CCCD');
    if (backQualityError) {
      return {
        isValid: false,
        errorMessage: backQualityError
      };
    }

    const [frontText, backText] = await Promise.all([
      runOcr(frontImageBuffer),
      runOcr(backImageBuffer)
    ]);

    const normalizedFrontText = normalizeText(frontText);
    const normalizedBackText = normalizeText(backText);
    const combinedText = `${normalizedFrontText} ${normalizedBackText}`.trim();

    if (!combinedText) {
      return {
        isValid: false,
        errorMessage: 'Khong the doc thong tin tu anh CCCD, vui long chup ro hon'
      };
    }

    const idNumberMatch = combinedText.match(ID_NUMBER_PATTERN);
    if (!idNumberMatch) {
      return {
        isValid: false,
        errorMessage: 'Khong tim thay so CCCD hop le'
      };
    }

    const frontKeywordMatches = countKeywordMatches(normalizedFrontText, FRONT_KEYWORDS);
    const backKeywordMatches = countKeywordMatches(normalizedBackText, BACK_KEYWORDS);
    const totalKeywordMatches = frontKeywordMatches + backKeywordMatches;

    if (totalKeywordMatches < MIN_KEYWORD_MATCHES) {
      return {
        isValid: false,
        errorMessage: 'Anh khong co du dau hieu la CCCD Viet Nam'
      };
    }

    return {
      isValid: true,
      errorMessage: null
    };
  } catch (error) {
    console.error('Citizen ID OCR failed:', error);

    return {
      isValid: false,
      errorMessage: 'Khong the doc thong tin tu anh CCCD, vui long chup ro hon'
    };
  }
};

module.exports = {
  analyzeCitizenId
};
