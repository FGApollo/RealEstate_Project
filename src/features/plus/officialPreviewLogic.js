// Pure logic for assembling dynamic, non-hardcoded preview thumbnails and price labels.

export const collectTeaserImages = (officialPreviews = [], previewProperties = [], maxCount = 8) => {
  const seen = new Set();
  const collected = [];

  const pushImage = (id, url) => {
    const clean = typeof url === 'string' ? url.trim() : '';
    if (!clean || seen.has(clean) || collected.length >= maxCount) return;
    seen.add(clean);
    collected.push({ id: id || clean, image: clean });
  };

  // 1. Official preview thumbnails from /api/plus/official-preview
  officialPreviews.forEach((item) => pushImage(item?.id, item?.image));

  // 2. Official properties already present in homepage feed
  previewProperties
    .filter((item) => item?.owner?.is_official === true)
    .forEach((item) => {
      pushImage(item.id, item.thumbnail || item.images?.[0]);
      (item.images || []).forEach((img, idx) => pushImage(`${item.id}-off-${idx}`, img));
    });

  // 3. Fill remaining slots with real live property thumbnails from homepage feed
  previewProperties.forEach((item) => {
    pushImage(item.id, item.thumbnail || item.images?.[0]);
  });

  // 4. Fill any still-missing slots with secondary gallery images from live properties
  if (collected.length > 0 && collected.length < maxCount) {
    previewProperties.forEach((item) => {
      (item.images || []).forEach((img, idx) => pushImage(`${item.id}-gal-${idx}`, img));
    });
  }

  return collected;
};

export const formatCompactVnd = (amount) => {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) return '20.000đ';
  return `${new Intl.NumberFormat('vi-VN').format(num)}đ`;
};

export const formatPlanPriceLabel = (plan) => {
  const months = plan?.duration_months || 1;
  const durationText = months === 1 ? 'tháng' : `${months} tháng`;
  return `${formatCompactVnd(plan?.amount_vnd ?? 20000)}/${durationText}`;
};
