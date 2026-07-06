const axios = require('axios');

/**
 * Scan property description to detect if it is a multi-listing portfolio ("giỏ hàng rác")
 * using gemini-2.5-flash.
 * 
 * @param {string} description The property description text
 * @returns {Promise<{is_multi_listing: boolean, reason: string}>}
 */
const checkDescriptionIsMultiListing = async (description) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not configured in .env. Skipping Gemini check.');
    return { is_multi_listing: false, reason: 'Gemini API Key missing' };
  }

  if (!description || description.trim().length < 10) {
    return { is_multi_listing: false, reason: 'Description too short' };
  }

  try {
    const prompt = `Hãy phân tích xem đoạn mô tả bất động sản dưới đây là của MỘT CĂN BẤT ĐỘNG SẢN DUY NHẤT hay là một "GIỎ HÀNG" gồm nhiều căn hộ/phòng khác nhau (Ví dụ: liệt kê "căn 1PN giá X, căn 2PN giá Y...", hoặc danh sách nhiều phòng trống khác nhau trong cùng một tòa nhà). 

Yêu cầu trả về kết quả định dạng JSON duy nhất với cấu trúc sau, không kèm bất kỳ ký tự nào bên ngoài:
{
  "is_multi_listing": true hoặc false,
  "reason": "Lý do ngắn gọn bằng tiếng Việt giải thích tại sao"
}

Đoạn mô tả cần phân tích:
"${description}"`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 8000 // 8 seconds timeout
      }
    );

    const resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (resultText) {
      try {
        const parsed = JSON.parse(resultText.trim());
        return {
          is_multi_listing: !!parsed.is_multi_listing,
          reason: parsed.reason || ''
        };
      } catch (parseErr) {
        console.error('Failed to parse Gemini JSON response:', resultText, parseErr);
        return { is_multi_listing: false, reason: 'Invalid JSON response from AI' };
      }
    }

    return { is_multi_listing: false, reason: 'No candidates returned from AI' };
  } catch (error) {
    console.error('Error calling Gemini API:', error.message);
    return { is_multi_listing: false, reason: 'Gemini API call failed: ' + error.message };
  }
};

module.exports = {
  checkDescriptionIsMultiListing
};
