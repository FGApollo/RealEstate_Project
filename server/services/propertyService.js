const { supabase } = require('../config/supabase');

const seedProperties = async () => {
  try {
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
      },
      {
        owner_id: ownerId,
        title: 'Đất Nền Ven Biển Mỹ Khê',
        description: 'Lô đất nền ven biển vị trí đắc địa, ngay sát bãi tắm Mỹ Khê. Thích hợp xây dựng khách sạn, nhà hàng, căn hộ dịch vụ cao cấp.',
        price: 18500000000,
        area: 150,
        bedrooms: 0,
        bathrooms: 0,
        address: 'Võ Nguyên Giáp, Ngũ Hành Sơn',
        city: 'Đà Nẵng',
        property_type: 'Đất Nền',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0901234567',
        views: 45
      },
      {
        owner_id: ownerId,
        title: 'Đất Dự Án Hòa Xuân Nam',
        description: 'Đất nền đảo vip Hòa Xuân, 2 mặt tiền hướng sông mát mẻ. Hạ tầng đồng bộ, sổ đỏ chính chủ công chứng ngay.',
        price: 4900000000,
        area: 125,
        bedrooms: 0,
        bathrooms: 0,
        address: 'Đảo VIP Hòa Xuân, Cẩm Lệ',
        city: 'Đà Nẵng',
        property_type: 'Đất Nền',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0905111222',
        views: 30
      },
      {
        owner_id: ownerId,
        title: 'Đất Thổ Cư Trảng Bom',
        description: 'Đất thổ cư giá rẻ gần khu công nghiệp Trảng Bom, đường nhựa 8m xe tải tránh nhau thoải mái. Phù hợp mua xây trọ.',
        price: 1200000000,
        area: 100,
        bedrooms: 0,
        bathrooms: 0,
        address: 'Trảng Bom',
        city: 'Đồng Nai',
        property_type: 'Đất Nền',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1504609773096-104ff2c73ba4?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0912345678',
        views: 12
      },
      {
        owner_id: ownerId,
        title: 'The Glass Horizon Villa',
        description: 'Biệt thự kính phong cách Địa Trung Hải tối giản, view đồi Beverly Hills lộng lẫy về đêm. Tích hợp bể bơi tràn bờ nước mặn và rạp chiếu phim gia đình.',
        price: 195000000000,
        area: 740,
        bedrooms: 5,
        bathrooms: 6,
        address: 'Beverly Hills, Los Angeles',
        city: 'California',
        property_type: 'Biệt Thự',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
        contact_phone: '0988777999',
        views: 310
      },
      {
        owner_id: ownerId,
        title: 'Ocean Edge Cliffside Mansion',
        description: 'Biệt thự triệu đô tọa lạc đỉnh vách đá Sơn Trà, view biển rộng mở 270 độ. Thiết kế nội thất nhập khẩu trực tiếp từ Ý.',
        price: 85000000000,
        area: 550,
        bedrooms: 4,
        bathrooms: 5,
        address: 'Bán đảo Sơn Trà, Thọ Quang',
        city: 'Đà Nẵng',
        property_type: 'Biệt Thự',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0909000111',
        views: 155
      },
      {
        owner_id: ownerId,
        title: 'Vinhomes Riverside Lake Villa',
        description: 'Biệt thự đơn lập ven hồ sinh thái khu Bằng Lăng. Sân vườn rộng lớn, an ninh 3 lớp bảo vệ 24/7 khép kín hoàn toàn.',
        price: 52000000000,
        area: 380,
        bedrooms: 4,
        bathrooms: 4,
        address: 'Vinhomes Riverside, Long Biên',
        city: 'Hà Nội',
        property_type: 'Biệt Thự',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0903888777',
        views: 190
      },
      {
        owner_id: ownerId,
        title: 'Nhà Phố Cổ Điển Trần Hưng Đạo',
        description: 'Nhà phố trung tâm Quận 1 mặt tiền rộng 6m. Thiết kế phong cách Đông Dương (Indochine) thanh lịch, thích hợp mở showroom thời trang hoặc spa cao cấp.',
        price: 29500000000,
        area: 95,
        bedrooms: 3,
        bathrooms: 3,
        address: 'Trần Hưng Đạo, Cô Giang, Quận 1',
        city: 'TP.HCM',
        property_type: 'Nhà Ở',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0918222333',
        views: 75
      },
      {
        owner_id: ownerId,
        title: 'Nhà Phố Sân Vườn Melosa Garden',
        description: 'Nhà phố liền kề Khang Điền, đã hoàn thiện nội thất hiện đại. Có khoảng sân nhỏ trồng hoa hồng cổ tuyệt đẹp.',
        price: 11800000000,
        area: 120,
        bedrooms: 3,
        bathrooms: 4,
        address: 'Võ Chí Công, Phú Hữu, Quận 9',
        city: 'TP.HCM',
        property_type: 'Nhà Ở',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0934555666',
        views: 60
      },
      {
        owner_id: ownerId,
        title: 'Nhà Riêng Hẻm Nhựa Phú Nhuận',
        description: 'Nhà riêng kết cấu 1 trệt 2 lầu đúc bê tông cốt thép kiên cố. Hẻm nhựa 6m thông thoáng xe hơi quay đầu.',
        price: 8900000000,
        area: 68,
        bedrooms: 3,
        bathrooms: 3,
        address: 'Phan Xích Long, Phường 2, Phú Nhuận',
        city: 'TP.HCM',
        property_type: 'Nhà Ở',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0979999888',
        views: 110
      },
      {
        owner_id: ownerId,
        title: 'Masteri Thảo Điền Sky View',
        description: 'Căn hộ chung cư cao cấp tầng 32 Masteri Thảo Điền. View trọn vẹn sông Sài Gòn và bán đảo Thanh Đa xanh mát.',
        price: 4600000000,
        area: 72,
        bedrooms: 2,
        bathrooms: 2,
        address: 'Masteri Thảo Điền, Quận 2',
        city: 'TP.HCM',
        property_type: 'Chung Cư',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0912888999',
        views: 130
      },
      {
        owner_id: ownerId,
        title: 'Sun Grand City Horizon Loft',
        description: 'Căn hộ thiết kế duplex thông tầng Sun Grand City Thụy Khuê. View Hồ Tây tuyệt đẹp, ngắm hoàng hôn lãng mạn.',
        price: 9800000000,
        area: 110,
        bedrooms: 3,
        bathrooms: 2,
        address: 'Sun Grand City, Thụy Khuê, Tây Hồ',
        city: 'Hà Nội',
        property_type: 'Chung Cư',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0944555777',
        views: 95
      },
      {
        owner_id: ownerId,
        title: 'Chung Cư Sunview Town Giá Rẻ',
        description: 'Căn hộ chung cư ấm cúng thích hợp cho gia đình trẻ. Nội thất cơ bản bàn giao đẹp đẽ sạch sẽ đón tết.',
        price: 1950000000,
        area: 58,
        bedrooms: 2,
        bathrooms: 1,
        address: 'Sunview Town, Hiệp Bình Phước, Thủ Đức',
        city: 'TP.HCM',
        property_type: 'Chung Cư',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0909333444',
        views: 40
      },
      {
        owner_id: ownerId,
        title: 'Landmark 81 Grand Penthouse',
        description: 'Căn hộ siêu sang tọa lạc tầng cao nhất Landmark 81. Tận hưởng đặc quyền câu lạc bộ cư dân thượng lưu và hồ bơi vô cực trên không.',
        price: 38000000000,
        area: 165,
        bedrooms: 3,
        bathrooms: 3,
        address: 'Landmark 81, Vinhomes Central Park, Bình Thạnh',
        city: 'TP.HCM',
        property_type: 'Căn Hộ',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0911222333',
        views: 220
      },
      {
        owner_id: ownerId,
        title: 'Căn Hộ Studio Minimalist Thảo Điền',
        description: 'Căn hộ studio phong cách Bắc Âu hiện đại, tối giản, đầy đủ ánh sáng tự nhiên. Rất thích hợp cho người độc thân hoặc chuyên gia nước ngoài.',
        price: 2400000000,
        area: 45,
        bedrooms: 1,
        bathrooms: 1,
        address: 'Phường Thảo Điền, Quận 2',
        city: 'TP.HCM',
        property_type: 'Căn Hộ',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0989555999',
        views: 105
      },
      {
        owner_id: ownerId,
        title: 'Căn Hộ Estella Heights Luxury',
        description: 'Căn hộ Estella Heights Quận 2, dự án resort chuẩn quốc tế. Căn hộ ban công cực rộng, view công viên nội khu rợp bóng cây.',
        price: 7500000000,
        area: 104,
        bedrooms: 2,
        bathrooms: 2,
        address: 'Estella Heights, An Phú, Quận 2',
        city: 'TP.HCM',
        property_type: 'Căn Hộ',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
        contact_phone: '0916333777',
        views: 140
      }
    ];

    // Fetch all existing titles in a single query
    const { data: existingProps, error: checkError } = await supabase
      .from('properties')
      .select('title');

    if (checkError) {
      console.warn('Note: Could not check properties table:', checkError.message);
      return;
    }

    const existingTitles = new Set(existingProps ? existingProps.map(p => p.title) : []);
    const propertiesToInsert = sampleProperties.filter(prop => !existingTitles.has(prop.title));

    if (propertiesToInsert.length === 0) {
      console.log('All sample properties are already seeded.');
      return;
    }

    console.log(`Seeding ${propertiesToInsert.length} properties...`);

    for (const prop of propertiesToInsert) {
      const { data: inserted, error: insertError } = await supabase
        .from('properties')
        .insert(prop)
        .select();

      if (insertError) {
        console.error(`Error inserting property "${prop.title}":`, insertError.message);
      } else if (inserted && inserted.length > 0) {
        console.log(`Seeded property "${prop.title}" successfully.`);
        
        // Seed features
        const propId = inserted[0].id;
        const features = [];
        if (prop.property_type === 'Biệt Thự') {
          features.push(
            { property_id: propId, feature_name: 'Hồ bơi riêng' },
            { property_id: propId, feature_name: 'Sân vườn rộng' },
            { property_id: propId, feature_name: 'Gara xe hơi' }
          );
        } else if (prop.property_type === 'Căn Hộ' || prop.property_type === 'Chung Cư') {
          features.push(
            { property_id: propId, feature_name: 'Nội thất thông minh' },
            { property_id: propId, feature_name: 'Gần trạm Metro' }
          );
        } else if (prop.property_type === 'Đất Nền') {
          features.push(
            { property_id: propId, feature_name: 'Sổ hồng riêng' },
            { property_id: propId, feature_name: 'Mặt tiền rộng' }
          );
        } else {
          features.push(
            { property_id: propId, feature_name: 'Khu dân trí cao' }
          );
        }
        await supabase.from('property_features').insert(features);
      }
    }
  } catch (error) {
    console.error('Seeding crashed:', error);
  }
};

const getProperties = async () => {
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
