import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAndSortProvinces,
  filterWards,
  formatAreaDropdownLabel,
  formatListingTypeLabel,
  formatPriceDropdownLabel,
  formatPropertyTypeLabel,
  matchPricePreset,
  millionInputToVnd,
  normalizeSearchText,
  regionOfProvince,
  shortProvinceName,
  vndToMillionInput
} from './searchDropdownLogic.js';

const SAMPLE_PROVINCES = [
  { code: 91, name: 'Tỉnh An Giang' },
  { code: 1, name: 'Thành phố Hà Nội' },
  { code: 48, name: 'Thành phố Đà Nẵng' },
  { code: 79, name: 'Thành phố Hồ Chí Minh' },
  { code: 31, name: 'Thành phố Hải Phòng' },
  { code: 92, name: 'Thành phố Cần Thơ' }
];

test('normalizeSearchText folds Vietnamese diacritics and đ/Đ', () => {
  assert.equal(normalizeSearchText('Thành phố Đà Nẵng'), 'thanh pho da nang');
  assert.equal(normalizeSearchText('  Đắk Lắk  '), 'dak lak');
});

test('regionOfProvince classifies South, Central, and North provinces accurately', () => {
  assert.equal(regionOfProvince(79), 'SOUTH');
  assert.equal(regionOfProvince(92), 'SOUTH');
  assert.equal(regionOfProvince(48), 'CENTRAL');
  assert.equal(regionOfProvince(68), 'CENTRAL');
  assert.equal(regionOfProvince(1), 'NORTH');
  assert.equal(regionOfProvince(31), 'NORTH');
});

test('filterAndSortProvinces pins 5 major cities first in ALL tab and filters by region/query', () => {
  const all = filterAndSortProvinces(SAMPLE_PROVINCES, { region: 'ALL', query: '' });
  assert.deepEqual(
    all.map((p) => p.code),
    [79, 1, 48, 92, 31, 91]
  );

  const south = filterAndSortProvinces(SAMPLE_PROVINCES, { region: 'SOUTH' });
  assert.deepEqual(
    south.map((p) => p.code),
    [92, 79, 91]
  );

  const searched = filterAndSortProvinces(SAMPLE_PROVINCES, { query: 'da nang' });
  assert.deepEqual(searched.map((p) => p.code), [48]);
});

test('filterWards searches Vietnamese ward names without accents', () => {
  const wards = [
    { code: 1, name: 'Phường Bình Thạnh' },
    { code: 2, name: 'Phường Thảo Điền' }
  ];
  assert.equal(filterWards(wards, 'thao dien').length, 1);
  assert.equal(filterWards(wards, 'thao dien')[0].code, 2);
});

test('VND and million conversions round-trip accurately and reject invalid inputs', () => {
  assert.equal(vndToMillionInput('5000000'), '5');
  assert.equal(vndToMillionInput('15500000'), '15.5');
  assert.equal(vndToMillionInput('0'), '0');
  assert.equal(vndToMillionInput(''), '');

  assert.equal(millionInputToVnd('5'), '5000000');
  assert.equal(millionInputToVnd('12.5'), '12500000');
  assert.equal(millionInputToVnd('-3'), '');
  assert.equal(millionInputToVnd(''), '');
});

test('matchPricePreset and display label formatters handle presets and custom values', () => {
  assert.equal(matchPricePreset('0', '5'), 'under-5m');
  assert.equal(matchPricePreset('5', '10'), '5m-10m');
  assert.equal(matchPricePreset('6', '12'), 'CUSTOM');

  assert.equal(formatPriceDropdownLabel({ priceRange: '5m-10m' }), '5 - 10 triệu');
  assert.equal(
    formatPriceDropdownLabel({ priceRange: 'CUSTOM', minPrice: '6000000', maxPrice: '14000000' }),
    '6 - 14 triệu'
  );
  assert.equal(formatPropertyTypeLabel([]), 'Tất cả loại');
  assert.equal(formatPropertyTypeLabel(['Căn Hộ']), 'Căn hộ');
  assert.equal(formatPropertyTypeLabel(['Căn Hộ', 'Nhà Ở']), '2 loại hình');

  assert.equal(shortProvinceName('Thành phố Hồ Chí Minh'), 'Hồ Chí Minh');
  assert.equal(
    formatAreaDropdownLabel({ province: 'Thành phố Hồ Chí Minh', ward: 'Phường Bến Nghé', hasProvinces: true }),
    'Phường Bến Nghé, Hồ Chí Minh'
  );
  assert.equal(formatListingTypeLabel(''), 'Thuê & bán');
  assert.equal(formatListingTypeLabel('RENT'), 'Cho thuê');
  assert.equal(formatListingTypeLabel('SALE'), 'Mua bán');
});
