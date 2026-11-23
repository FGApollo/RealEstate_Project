import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectTeaserImages,
  formatCompactVnd,
  formatPlanPriceLabel
} from './officialPreviewLogic.js';

test('collectTeaserImages prioritizes official previews, deduplicates URLs, and never hardcodes fallbacks', () => {
  const officialPreviews = [
    { id: 'off-1', image: 'https://cdn.example.com/a.jpg' },
    { id: 'off-2', image: 'https://cdn.example.com/b.jpg' }
  ];
  const properties = [
    { id: 'p-1', owner: { is_official: true }, thumbnail: 'https://cdn.example.com/b.jpg', images: ['https://cdn.example.com/c.jpg'] },
    { id: 'p-2', owner: { is_official: false }, thumbnail: 'https://cdn.example.com/d.jpg', images: ['https://cdn.example.com/e.jpg'] }
  ];

  const result = collectTeaserImages(officialPreviews, properties, 8);
  assert.deepEqual(
    result.map((item) => item.image),
    [
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
      'https://cdn.example.com/d.jpg',
      'https://cdn.example.com/e.jpg'
    ]
  );
});

test('collectTeaserImages returns empty array when database has no images', () => {
  assert.deepEqual(collectTeaserImages([], [], 8), []);
});

test('formatCompactVnd and formatPlanPriceLabel format Vietnamese currency cleanly', () => {
  assert.equal(formatCompactVnd(20000), '20.000đ');
  assert.equal(formatCompactVnd(null), '20.000đ');
  assert.equal(formatPlanPriceLabel({ amount_vnd: 20000, duration_months: 1 }), '20.000đ/tháng');
  assert.equal(formatPlanPriceLabel({ amount_vnd: 50000, duration_months: 3 }), '50.000đ/3 tháng');
});
