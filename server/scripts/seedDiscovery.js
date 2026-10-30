// Preview: node server/scripts/seedDiscovery.js --prepare
// Apply:   node server/scripts/seedDiscovery.js --apply
// Verify:  node server/scripts/seedDiscovery.js --verify
// Backups and the operation journal stay in the ignored .local directory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
require('dotenv').config({ path: path.join(root, 'server/.env'), quiet: true });
const { supabase } = require('../config/supabase');
const sharp = require('sharp');
const {
  SEED_ID, OWNER_EMAIL, CATEGORIES, imageSources, CORRECTIONS, illustrationNote, buildFixtures
} = require('../data/discoveryFixtures');
const { propertyTypeKey } = require('../services/recommendationKeys');

const outputDir = path.join(root, '.local', 'discovery-seed-20261008');
const snapshotPath = path.join(outputDir, 'before.json');
const assetsPath = path.join(outputDir, 'assets.json');
const journalPath = path.join(outputDir, 'journal.json');
const PROPERTY_SELECT = 'id,title,description,property_type,listing_type,thumbnail,address_detail,updated_at,owner_id,price,area,bedrooms,bathrooms,status,is_hidden,property_images(id,property_id,image_url),property_features(feature_name),lifestyle_tags(tag_name)';
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const readJson = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
const unwrap = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data || [];
};
const fetchProperties = async () => unwrap(await supabase.from('properties')
  .select(PROPERTY_SELECT).order('id').range(0, 999));
const isSeed = (property) => String(property.address_detail || '').startsWith(`Dữ liệu mẫu: ${SEED_ID}-`);
const countCategories = (properties) => Object.fromEntries(CATEGORIES.map((category) => [
  category, properties.filter((property) => property.property_type === category).length
]));
const getAsset = (assets, category, index) => assets.find((asset) => asset.category === category && asset.index === index);

const downloadAssets = async () => {
  const cached = readJson(assetsPath, []);
  const work = CATEGORIES.flatMap((category) => imageSources[category].map((source, index) => ({
    ...source, category, index, name: `${propertyTypeKey(category).toLowerCase()}-${index + 1}`
  })));
  const assets = [];
  const failures = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < work.length) {
      const item = work[cursor++];
      try {
        const previous = cached.find((asset) => asset.url === item.url && asset.category === item.category && asset.index === item.index);
        if (previous && fs.existsSync(previous.file)) {
          const bytes = fs.readFileSync(previous.file);
          assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), previous.sha256);
          assets.push({ ...previous, ...item });
          continue;
        }
        const response = await fetch(item.url, { signal: AbortSignal.timeout(40000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = (response.headers.get('content-type') || '').split(';')[0];
        assert.ok(contentType.startsWith('image/'), `Unexpected type ${contentType}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.ok(bytes.length > 2000 && bytes.length < 20000000, 'Invalid image size');
        const metadata = await sharp(bytes).metadata();
        assert.ok(metadata.width >= 350 && metadata.height >= 250, 'Image resolution is too low');
        const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
        const file = path.join(outputDir, 'images', `${item.name}.${extension}`);
        fs.writeFileSync(file, bytes);
        assets.push({ ...item, file, contentType, width: metadata.width, height: metadata.height,
          bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
        console.log(`Image ready: ${item.name} (${metadata.width}x${metadata.height})`);
      } catch (error) {
        failures.push({ name: item.name, source: item.source, error: error.message });
      }
    }
  }));
  assets.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.index - b.index);
  writeJson(assetsPath, assets);
  writeJson(path.join(outputDir, 'image-failures.json'), failures);
  if (failures.length) throw new Error(`Images unavailable: ${JSON.stringify(failures)}`);
  assert.equal(assets.length, 30);
  return assets;
};

const prepare = async () => {
  fs.mkdirSync(path.join(outputDir, 'images'), { recursive: true });
  const current = await fetchProperties();
  for (const correction of CORRECTIONS) {
    const property = current.find((row) => row.id === correction.id);
    assert.ok(property, `Missing property ${correction.id}`);
    for (const [field, value] of Object.entries(correction.before)) {
      assert.ok(property[field] === value || property[field] === correction.after[field],
        `Property ${property.id}.${field} changed; review before applying`);
    }
  }
  if (!fs.existsSync(snapshotPath)) {
    writeJson(snapshotPath, { seedId: SEED_ID, capturedAt: new Date().toISOString(), properties: current.filter((property) => !isSeed(property)) });
  }
  const assets = await downloadAssets();
  const fixtures = buildFixtures();
  assert.equal(fixtures.length, 60);
  assert.equal(new Set(fixtures.map((fixture) => fixture.key)).size, 60);
  for (const category of CATEGORIES) assert.equal(fixtures.filter((fixture) => fixture.category === category).length, 10);
  for (const fixture of fixtures) {
    assert.ok(fixture.property.price > 0 && fixture.property.area > 0);
    assert.equal(fixture.property.listing_type, 'RENT');
    assert.ok(fixture.property.title.startsWith('[Mẫu]'));
    assert.ok(getAsset(assets, fixture.category, fixture.imageIndex));
  }
  const snapshot = readJson(snapshotPath);
  const plan = { seedId: SEED_ID, corrections: CORRECTIONS.map(({ id, after }) => ({ id, after })),
    previousPropertiesToRefresh: snapshot.properties.length, additions: countCategories(fixtures.map((fixture) => fixture.property)),
    totalAdditions: fixtures.length, downloadedImages: assets.length,
    existingCounts: countCategories(current), ownerEmail: OWNER_EMAIL };
  writeJson(path.join(outputDir, 'plan.json'), plan);
  console.log(JSON.stringify(plan, null, 2));
};

const apply = async () => {
  assert.ok(fs.existsSync(snapshotPath) && fs.existsSync(assetsPath), 'Run --prepare first');
  const snapshot = readJson(snapshotPath);
  const assets = readJson(assetsPath);
  assert.equal(assets.length, 30);
  const journal = readJson(journalPath, { seedId: SEED_ID, refreshed: [], insertedIds: [], imageChanges: [], ownerCreated: false });
  const saveJournal = () => writeJson(journalPath, journal);
  const current = await fetchProperties();
  // Check for concurrent listing edits before performing any database writes.
  for (const original of snapshot.properties) {
    const property = current.find((row) => row.id === original.id);
    assert.ok(property, `Original listing ${original.id} is missing`);
    if (!journal.refreshed.includes(original.id)) {
      assert.equal(property.updated_at, original.updated_at, `Listing ${original.id} was edited since backup`);
      for (const field of ['title', 'description', 'property_type', 'thumbnail']) {
        assert.equal(property[field], original[field], `Listing ${original.id}.${field} was edited since backup`);
      }
      assert.deepEqual(property.property_images, original.property_images, `Listing ${original.id} images changed since backup`);
    }
  }

  // Preserve downloaded bytes and host them in this project's existing public image bucket.
  for (const asset of assets) {
    if (asset.publicUrl) continue;
    const bytes = fs.readFileSync(asset.file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const storagePath = `demo/${SEED_ID}/${path.basename(asset.file)}`;
    const response = await supabase.storage.from('property-images').upload(storagePath, bytes, {
      contentType: asset.contentType, upsert: false, cacheControl: '31536000'
    });
    if (response.error && response.error.statusCode !== '409' && !/already exists|duplicate/i.test(response.error.message)) {
      throw new Error(response.error.message);
    }
    asset.publicUrl = supabase.storage.from('property-images').getPublicUrl(storagePath).data.publicUrl;
    writeJson(assetsPath, assets);
    console.log(`Image hosted: ${asset.name}`);
  }

  let owner = unwrap(await supabase.from('users').select('id,role,trust_score,is_active').eq('email', OWNER_EMAIL))[0];
  if (!owner) {
    owner = unwrap(await supabase.from('users').insert({ name: 'Nhà mẫu Swipe Nest', email: OWNER_EMAIL,
      password: null, role: 'AGENT', trust_score: 50, is_active: false })
      .select('id,role,trust_score,is_active'))[0];
    journal.ownerCreated = true;
  }
  assert.ok(owner && owner.role === 'AGENT' && owner.trust_score > 30 && owner.is_active === false,
    'The fixture owner must be a disabled demo agent with a valid browsing trust score');
  journal.ownerId = owner.id;
  saveJournal();

  const categoryCounter = {};
  const oldImageUpdates = [];
  const oldMissingImages = [];
  for (const original of snapshot.properties) {
    const correction = CORRECTIONS.find((item) => item.id === original.id);
    const category = correction?.after.property_type || original.property_type;
    assert.ok(CATEGORIES.includes(category), `Unknown category ${category}`);
    const index = (categoryCounter[category] || 0) % imageSources[category].length;
    categoryCounter[category] = (categoryCounter[category] || 0) + 1;
    const asset = getAsset(assets, category, index);
    if (!journal.refreshed.includes(original.id)) {
      const fields = { ...correction?.after, thumbnail: asset.publicUrl,
        description: `${original.description || ''}\n\n${illustrationNote(asset)}`,
        updated_at: new Date().toISOString() };
      let query = supabase.from('properties').update(fields).eq('id', original.id);
      query = original.updated_at ? query.eq('updated_at', original.updated_at) : query.is('updated_at', null);
      const updated = unwrap(await query.select('id'));
      assert.equal(updated.length, 1, `Listing ${original.id} changed during update`);
      journal.refreshed.push(original.id);
      saveJournal();
    }
    // Reuse existing gallery row IDs and preserve originals in before.json.
    if (original.property_images.length) {
      original.property_images.forEach((image) => oldImageUpdates.push({
        id: image.id, property_id: original.id, image_url: asset.publicUrl
      }));
    } else {
      oldMissingImages.push({ property_id: original.id, image_url: asset.publicUrl });
    }
  }
  if (oldImageUpdates.length) {
    unwrap(await supabase.from('property_images').upsert(oldImageUpdates, { onConflict: 'id' }).select('id'));
    journal.imageChanges = oldImageUpdates.map((image) => image.id);
    saveJournal();
  }
  const missingIds = oldMissingImages.map((image) => image.property_id);
  if (missingIds.length) {
    const existing = unwrap(await supabase.from('property_images').select('property_id,image_url').in('property_id', missingIds));
    const toInsert = oldMissingImages.filter((image) => !existing.some((row) => row.property_id === image.property_id && row.image_url === image.image_url));
    if (toInsert.length) {
      journal.addedOldImageRows = unwrap(await supabase.from('property_images').insert(toInsert).select('id,property_id'));
      saveJournal();
    }
  }
  console.log(`Existing listing images refreshed: ${journal.refreshed.length}`);

  const fixtures = buildFixtures();
  const existingSeed = current.filter(isSeed);
  const toInsert = fixtures.filter((fixture) => !existingSeed.some((property) => property.address_detail === fixture.property.address_detail));
  for (const property of existingSeed) assert.equal(property.owner_id, owner.id, 'Seed owner mismatch');
  if (toInsert.length) {
    const inserted = unwrap(await supabase.from('properties').insert(toInsert.map((fixture) => {
      const asset = getAsset(assets, fixture.category, fixture.imageIndex);
      return { ...fixture.property, owner_id: owner.id, thumbnail: asset.publicUrl,
        description: `${fixture.property.description}\n\n${illustrationNote(asset)}` };
    })).select('id,address_detail'));
    journal.insertedIds = [...new Set([...journal.insertedIds, ...inserted.map((property) => property.id)])];
    saveJournal();
  }
  const seedProperties = (await fetchProperties()).filter(isSeed);
  assert.equal(seedProperties.length, 60);
  for (const [table, column, getValues] of [
    ['property_images', 'image_url', (fixture) => [getAsset(assets, fixture.category, fixture.imageIndex).publicUrl]],
    ['property_features', 'feature_name', (fixture) => fixture.features],
    ['lifestyle_tags', 'tag_name', (fixture) => fixture.tags]
  ]) {
    const existing = unwrap(await supabase.from(table).select(`property_id,${column}`).in('property_id', seedProperties.map((property) => property.id)));
    const rows = fixtures.flatMap((fixture) => {
      const property = seedProperties.find((row) => row.address_detail === fixture.property.address_detail);
      return getValues(fixture).filter((value) => !existing.some((row) => row.property_id === property.id && row[column] === value))
        .map((value) => ({ property_id: property.id, [column]: value }));
    });
    if (rows.length) unwrap(await supabase.from(table).insert(rows).select('id'));
  }
  journal.completedAt = new Date().toISOString();
  saveJournal();
  await verify();
};

const verify = async () => {
  const properties = await fetchProperties();
  const snapshot = readJson(snapshotPath);
  const assets = readJson(assetsPath);
  const seed = properties.filter(isSeed);
  const oldIds = new Set(snapshot.properties.map((property) => property.id));
  const old = properties.filter((property) => oldIds.has(property.id));
  assert.equal(seed.length, 60);
  assert.equal(old.length, snapshot.properties.length);
  for (const category of CATEGORIES) assert.equal(seed.filter((property) => property.property_type === category).length, 10);
  for (const correction of CORRECTIONS) {
    const property = properties.find((row) => row.id === correction.id);
    for (const [field, value] of Object.entries(correction.after)) assert.equal(property[field], value);
  }
  const allowedUrls = new Set(assets.map((asset) => asset.publicUrl));
  for (const property of [...old, ...seed]) {
    const typeAssets = assets.filter((asset) => asset.category === property.property_type);
    assert.ok(typeAssets.some((asset) => asset.publicUrl === property.thumbnail), `Wrong thumbnail category ${property.id}`);
    assert.ok(property.property_images.length > 0, `No gallery ${property.id}`);
    assert.ok(property.property_images.every((image) => allowedUrls.has(image.image_url)
      && typeAssets.some((asset) => asset.publicUrl === image.image_url)), `Wrong gallery category ${property.id}`);
    assert.equal(property.property_images[0].image_url, property.thumbnail);
    assert.ok(property.description.includes('Ảnh minh họa bất động sản tại'));
  }
  for (const property of seed) {
    assert.equal(property.listing_type, 'RENT');
    assert.equal(property.status, 'AVAILABLE');
    assert.equal(property.is_hidden, false);
    assert.ok(property.price > 0 && property.area > 0);
    assert.ok(property.property_features.length >= 3 && property.lifestyle_tags.length >= 2);
  }
  // Verify through the same repository and list service used by discovery.
  const repository = require('../repositories/propertyRepository');
  const service = require('../services/propertyService');
  const recommendationService = require('../services/recommendationService');
  const demoOwnerId = readJson(journalPath).ownerId;
  const candidates = await repository.fetchRecommendationCandidates('RENT', 500);
  const checks = [];
  for (const category of CATEGORIES) {
    const list = await service.getProperties(100, category);
    assert.ok(list.every((property) => property.property_type === category), `Mixed categories ${category}`);
    const newIds = seed.filter((property) => property.property_type === category).map((property) => property.id);
    assert.ok(newIds.every((id) => list.some((property) => property.id === id)), `Missing public seed ${category}`);
    assert.ok(newIds.every((id) => candidates.some((property) => property.id === id)), `Missing recommendation seed ${category}`);
    // The dedicated demo account has no saved preferences or feedback.
    const feed = await recommendationService.getRecommendations(demoOwnerId, { category, limit: 24 });
    assert.ok(feed.properties.every((property) => property.property_type === category), `Mixed recommendation categories ${category}`);
    assert.ok(newIds.every((id) => feed.properties.some((property) => property.id === id)), `Missing ranked seed ${category}`);
    checks.push({ category, added: newIds.length, publicCount: list.length, recommendationCount: feed.properties.length });
  }
  for (const asset of assets) {
    const response = await fetch(asset.publicUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `Hosted image unavailable: ${asset.name}`);
    assert.ok((response.headers.get('content-type') || '').startsWith('image/'));
  }
  const report = { seedId: SEED_ID, verifiedAt: new Date().toISOString(), total: properties.length,
    originalImagesRefreshed: old.length, newListings: seed.length, hostedVietnamImages: assets.length,
    totalCounts: countCategories(properties), checks,
    corrections: CORRECTIONS.map(({ id }) => {
      const property = properties.find((row) => row.id === id);
      return { id, title: property.title, property_type: property.property_type };
    }) };
  writeJson(path.join(outputDir, 'verification.json'), report);
  console.log(JSON.stringify(report, null, 2));
};

const mode = process.argv[2];
({ '--prepare': prepare, '--apply': apply, '--verify': verify }[mode] || (() => {
  throw new Error('Use --prepare, --apply, or --verify');
}))().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
