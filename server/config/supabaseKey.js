// Backend chỉ được dùng khóa bí mật của Supabase (sb_secret_… hoặc JWT role=service_role).
// Khóa publishable/anon bị chặn đọc mọi bảng sau migration 011, nên từ chối ngay khi khởi động.
const readJwtRole = (key) => {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role || null;
  } catch {
    return null;
  }
};

const resolveSupabaseServerKey = (env = process.env) => {
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) {
    throw new Error('Backend cần SUPABASE_SECRET_KEY (hoặc SUPABASE_SERVICE_ROLE_KEY) trong server/.env');
  }
  const jwtRole = readJwtRole(key);
  if (key.startsWith('sb_publishable_') || jwtRole === 'anon' || jwtRole === 'authenticated') {
    throw new Error('Khóa Supabase của backend đang là khóa công khai (publishable/anon). '
      + 'Hãy dùng secret key (sb_secret_…) của project trong server/.env.');
  }
  return key;
};

module.exports = { resolveSupabaseServerKey };
