const ESMS_ENDPOINT = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';

// Bảng tra mã lỗi phản hồi từ hệ thống eSMS.vn
const ESMS_ERROR_MESSAGES = {
  '100': 'Gửi tin nhắn thành công',
  '101': 'Đăng nhập thất bại (Sai ApiKey hoặc SecretKey của eSMS)',
  '102': 'Tài khoản eSMS không đủ tiền để gửi tin nhắn',
  '103': 'Số điện thoại không hợp lệ',
  '104': 'Brandname không tồn tại hoặc chưa được duyệt',
  '105': 'Brandname chưa được kích hoạt',
  '106': 'Tin nhắn chưa được kích hoạt',
  '107': 'Mẫu tin nhắn không hợp lệ hoặc không đúng cú pháp quy định',
  '118': 'Loại tin nhắn (SmsType) không hợp lệ',
  '119': 'Brandname không được phép gửi cho nhà mạng này',
  '131': 'Tin nhắn bị từ chối do trùng lặp nội dung trong thời gian ngắn',
  '132': 'Chưa đăng ký mẫu nội dung tin nhắn với eSMS',
  '145': 'Sai định dạng template hoặc tham số truyền vào template',
  '159': 'RequestId vượt quá 120 ký tự',
  '99': 'Lỗi không xác định từ hệ thống eSMS'
};

/**
 * Kiểm tra xem eSMS đã được cấu hình đầy đủ API Key và Secret Key hay chưa
 */
const isConfigured = () => {
  const apiKey = process.env.ESMS_API_KEY;
  const secretKey = process.env.ESMS_SECRET_KEY;
  return Boolean(apiKey && secretKey && apiKey.trim() !== '' && secretKey.trim() !== '');
};

const isLiveSmsEnabled = () => isConfigured()
  && process.env.ESMS_MOCK !== 'true'
  && process.env.ESMS_SANDBOX === '0';

const maskPhone = (phone) => {
  const value = String(phone || '');
  if (value.length <= 4) return '****';
  return `${value.slice(0, 3)}${'*'.repeat(Math.max(2, value.length - 5))}${value.slice(-2)}`;
};

/**
 * Gửi tin nhắn SMS OTP qua eSMS.vn
 * @param {Object} options
 * @param {string} options.phone - Số điện thoại nhận tin (VD: "0901234567")
 * @param {string} options.otp - Mã OTP (VD: "123456")
 * @param {string} [options.customContent] - Nội dung tùy chỉnh (nếu có)
 * @returns {Promise<{ success: boolean, smsId?: string, isMock?: boolean, message: string }>}
 */
const sendOtpSms = async ({ phone, otp, customContent }) => {
  const apiKey = process.env.ESMS_API_KEY;
  const secretKey = process.env.ESMS_SECRET_KEY;
  const brandname = process.env.ESMS_BRANDNAME || 'SwipeNest';
  const smsType = process.env.ESMS_SMS_TYPE || '2'; // 2: CSKH hiển thị Brandname, 8: Tin cố định giá rẻ
  const isUnicode = process.env.ESMS_IS_UNICODE || '0'; // 0: không dấu, 1: có dấu
  const sandbox = process.env.ESMS_SANDBOX === '0' ? '0' : '1'; // Mặc định bật Sandbox=1 để an toàn khi thử nghiệm
  const forceMock = process.env.ESMS_MOCK === 'true';

  // Cấu hình nội dung tin nhắn theo template (hỗ trợ biến {otp}) hoặc mặc định
  const template = process.env.ESMS_OTP_TEMPLATE || 'Ma OTP xac thuc cua ban tai SwipeNest la: {otp}. Ma co hieu luc trong 5 phut. Vui long khong chia se ma nay cho bat ky ai.';
  const content = customContent || template.replace(/\{otp\}/gi, otp);

  // Fallback Mock Mode: Nếu chưa cấu hình Key hoặc được cấu hình force mock
  if (!isConfigured() || forceMock) {
    console.warn(`[eSMS] Mock mode; no outbound SMS sent to ${maskPhone(phone)}.`);

    return {
      success: true,
      isMock: true,
      smsId: `MOCK_${Date.now()}`,
      message: 'Mã OTP đã được tạo (Chế độ giả lập eSMS do chưa có API Key)'
    };
  }

  // Chuẩn bị payload gửi eSMS API
  const payload = {
    ApiKey: apiKey.trim(),
    SecretKey: secretKey.trim(),
    Phone: phone.trim(),
    Content: content,
    SmsType: smsType.trim(),
    IsUnicode: isUnicode,
    Sandbox: sandbox,
    RequestId: `OTP_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  };

  // Nếu dùng loại tin nhắn hiển thị Brandname (SmsType != 8) thì mới gửi Brandname
  if (smsType !== '8' && brandname) {
    payload.Brandname = brandname.trim();
  }

  try {
    const modeLabel = sandbox === '1' ? 'SANDBOX (Thử nghiệm)' : 'PRODUCTION (Thực tế)';
    const senderLabel = smsType === '8' ? 'Đầu số cố định 10 số (Không hiện Brandname)' : `Brandname: "${brandname}"`;
    console.log(`[eSMS] Sending OTP in ${modeLabel} (${senderLabel}, Type: ${smsType}).`);
    
    const response = await fetch(ESMS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();
    const codeResult = String(data?.CodeResult || '');

    if (codeResult === '100') {
      console.log(`[eSMS] SMS request accepted [${modeLabel}]. SMSID: ${data.SMSID}`);
      return {
        success: true,
        smsId: data.SMSID,
        isMock: false,
        sandbox: sandbox === '1',
        message: sandbox === '1'
          ? 'Gửi tin nhắn thử nghiệm thành công (Sandbox: API hợp lệ, không trừ tiền)'
          : 'Gửi tin nhắn SMS OTP thành công'
      };
    }

    // Xử lý các mã lỗi từ eSMS
    const errorDetail = ESMS_ERROR_MESSAGES[codeResult] || data.ErrorMessage || 'Lỗi không xác định từ eSMS';
    console.error(`[eSMS] SMS request failed: CodeResult=${codeResult} - ${errorDetail}`);

    const error = new Error(`eSMS error [${codeResult}]: ${errorDetail}`);
    error.statusCode = 400;
    error.codeResult = codeResult;
    throw error;
  } catch (err) {
    if (err.codeResult) {
      throw err;
    }
    console.error(`[eSMS] Lỗi kết nối tới gateway eSMS:`, err.message);
    const networkError = new Error(`Không thể kết nối đến cổng gửi tin eSMS: ${err.message}`);
    networkError.statusCode = 502;
    throw networkError;
  }
};

module.exports = {
  sendOtpSms,
  isConfigured,
  isLiveSmsEnabled
};
