// Pure validation and formatting helpers for UserProfile page.

const VALID_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const VN_PHONE_REGEX = /^0[35789]\d{8}$/;

export const validateAvatarFile = (file) => {
  if (!file) return 'Vui lòng chọn ảnh đại diện';
  if (!VALID_AVATAR_TYPES.has(file.type)) {
    return 'Chỉ hỗ trợ file ảnh định dạng JPG, PNG hoặc WEBP';
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return 'Kích thước ảnh đại diện không được vượt quá 5MB';
  }
  return '';
};

export const validateProfileForm = ({ name, phone }) => {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return { error: 'Họ và tên không được để trống' };
  if (trimmedName.length > 120) return { error: 'Họ và tên tối đa 120 ký tự' };

  const trimmedPhone = String(phone || '').trim();
  if (trimmedPhone) {
    const cleaned = trimmedPhone.replace(/[\s().-]/g, '').replace(/^\+84/, '0');
    if (!VN_PHONE_REGEX.test(cleaned)) {
      return {
        error: 'Số điện thoại không hợp lệ (cần 10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09)'
      };
    }
  }

  return { error: '', name: trimmedName, phone: trimmedPhone || null };
};

export const validatePasswordForm = ({ hasPassword, currentPassword, newPassword, confirmPassword }) => {
  if (hasPassword && !currentPassword) return 'Vui lòng nhập mật khẩu hiện tại';
  if (String(newPassword || '').length < 10) return 'Mật khẩu mới phải có ít nhất 10 ký tự';
  if (newPassword !== confirmPassword) return 'Mật khẩu xác nhận không khớp';
  return '';
};

export const formatProfileDate = (isoString) => {
  if (!isoString) return 'Mới tham gia';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Mới tham gia';
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return 'Mới tham gia';
  }
};

export const getRoleLabel = (role) => {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'AGENT') return 'Môi giới';
  if (normalized === 'ADMIN') return 'Quản trị viên';
  return 'Người tìm nhà';
};
