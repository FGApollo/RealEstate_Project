const { supabase } = require('../config/supabase');
const propertyService = require('../services/propertyService');

const runTests = async () => {
  console.log('--- STARTING FLOW VERIFICATION TESTS (DELETION ONLY) ---');

  // A tiny 1x1 transparent PNG base64 string
  const base64Image1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  const testListingData = {
    owner_id: 29,
    title: 'Test Flow Verification Listing (Deletion Only)',
    description: 'This is a test listing to verify storage cleanup on deletion.',
    price: 15000000,
    area: 50,
    bedrooms: 2,
    bathrooms: 1,
    property_type: 'Căn Hộ',
    status: 'AVAILABLE',
    city: 'Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Bến Nghé',
    floor_range: 'Trung',
    address_detail: '123 Nguyễn Huệ',
    address: '123 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh',
    thumbnail: base64Image1,
    virtual_tour_url: null,
    contact_phone: '0987654321',
    latitude: 10.775,
    longitude: 106.702,
    features: ['Wifi'],
    images: [base64Image1],
    lifestyle_tags: ['Gần trung tâm']
  };

  // --- TEST: Creation ---
  console.log('\nCreating test property...');
  const property = await propertyService.createProperty(testListingData);
  const propertyId = property.id;
  console.log(`Property created with ID: ${propertyId}`);
  console.log('Thumbnail URL:', property.thumbnail);

  // Fetch created property images from db
  const { data: dbImages } = await supabase
    .from('property_images')
    .select('image_url')
    .eq('property_id', propertyId);

  console.log('Database Image URLs:', dbImages.map(img => img.image_url));

  // Count files in listings/ storage bucket to verify upload worked
  const { data: objectsAfterCreate } = await supabase.storage
    .from('property-images')
    .list('listings', { limit: 1000 });

  const activeTestFiles = objectsAfterCreate.filter(obj => {
    return property.thumbnail.includes(obj.name) || dbImages.some(img => img.image_url.includes(obj.name));
  });

  console.log(`Uploaded test files in storage: ${activeTestFiles.length}`);
  activeTestFiles.forEach(file => console.log(` - listings/${file.name}`));

  if (activeTestFiles.length === 0) {
    throw new Error('Test failed: no files uploaded to storage.');
  }

  // --- TEST: Deletion and Full Cleanup ---
  console.log('\nDeleting property...');
  await propertyService.deleteProperty(propertyId, 29);
  console.log(`Property ${propertyId} deleted from DB.`);

  // Check storage objects one last time
  const { data: objectsAfterDelete } = await supabase.storage
    .from('property-images')
    .list('listings', { limit: 1000 });

  const testFilesRemaining = objectsAfterDelete.filter(obj => {
    return activeTestFiles.some(f => f.name === obj.name);
  });

  console.log(`Test files remaining in storage after deletion: ${testFilesRemaining.length}`);
  if (testFilesRemaining.length !== 0) {
    throw new Error(`Deletion cleanup test failed: expected 0 files in storage, found ${testFilesRemaining.length}`);
  }
  console.log('✓ Deletion cleanup test passed successfully.');

  console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
};

runTests().catch(err => {
  console.error('\n❌ Test run failed:', err);
  process.exit(1);
});
