const { supabase } = require('../config/supabase');

const seedProperties = async () => {
  try {
    const { data: existing, error: checkError } = await supabase
      .from('properties')
      .select('id')
      .limit(1);

    if (checkError) {
      console.warn('Note: Could not check properties table (it might not be created yet):', checkError.message);
      return;
    }

    if (existing && existing.length > 0) {
      return; // Already seeded
    }

    // Try to get a user to own the properties, fallback to null
    const { data: users } = await supabase.from('users').select('id').limit(1);
    const ownerId = users && users.length > 0 ? users[0].id : null;

    const sampleProperties = [
      {
        owner_id: ownerId,
        title: 'The Azure Signature Villa',
        description: 'Biệt thự sân vườn cao cấp với view hồ bơi tràn bờ cực đẹp tại khu Thảo Điền.',
        price: 24500000000,
        area: 350,
        bedrooms: 4,
        bathrooms: 5,
        address: 'Thảo Điền, Quận 2',
        city: 'TP.HCM',
        property_type: 'Biệt Thự',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
        contact_phone: '0901234567',
        views: 120
      },
      {
        owner_id: ownerId,
        title: 'Skyrise Penthouse',
        description: 'Căn Penthouse sang trọng tầng cao nhất của tháp Landmark với tầm nhìn panorama toàn thành phố.',
        price: 12800000000,
        area: 100,
        bedrooms: 3,
        bathrooms: 2,
        address: 'Vinhomes Central Park, Bình Thạnh',
        city: 'TP.HCM',
        property_type: 'Căn Hộ',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0907654321',
        views: 85
      },
      {
        owner_id: ownerId,
        title: 'Minimalist Studio',
        description: 'Căn hộ studio phong cách tối giản Nhật Bản, nội thất thông minh tối ưu không gian.',
        price: 4200000000,
        area: 65,
        bedrooms: 1,
        bathrooms: 1,
        address: 'Phường Bến Nghé, Quận 1',
        city: 'TP.HCM',
        property_type: 'Căn Hộ',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0909998888',
        views: 200
      }
    ];

    const { data: inserted, error: insertError } = await supabase
      .from('properties')
      .insert(sampleProperties)
      .select();

    if (insertError) {
      console.error('Error seeding properties:', insertError.message);
    } else if (inserted && inserted.length > 0) {
      console.log('Seeded sample properties successfully.');
      
      // Let's seed features and images for these properties
      const azureId = inserted.find(p => p.title === 'The Azure Signature Villa')?.id;
      const skyriseId = inserted.find(p => p.title === 'Skyrise Penthouse')?.id;
      const studioId = inserted.find(p => p.title === 'Minimalist Studio')?.id;

      const features = [];
      const images = [];

      if (azureId) {
        features.push(
          { property_id: azureId, feature_name: 'Hồ bơi riêng' },
          { property_id: azureId, feature_name: 'Sân vườn rộng' },
          { property_id: azureId, feature_name: 'Gara xe hơi' }
        );
        images.push(
          { property_id: azureId, image_url: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80' }
        );
      }

      if (skyriseId) {
        features.push(
          { property_id: skyriseId, feature_name: 'View toàn thành phố' },
          { property_id: skyriseId, feature_name: 'Thang máy riêng' }
        );
      }

      if (studioId) {
        features.push(
          { property_id: studioId, feature_name: 'Nội thất thông minh' },
          { property_id: studioId, feature_name: 'Gần trạm Metro' }
        );
      }

      if (features.length > 0) {
        await supabase.from('property_features').insert(features);
      }
      if (images.length > 0) {
        await supabase.from('property_images').insert(images);
      }
    }
  } catch (error) {
    console.error('Seeding crashed:', error);
  }
};

const getProperties = async () => {
  await seedProperties();

  const { data, error } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url)
    `);

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

module.exports = {
  getProperties,
  seedProperties
};
