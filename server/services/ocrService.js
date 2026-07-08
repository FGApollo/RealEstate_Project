const sharp = require('sharp');
const Tesseract = require('tesseract.js');

const MIN_WIDTH = 700;
const MIN_HEIGHT = 450;
const OCR_ROTATION_DEGREES = [0, 90, 180, 270];
const DEFAULT_MIN_VALID_FIELDS = 5;
const DEFAULT_REQUIRED_FIELDS = ['idNumber', 'fullName', 'dob'];
const ID_NUMBER_PATTERN = /\b\d{12}\b/;
const DATE_PATTERN = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/;

const QUALITY_LIMITS = {
  maxBrightPixelRatio: 0.35,
  minDarkPixelRatio: 0.01,
  minContrast: 30,
  minSharpness: 15,
  maxTiltRatio: 0.18
};

const BACK_SIDE_KEYWORDS = [
  'DAC DIEM NHAN DANG',
  'PERSONAL IDENTIFICATION CHARACTERISTICS',
  'NGAY CAP',
  'DATE OF ISSUE',
  'NOI CAP',
  'CUC CANH SAT',
  'FINGERPRINTS',
  'VAN TAY',
  'LEFT INDEX',
  'RIGHT INDEX',
  'DATE OF EXPIRY',
  'NGAY HET HAN'
];

const normalizeText = (text = '') => text
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/Đ/g, 'D')
  .replace(/đ/g, 'd')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

const normalizeLine = (line = '') => normalizeText(line)
  .replace(/[|:;]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeDate = (dateValue) => {
  const match = dateValue?.match(DATE_PATTERN);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
};

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
    tiltRatio,
    analysisHeight
  };
};

const getImageQualityResult = async (imageBuffer, label) => {
  const stats = await getImageStats(imageBuffer);
  const warnings = [];
  const longSide = Math.max(stats.width, stats.height);
  const shortSide = Math.min(stats.width, stats.height);

  if (longSide < MIN_WIDTH || shortSide < MIN_HEIGHT) {
    return {
      hardError: `${label} co do phan giai qua thap, vui long chup ro hon`,
      warnings,
      stats
    };
  }

  if (stats.brightPixelRatio > QUALITY_LIMITS.maxBrightPixelRatio && stats.darkPixelRatio < QUALITY_LIMITS.minDarkPixelRatio) {
    warnings.push(`${label} hoi bi loa sang nhung van se thu doc OCR`);
  }

  if (stats.contrast < QUALITY_LIMITS.minContrast) {
    warnings.push(`${label} hoi mo hoac thieu tuong phan nhung van se thu doc OCR`);
  }

  if (stats.sharpness < QUALITY_LIMITS.minSharpness) {
    warnings.push(`${label} hoi mo nhung van se thu doc OCR`);
  }

  if (stats.tiltRatio > QUALITY_LIMITS.maxTiltRatio) {
    warnings.push(`${label} hoi nghieng nhung van se thu doc OCR`);
  }

  return {
    hardError: null,
    warnings,
    stats
  };
};

const runOcr = async (imageBuffer) => {
  const result = await Tesseract.recognize(imageBuffer, 'vie+eng', {
    logger: () => {}
  });

  return result?.data?.text || '';
};

const rotateImageBuffer = async (imageBuffer, degrees) => {
  if (degrees === 0) {
    return sharp(imageBuffer).rotate().toBuffer();
  }

  return sharp(imageBuffer).rotate().rotate(degrees).toBuffer();
};

const scoreFrontOcrText = (text) => {
  const normalizedText = normalizeText(text);
  let score = 0;

  if (ID_NUMBER_PATTERN.test(normalizedText)) score += 8;
  if (DATE_PATTERN.test(normalizedText)) score += 4;
  if (normalizedText.includes('CAN CUOC CONG DAN')) score += 3;
  if (normalizedText.includes('CITIZEN IDENTITY CARD')) score += 3;
  if (normalizedText.includes('HO VA TEN') || normalizedText.includes('FULL NAME')) score += 3;
  if (normalizedText.includes('NGAY SINH') || normalizedText.includes('DATE OF BIRTH')) score += 3;
  if (normalizedText.includes('QUOC TICH') || normalizedText.includes('NATIONALITY')) score += 2;
  if (extractNameCandidate(normalizedText)) score += 3;

  return score;
};

const scoreBackOcrText = (text) => {
  const backSideEvidence = getBackSideEvidence(text);
  const normalizedText = normalizeText(text);
  let score = backSideEvidence.count * 4;

  if (DATE_PATTERN.test(normalizedText)) score += 2;
  if (normalizedText.includes('CONG HOA XA HOI CHU NGHIA VIET NAM')) score += 1;

  return score;
};

const runOcrBestRotation = async (imageBuffer, scoreText) => {
  const attempts = await Promise.all(OCR_ROTATION_DEGREES.map(async (degrees) => {
    const rotatedBuffer = await rotateImageBuffer(imageBuffer, degrees);
    const text = await runOcr(rotatedBuffer);

    return {
      degrees,
      text,
      score: scoreText(text)
    };
  }));

  return attempts.sort((first, second) => second.score - first.score)[0];
};

const getRequiredFields = () => {
  const configured = process.env.KYC_OCR_REQUIRED_FIELDS;
  if (!configured) return DEFAULT_REQUIRED_FIELDS;

  const fields = configured
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

  return fields.length ? fields : DEFAULT_REQUIRED_FIELDS;
};

const getMinValidFields = () => {
  const configured = Number(process.env.KYC_OCR_MIN_VALID_FIELDS);
  if (!Number.isFinite(configured) || configured < DEFAULT_REQUIRED_FIELDS.length) {
    return DEFAULT_MIN_VALID_FIELDS;
  }

  return configured;
};

const getLines = (text) => text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const findLineIndex = (normalizedLines, predicates) => normalizedLines.findIndex((line) => (
  predicates.some((predicate) => line.includes(predicate))
));

const cleanFieldValue = (value = '') => value
  .replace(/^(FULL NAME|HO VA TEN|DATE OF BIRTH|NGAY SINH|SEX|GIOI TINH|NATIONALITY|QUOC TICH|PLACE OF ORIGIN|QUE QUAN|PLACE OF RESIDENCE|NOI THUONG TRU|DATE OF EXPIRY|NGAY HET HAN|SO|NO)\s*/i, '')
  .replace(/[|:;]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const COMMON_VIETNAMESE_SURNAMES = new Set([
  'NGUYEN',
  'TRAN',
  'LE',
  'PHAM',
  'HOANG',
  'HUYNH',
  'PHAN',
  'VU',
  'VO',
  'DANG',
  'BUI',
  'DO',
  'HO',
  'NGO',
  'DUONG',
  'LY',
  'TRUONG',
  'DINH',
  'MAI',
  'CAO',
  'TRINH',
  'LUU',
  'DANH'
]);

const extractNameCandidate = (value = '') => {
  const normalizedValue = normalizeLine(value)
    .replace(/\bHO VA TEN\b/g, ' ')
    .replace(/\bFULL NAME\b/g, ' ')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalizedValue
    .split(' ')
    .filter((token) => token.length >= 2);
  const surnameIndex = tokens.findIndex((token) => COMMON_VIETNAMESE_SURNAMES.has(token));

  if (surnameIndex === -1) {
    return null;
  }

  const nameTokens = [];
  for (let index = surnameIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ([
      'NGAY',
      'SINH',
      'DATE',
      'BIRTH',
      'GIOI',
      'TINH',
      'SEX',
      'QUOC',
      'TICH',
      'NATIONALITY'
    ].includes(token)) {
      break;
    }

    nameTokens.push(token);
    if (nameTokens.length >= 6) break;
  }

  return nameTokens.length >= 2 ? nameTokens.join(' ') : null;
};

const getValueAfterLabel = (rawLines, normalizedLines, labelPredicates, options = {}) => {
  const index = findLineIndex(normalizedLines, labelPredicates);
  if (index === -1) return null;

  const labelLine = normalizedLines[index];
  const rawLine = rawLines[index] || '';
  const labelPositions = labelPredicates
    .map((label) => labelLine.indexOf(label))
    .filter((position) => position >= 0);
  const startPosition = labelPositions.length ? Math.min(...labelPositions) : -1;
  const inlineValue = startPosition >= 0
    ? cleanFieldValue(rawLine.slice(startPosition + labelPredicates[0].length))
    : '';

  if (inlineValue && (!options.rejectInline || !options.rejectInline(inlineValue))) {
    return inlineValue;
  }

  for (let offset = 1; offset <= (options.maxNextLines || 2); offset += 1) {
    const candidate = cleanFieldValue(rawLines[index + offset] || '');
    const normalizedCandidate = normalizeLine(candidate);
    if (!candidate || labelPredicates.some((label) => normalizedCandidate.includes(label))) {
      continue;
    }

    if (!options.rejectInline || !options.rejectInline(candidate)) {
      return candidate;
    }
  }

  return null;
};

const parseFullName = (rawLines, normalizedLines) => {
  const labelIndex = findLineIndex(normalizedLines, ['HO VA TEN', 'FULL NAME']);
  if (labelIndex === -1) return null;

  for (let offset = 0; offset <= 3; offset += 1) {
    const line = rawLines[labelIndex + offset] || '';
    const candidate = offset === 0
      ? cleanFieldValue(line)
      : line;
    const extractedName = extractNameCandidate(candidate);

    if (extractedName) {
      return extractedName;
    }
  }

  return null;
};

const parseDateNearLabel = (rawLines, normalizedLines, labels) => {
  const index = findLineIndex(normalizedLines, labels);
  if (index === -1) return null;

  const candidates = [
    rawLines[index],
    rawLines[index + 1],
    rawLines[index - 1]
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedDate = normalizeDate(candidate);
    if (normalizedDate) return normalizedDate;
  }

  return null;
};

const parseSex = (combinedText) => {
  if (/\b(NAM|MALE)\b/.test(combinedText)) return 'Nam';
  if (/\b(NU|Nữ|FEMALE)\b/i.test(combinedText)) return 'Nu';
  return null;
};

const parseNationality = (combinedText) => {
  if (combinedText.includes('VIET NAM') || combinedText.includes('VIETNAM')) {
    return 'Viet Nam';
  }

  return null;
};

const parseTextAfterLabelUntilNextLabel = (rawLines, normalizedLines, labels, stopLabels) => {
  const index = findLineIndex(normalizedLines, labels);
  if (index === -1) return null;

  const values = [];
  for (let offset = 0; offset <= 3; offset += 1) {
    const lineIndex = index + offset;
    const rawLine = rawLines[lineIndex] || '';
    const normalizedLine = normalizedLines[lineIndex] || '';

    if (!rawLine) continue;
    if (offset > 0 && stopLabels.some((label) => normalizedLine.includes(label))) break;

    if (offset === 0) {
      const value = getValueAfterLabel(rawLines, normalizedLines, labels, { maxNextLines: 0 });
      if (value) values.push(value);
    } else {
      values.push(cleanFieldValue(rawLine));
    }
  }

  const result = values.join(' ').replace(/\s+/g, ' ').trim();
  return result.length >= 3 ? result : null;
};

const parseCitizenIdFields = (frontText, backText) => {
  const rawLines = getLines(`${frontText}\n${backText}`);
  const normalizedLines = rawLines.map(normalizeLine);
  const combinedText = normalizeText(`${frontText} ${backText}`);
  const idNumber = combinedText.match(ID_NUMBER_PATTERN)?.[0] || null;
  const fullName = parseFullName(rawLines, normalizedLines);
  const dob = parseDateNearLabel(rawLines, normalizedLines, ['NGAY SINH', 'DATE OF BIRTH']);
  const sex = parseSex(combinedText);
  const nationality = parseNationality(combinedText);
  const expiry = parseDateNearLabel(rawLines, normalizedLines, ['NGAY HET HAN', 'DATE OF EXPIRY', 'CO GIA TRI DEN']);
  const stopLabels = [
    'NOI THUONG TRU',
    'PLACE OF RESIDENCE',
    'GIOI TINH',
    'SEX',
    'QUOC TICH',
    'NATIONALITY',
    'NGAY SINH',
    'DATE OF BIRTH'
  ];
  const placeOfOrigin = parseTextAfterLabelUntilNextLabel(
    rawLines,
    normalizedLines,
    ['QUE QUAN', 'PLACE OF ORIGIN'],
    stopLabels
  );
  const placeOfResidence = parseTextAfterLabelUntilNextLabel(
    rawLines,
    normalizedLines,
    ['NOI THUONG TRU', 'PLACE OF RESIDENCE'],
    stopLabels
  );

  return {
    idNumber,
    fullName,
    dob,
    sex,
    nationality,
    expiry,
    placeOfOrigin,
    placeOfResidence
  };
};

const countValidFields = (data) => Object.values(data).filter(Boolean).length;

const getMissingFields = (data, requiredFields) => requiredFields.filter((field) => !data[field]);

const getBackSideEvidence = (backText) => {
  const normalizedBackText = normalizeText(backText);
  const keywordMatches = BACK_SIDE_KEYWORDS.filter((keyword) => normalizedBackText.includes(keyword));
  const hasMrzLikeLine = /[A-Z0-9<]{20,}/.test(normalizedBackText);

  return {
    count: keywordMatches.length + (hasMrzLikeLine ? 1 : 0),
    keywordMatches,
    hasMrzLikeLine
  };
};

const isForcedDemoResult = () => {
  const mode = (process.env.KYC_OCR_DEMO_RESULT || process.env.KYC_DEMO_MODE || '').toLowerCase();
  if (mode === 'pass' || mode === 'true') return true;
  if (mode === 'fail' || mode === 'false') return false;
  return null;
};

const analyzeCitizenId = async (frontImageBuffer, backImageBuffer) => {
  if (!frontImageBuffer || !backImageBuffer) {
    return {
      isValid: false,
      errorMessage: 'Vui long tai du anh mat truoc va mat sau CCCD',
      data: {},
      warnings: [],
      debug: {
        validFieldCount: 0,
        missingFields: getRequiredFields(),
        warnings: []
      }
    };
  }

  const forcedResult = isForcedDemoResult();
  if (forcedResult === true) {
    const data = {
      idNumber: '012345678910',
      fullName: 'CAO THANH VÂN',
      dob: '15/05/1985',
      sex: 'Nữ',
      nationality: 'Viet Nam',
      expiry: '20/10/2035',
      placeOfOrigin: 'P. Sài Gòn, TP. Hồ Chí Minh',
      placeOfResidence: '49 Bùi Thị Xuân, P. Sài Gòn, TP. Hồ Chí Minh'
    };
    return {
      isValid: true,
      errorMessage: null,
      data,
      warnings: ['Chế độ Demo/Test OCR: Tự động xác thực thành công'],
      debug: {
        validFieldCount: 8,
        missingFields: [],
        warnings: ['Demo mode active'],
        ocrRotation: { front: 0, back: 0 },
        backSideEvidence: { count: 5, keywordMatches: ['DEMO'], hasMrzLikeLine: true }
      }
    };
  }
  if (forcedResult === false) {
    return {
      isValid: false,
      errorMessage: 'Khong doc du thong tin CCCD (Demo fail)',
      data: {},
      warnings: [],
      debug: { validFieldCount: 0, missingFields: getRequiredFields(), warnings: [] }
    };
  }

  try {
    const [frontQuality, backQuality] = await Promise.all([
      getImageQualityResult(frontImageBuffer, 'Anh mat truoc CCCD'),
      getImageQualityResult(backImageBuffer, 'Anh mat sau CCCD')
    ]);
    const warnings = [...frontQuality.warnings, ...backQuality.warnings];

    if (frontQuality.hardError || backQuality.hardError) {
      const hardError = frontQuality.hardError || backQuality.hardError;
      return {
        isValid: false,
        errorMessage: hardError,
        data: {},
        warnings,
        debug: {
          validFieldCount: 0,
          missingFields: getRequiredFields(),
          warnings
        }
      };
    }

    const [frontOcr, backOcr] = await Promise.all([
      runOcrBestRotation(frontImageBuffer, scoreFrontOcrText),
      runOcrBestRotation(backImageBuffer, scoreBackOcrText)
    ]);
    const frontText = frontOcr.text;
    const backText = backOcr.text;

    if (frontOcr.degrees !== 0) {
      warnings.push(`Anh mat truoc CCCD bi xoay ${frontOcr.degrees} do, he thong da tu xoay de doc OCR`);
    }

    if (backOcr.degrees !== 0) {
      warnings.push(`Anh mat sau CCCD bi xoay ${backOcr.degrees} do, he thong da tu xoay de doc OCR`);
    }

    const combinedText = normalizeText(`${frontText} ${backText}`);
    if (!combinedText) {
      return {
        isValid: false,
        errorMessage: 'Khong the doc thong tin tu anh CCCD, vui long chup ro hon',
        data: {},
        warnings,
        debug: {
          validFieldCount: 0,
          missingFields: getRequiredFields(),
          warnings,
          ocrRotation: {
            front: frontOcr.degrees,
            back: backOcr.degrees
          }
        }
      };
    }

    const data = parseCitizenIdFields(frontText, backText);
    const requiredFields = getRequiredFields();
    const minValidFields = getMinValidFields();
    const validFieldCount = countValidFields(data);
    const missingFields = getMissingFields(data, requiredFields);
    const backSideEvidence = getBackSideEvidence(backText);

    if (backSideEvidence.count < 1) {
      return {
        isValid: false,
        errorMessage: 'Khong doc du thong tin mat sau CCCD, vui long chup lai ro hon',
        data,
        warnings,
        debug: {
          validFieldCount,
          missingFields: ['backSideEvidence'],
          warnings,
          ocrRotation: {
            front: frontOcr.degrees,
            back: backOcr.degrees
          },
          backSideEvidence
        }
      };
    }

    if (missingFields.length || validFieldCount < minValidFields) {
      return {
        isValid: false,
        errorMessage: 'Khong doc du thong tin CCCD, vui long chup lai ro hon',
        data,
        warnings,
        debug: {
          validFieldCount,
          missingFields,
          warnings,
          ocrRotation: {
            front: frontOcr.degrees,
            back: backOcr.degrees
          },
          backSideEvidence
        }
      };
    }

    return {
      isValid: true,
      errorMessage: null,
      data,
      warnings,
      debug: {
        validFieldCount,
        missingFields: [],
        warnings,
        ocrRotation: {
          front: frontOcr.degrees,
          back: backOcr.degrees
        },
        backSideEvidence
      }
    };
  } catch (error) {
    console.error('Citizen ID OCR failed:', error);

    return {
      isValid: false,
      errorMessage: 'Khong the doc thong tin tu anh CCCD, vui long chup ro hon',
      data: {},
      warnings: [],
      debug: {
        validFieldCount: 0,
        missingFields: getRequiredFields(),
        warnings: []
      }
    };
  }
};

module.exports = {
  analyzeCitizenId
};
