// Điền tọa độ cho tin đăng chưa có latitude/longitude (ví dụ 60 căn mẫu "Nhà mẫu Swipe Nest").
//
// Cách dùng (từ thư mục gốc dự án):
//   node server/scripts/backfill-coordinates.cjs            # chạy thử: chỉ in báo cáo, KHÔNG ghi gì
//   node server/scripts/backfill-coordinates.cjs --apply    # ghi tọa độ vào database trong server/.env
//
// Database là project trong server/.env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Muốn chạy cho production,
// chủ dự án tự trỏ biến môi trường sang production; script không bao giờ tự chọn production.
//
// Chỉ nhận kết quả "chắc chắn": tra bằng OpenStreetMap Nominatim (đúng giới hạn 1 yêu cầu/giây) theo SỐ NHÀ / TÊN ĐƯỜNG
// của tin, và kết quả phải là một điểm cụ thể (không phải cả phường/quận) nằm trong đúng phường + tỉnh của tin.
// Tọa độ tâm phường KHÔNG được ghi: như vậy nhiều căn sẽ chung một ghim "chính xác" giả. Tin không đủ dữ kiện
// (ví dụ căn mẫu chỉ ghi "Dữ liệu mẫu: ...") để nguyên; bản đồ hiện "vị trí gần đúng theo khu vực".
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const req = require('module').createRequire(path.join(ROOT, 'server/package.json'));
req('dotenv').config({ path: path.join(ROOT, 'server/.env'), quiet: true });
const { createClient } = req('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const USER_AGENT = 'SwipeNest-coordinate-backfill/1.0 (one-off maintenance script)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fold = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const wardCore = (ward) => fold(ward).replace(/^(phuong|xa|thi tran|dac khu)\s+/, '');

let lastRequestAt = 0;
async function geocode(query) {
  const wait = 1100 - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ format: 'json', q: query, limit: '3', countrycodes: 'vn', 'accept-language': 'vi' }).toString();
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  return response.json();
}

// Kết quả đáng tin: display_name chứa trọn tên phường (theo nguyên từ) và tên tỉnh/thành phố.
const AREA_TYPES = new Set(['suburb', 'quarter', 'neighbourhood', 'city_district', 'city', 'town', 'village', 'county', 'state',
  'province', 'municipality', 'district', 'administrative', 'region']);
const isAreaResult = (result) => result.class === 'boundary' || result.class === 'place'
  || AREA_TYPES.has(result.addresstype) || AREA_TYPES.has(result.type);
const hasRealStreet = (detail) => Boolean(detail && !/^\s*dữ liệu mẫu/i.test(detail) && /[a-zà-ỹđ]/i.test(detail));
const trustworthy = (result, listing) => {
  if (isAreaResult(result)) return false;
  const display = ` ${fold(result.display_name)} `;
  const ward = wardCore(listing.ward);
  const city = fold(listing.city).replace(/^(thanh pho|tp|tinh)\s+/, '');
  // OSM đã dùng đơn vị hành chính mới: phường cũ ("Mỹ An") có thể không còn, nhưng tên quận cũ thường thành
  // tên phường mới ("Phường Ngũ Hành Sơn"). Chấp nhận khi khớp tên phường HOẶC tên quận/huyện cũ của tin.
  const district = wardCore(String(listing.district || '').replace(/^(quận|huyện|thành phố|tp\.?|thị xã)\s+/i, ''));
  const inArea = (ward && display.includes(` ${ward} `)) || (district && !/^\d+$/.test(district) && display.includes(` ${district} `));
  if (!inArea) return false;
  return !city || display.includes(` ${city} `);
};

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong server/.env');
  const db = createClient(url, key);
  console.log(`Database: ${new URL(url).host} · chế độ: ${APPLY ? 'GHI (--apply)' : 'CHẠY THỬ (không ghi)'}`);

  const { data: listings, error } = await db.from('properties')
    .select('id, title, address_detail, ward, district, city, latitude, longitude, status')
    .neq('status', 'DELETED')
    .or('latitude.is.null,longitude.is.null,latitude.eq.0,longitude.eq.0')
    .order('id');
  if (error) throw new Error(error.message);
  console.log(`Tin chưa có tọa độ: ${listings.length}`);

  const report = { updated: 0, wouldUpdate: 0, noMatch: 0, missingArea: 0, noStreet: 0, failed: 0 };
  for (const listing of listings) {
    if (!listing.ward || !listing.city) {
      report.missingArea++;
      console.log(`  #${listing.id} bỏ qua: thiếu phường hoặc tỉnh/thành phố`);
      continue;
    }
    if (!hasRealStreet(listing.address_detail)) {
      report.noStreet++;
      console.log(`  #${listing.id} bỏ qua: không có số nhà / tên đường thật ("${listing.address_detail || ''}")`);
      continue;
    }
    const area = [listing.ward, listing.district, listing.city].filter(Boolean);
    const queries = [
      [listing.address_detail, ...area].join(', '),
      [listing.address_detail, listing.ward, listing.city].join(', ')
    ].filter((query, index, list) => query && list.indexOf(query) === index);

    let match = null;
    try {
      for (const query of queries) {
        const results = await geocode(query);
        match = results.find((result) => trustworthy(result, listing));
        if (match) { match.query = query; break; }
      }
    } catch (geocodeError) {
      report.failed++;
      console.log(`  #${listing.id} lỗi tra cứu: ${geocodeError.message}`);
      continue;
    }
    if (!match) {
      report.noMatch++;
      console.log(`  #${listing.id} không khớp chắc chắn (${area.join(', ')}) — để nguyên`);
      continue;
    }
    const latitude = Number(match.lat);
    const longitude = Number(match.lon);
    if (!APPLY) {
      report.wouldUpdate++;
      console.log(`  #${listing.id} sẽ ghi ${latitude.toFixed(5)}, ${longitude.toFixed(5)}  ← "${match.query}"`);
      continue;
    }
    const { error: updateError } = await db.from('properties').update({ latitude, longitude })
      .eq('id', listing.id).or('latitude.is.null,longitude.is.null,latitude.eq.0,longitude.eq.0');
    if (updateError) {
      report.failed++;
      console.log(`  #${listing.id} lỗi ghi: ${updateError.message}`);
    } else {
      report.updated++;
      console.log(`  #${listing.id} đã ghi ${latitude.toFixed(5)}, ${longitude.toFixed(5)}  ← "${match.query}"`);
    }
  }
  console.log('\nKết quả:', JSON.stringify(report));
})().catch((error) => { console.error(error.message); process.exit(1); });
