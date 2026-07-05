const { supabase } = require('../config/supabase');

const run = async () => {
  console.log('--- STARTING ORPHAN IMAGES CLEANUP ---');

  // 1. Fetch all objects in Supabase storage bucket 'property-images' under 'listings/' folder
  console.log('Fetching objects from storage bucket...');
  const { data: objects, error: listError } = await supabase.storage
    .from('property-images')
    .list('listings', { limit: 1000 });

  if (listError) {
    console.error('Error listing storage objects:', listError.message);
    process.exit(1);
  }

  console.log(`Found ${objects.length} total files in listings/ folder.`);

  // 2. Fetch all referenced image URLs from DB
  console.log('Fetching active image references from database...');
  const { data: properties, error: propError } = await supabase
    .from('properties')
    .select('id, thumbnail');

  if (propError) {
    console.error('Error fetching properties:', propError.message);
    process.exit(1);
  }

  const { data: propImages, error: imgError } = await supabase
    .from('property_images')
    .select('id, image_url');

  if (imgError) {
    console.error('Error fetching property images:', imgError.message);
    process.exit(1);
  }

  // Compile a set of active relative file paths in bucket
  const activePaths = new Set();
  const bucketPrefix = '/storage/v1/object/public/property-images/';

  const processUrl = (url) => {
    if (!url) return;
    const index = url.indexOf(bucketPrefix);
    if (index !== -1) {
      const filePath = url.substring(index + bucketPrefix.length);
      activePaths.add(filePath);
    }
  };

  properties.forEach(p => processUrl(p.thumbnail));
  propImages.forEach(img => processUrl(img.image_url));

  console.log(`Found ${activePaths.size} unique active files referenced in the database.`);

  // 3. Find orphaned files
  const orphans = [];
  objects.forEach(obj => {
    // Objects returned by list() don't include the folder prefix in their name,
    // so we need to add the prefix 'listings/'
    const filePath = `listings/${obj.name}`;
    if (!activePaths.has(filePath)) {
      orphans.push(filePath);
    }
  });

  console.log(`Identified ${orphans.length} orphaned image files:`, orphans);

  // 4. Delete orphaned files if any
  if (orphans.length > 0) {
    console.log(`Deleting ${orphans.length} orphaned files from Supabase storage...`);
    const { data: delData, error: delError } = await supabase.storage
      .from('property-images')
      .remove(orphans);

    if (delError) {
      console.error('Error deleting orphan files:', delError.message);
    } else {
      console.log('Successfully deleted orphan files:', delData);
    }
  } else {
    console.log('No orphaned files found to delete.');
  }

  console.log('--- CLEANUP COMPLETED ---');
  process.exit(0);
};

run().catch(err => {
  console.error('Cleanup run failed:', err);
  process.exit(1);
});
