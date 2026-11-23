import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countByCategory,
  filterAndSortSaved,
  formatSavedPrice,
  formatSavedSpecs
} from './savedPropertiesLogic.js';

const SAMPLE = [
  { id: 1, property_type: 'Phòng Trọ', price: 3_500_000, bedrooms: 1, bathrooms: 1, area: 27 },
  { id: 2, property_type: 'Căn Hộ', price: 7_200_000, bedrooms: 1, bathrooms: 1, area: 35 },
  { id: 3, property_type: 'Căn Hộ', price: 10_000_000, bedrooms: 2, bathrooms: 2, area: 70 }
];

test('countByCategory counts all items and normalized categories accurately', () => {
  assert.equal(countByCategory(SAMPLE, 'Tất cả'), 3);
  assert.equal(countByCategory(SAMPLE, 'Phòng Trọ'), 1);
  assert.equal(countByCategory(SAMPLE, 'Căn Hộ'), 2);
  assert.equal(countByCategory(SAMPLE, 'Nhà Ở'), 0);
});

test('filterAndSortSaved filters by category and sorts ascending/descending', () => {
  assert.deepEqual(
    filterAndSortSaved(SAMPLE, { category: 'Căn Hộ', sortBy: 'price-desc' }).map((p) => p.id),
    [3, 2]
  );
  assert.deepEqual(
    filterAndSortSaved(SAMPLE, { category: 'Tất cả', sortBy: 'price-asc' }).map((p) => p.id),
    [1, 2, 3]
  );
});

test('formatSavedPrice formats Vietnamese millions and billions with comma decimals', () => {
  assert.equal(formatSavedPrice(3_500_000), '3,5 triệu');
  assert.equal(formatSavedPrice(7_200_000), '7,2 triệu');
  assert.equal(formatSavedPrice(10_000_000), '10 triệu');
  assert.equal(formatSavedPrice(2_500_000_000), '2,5 tỷ');
  assert.equal(formatSavedPrice(0), 'Liên hệ');
});

test('formatSavedSpecs returns compact Vietnamese spec tokens', () => {
  assert.deepEqual(formatSavedSpecs(SAMPLE[0]), ['1 PN', '1 WC', '27 m²']);
  assert.deepEqual(formatSavedSpecs({ area: 45 }), ['45 m²']);
});
