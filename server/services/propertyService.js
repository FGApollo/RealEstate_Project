const { supabase } = require('../config/supabase');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// TODO: TEMPORARY MOCK - This function currently mocks image uploads by returning a random Unsplash image URL.
// This is a temporary solution to bypass database varchar(500) limit for base64 string inserts,
// until the PM configures a dedicated Supabase Storage bucket.
const saveBase64Image = (base64Str) => {
  const isPlaceholder = !base64Str || base64Str === 'https://via.placeholder.com/400';
  
  if (isPlaceholder) {
    return base64Str;
  }

  if (typeof base64Str === 'string' && (base64Str.startsWith('http://') || base64Str.startsWith('https://') || base64Str.startsWith('/uploads/'))) {
    return base64Str;
  }

  if (typeof base64Str !== 'string' || !base64Str.startsWith('data:image/')) {
    return base64Str;
  }

  try {
    const matches = base64Str.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64Str;
    }

    const imageType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const filename = `${crypto.randomUUID()}.${imageType}`;
    const uploadDir = path.join(__dirname, '../public/uploads');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, buffer);

    return `http://localhost:3000/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving base64 image:', err);
    return base64Str;
  }
};

// Sync a child table: delete all rows for this property then re-insert.
const syncRelatedRows = async (table, idField, propertyId, rows) => {
  const { error: delErr } = await supabase.from(table).delete().eq(idField, propertyId);
  if (delErr) throw new Error(delErr.message);
  if (rows && rows.length > 0) {
    const { error: insErr } = await supabase.from(table).insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
};

const getProperties = async () => {
  const { data, error } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url),
      lifestyle_tags(tag_name),
      owner:users!owner_id(name, role, avatar, trust_score, created_at)
    `);

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const createProperty = async (propertyData) => {
  const {
    owner_id,
    title,
    description,
    price,
    area,
    bedrooms,
    bathrooms,
    property_type,
    status,
    city,
    district,
    ward,
    floor_range,
    address,
    address_detail,
    thumbnail,
    virtual_tour_url,
    contact_phone,
    latitude,
    longitude,
    features,
    images,
    lifestyle_tags
  } = propertyData;

  console.log('createProperty service called. Title:', title);
  console.log('thumbnail input length:', thumbnail ? thumbnail.length : 'empty');
  
  // Save thumbnail locally if base64
  const savedThumbnail = saveBase64Image(thumbnail);
  console.log('savedThumbnail output length:', savedThumbnail ? savedThumbnail.length : 'empty');

  // Insert into properties table
  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .insert([{
      owner_id,
      title,
      description,
      price: parseFloat(price) || 0,
      area: parseFloat(area) || 0,
      bedrooms: parseInt(bedrooms) || 0,
      bathrooms: parseInt(bathrooms) || 0,
      property_type,
      status: status || 'AVAILABLE',
      city,
      district,
      ward,
      floor_range,
      address,
      address_detail,
      thumbnail: savedThumbnail,
      virtual_tour_url,
      contact_phone,
      latitude: parseFloat(latitude) || null,
      longitude: parseFloat(longitude) || null,
      views: 0
    }])
    .select()
    .single();

  if (propertyError) {
    console.error('Supabase Properties Table Insert Error:', propertyError);
    throw new Error(propertyError.message);
  }

  const propertyId = property.id;

  // Insert features if provided
  if (features && features.length > 0) {
    const featureRecords = features.map(name => ({
      property_id: propertyId,
      feature_name: name
    }));
    const { error: featuresError } = await supabase
      .from('property_features')
      .insert(featureRecords);
    
    if (featuresError) throw new Error(featuresError.message);
  }

  // Insert images if provided
  if (images && images.length > 0) {
    const imageRecords = images.map(url => ({
      property_id: propertyId,
      image_url: saveBase64Image(url)
    }));
    const { error: imagesError } = await supabase
      .from('property_images')
      .insert(imageRecords);

    if (imagesError) throw new Error(imagesError.message);
  }

  // Insert lifestyle tags if provided
  if (lifestyle_tags && lifestyle_tags.length > 0) {
    const tagRecords = lifestyle_tags.map(tag => ({
      property_id: propertyId,
      tag_name: tag
    }));
    const { error: tagsError } = await supabase
      .from('lifestyle_tags')
      .insert(tagRecords);

    if (tagsError) throw new Error(tagsError.message);
  }

  // Recalculate similarity and link
  try {
    const { similarProperties } = await checkSimilarity(property, property.id);
    const differentOwnerProperties = similarProperties.filter(p => p.owner_id !== property.owner_id);
    await createSimilarityLinks(property.id, differentOwnerProperties);
  } catch (err) {
    console.error('Failed to link similar properties on creation:', err);
  }

  return property;
};

const getPropertyById = async (id) => {
  const { data, error } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url),
      lifestyle_tags(tag_name),
      owner:users!owner_id(name, role, avatar, trust_score, created_at)
    `)
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const updateProperty = async (id, propertyData) => {

  const { features, images, lifestyle_tags, ...fields } = propertyData;

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .update({
      ...fields,
      price: parseFloat(fields.price) || 0,
      area: parseFloat(fields.area) || 0,
      bedrooms: parseInt(fields.bedrooms) || 0,
      bathrooms: parseInt(fields.bathrooms) || 0,
      status: fields.status || 'AVAILABLE',
      thumbnail: saveBase64Image(fields.thumbnail),
      latitude: parseFloat(fields.latitude) || null,
      longitude: parseFloat(fields.longitude) || null
    })
    .eq('id', id)
    .select()
    .single();

  if (propertyError) {
    console.error('Supabase Properties Table Update Error:', propertyError);
    throw new Error(propertyError.message);
  }

  await syncRelatedRows('property_features', 'property_id', id,
    features?.map(name => ({ property_id: id, feature_name: name })));

  await syncRelatedRows('property_images', 'property_id', id,
    images?.map(url => ({ property_id: id, image_url: saveBase64Image(url) })));

  await syncRelatedRows('lifestyle_tags', 'property_id', id,
    lifestyle_tags?.map(tag => ({ property_id: id, tag_name: tag })));

  // Recalculate similarity and link on update
  try {
    await supabase
      .from('property_links')
      .delete()
      .or(`property_id_1.eq.${id},property_id_2.eq.${id}`);

    const { similarProperties } = await checkSimilarity(property, property.id);
    const differentOwnerProperties = similarProperties.filter(p => p.owner_id !== property.owner_id);
    await createSimilarityLinks(property.id, differentOwnerProperties);
  } catch (err) {
    console.error('Failed to link similar properties on update:', err);
  }

  return property;
};

const deleteProperty = async (id) => {
  // Delete child records first (cascade)
  await supabase.from('property_features').delete().eq('property_id', id);
  await supabase.from('property_images').delete().eq('property_id', id);
  await supabase.from('lifestyle_tags').delete().eq('property_id', id);

  const { error } = await supabase.from('properties').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

const checkSimilarity = async (propertyData, excludeId = null) => {
  const {
    latitude,
    longitude,
    property_type,
    bedrooms,
    bathrooms,
    area,
    floor_range,
    owner_id
  } = propertyData;

  if (!latitude || !longitude) {
    return { similarOwn: false, similarOther: false, similarProperties: [] };
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const propArea = parseFloat(area);

  // Search properties with coordinates ±0.00045, same type, bedrooms, bathrooms, and area ±5%
  const { data: candidates, error } = await supabase
    .from('properties')
    .select('*')
    .gte('latitude', lat - 0.00045)
    .lte('latitude', lat + 0.00045)
    .gte('longitude', lng - 0.00045)
    .lte('longitude', lng + 0.00045)
    .eq('property_type', property_type)
    .eq('bedrooms', parseInt(bedrooms) || 0)
    .eq('bathrooms', parseInt(bathrooms) || 0)
    .gte('area', propArea * 0.95)
    .lte('area', propArea * 1.05);

  if (error) {
    console.error('Error in checkSimilarity:', error);
    return { similarOwn: false, similarOther: false, similarProperties: [] };
  }

  let filteredCandidates = candidates || [];

  if (excludeId) {
    filteredCandidates = filteredCandidates.filter(p => p.id !== Number(excludeId));
  }

  // If property type is 'Chung Cư' or 'Căn Hộ', check floor_range (Khoảng tầng)
  if (property_type === 'Chung Cư' || property_type === 'Căn Hộ') {
    filteredCandidates = filteredCandidates.filter(p => {
      const f1 = (p.floor_range || '').trim().toLowerCase();
      const f2 = (floor_range || '').trim().toLowerCase();
      return f1 === f2;
    });
  }

  const similarOwn = filteredCandidates.some(p => p.owner_id === Number(owner_id));
  const similarOther = filteredCandidates.some(p => p.owner_id !== Number(owner_id));

  return {
    similarOwn,
    similarOther,
    similarProperties: filteredCandidates
  };
};

const createSimilarityLinks = async (propertyId, similarProperties) => {
  if (!similarProperties || similarProperties.length === 0) return;

  const propId = Number(propertyId);
  const linkInserts = similarProperties.map(p => {
    const id1 = Math.min(propId, p.id);
    const id2 = Math.max(propId, p.id);
    return { property_id_1: id1, property_id_2: id2 };
  });

  const uniqueInserts = [];
  const seenKeys = new Set();
  linkInserts.forEach(link => {
    const key = `${link.property_id_1}-${link.property_id_2}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueInserts.push(link);
    }
  });

  const { error } = await supabase
    .from('property_links')
    .upsert(uniqueInserts, { onConflict: 'property_id_1,property_id_2' });

  if (error) {
    console.error('Error inserting similarity links:', error);
  }
};

const getSimilarProperties = async (propertyId) => {
  const propId = Number(propertyId);

  const { data: links, error } = await supabase
    .from('property_links')
    .select('property_id_1, property_id_2')
    .or(`property_id_1.eq.${propId},property_id_2.eq.${propId}`);

  if (error) {
    console.error('Error getting property links:', error);
    return [];
  }

  if (!links || links.length === 0) return [];

  const similarIds = links.map(l => l.property_id_1 === propId ? l.property_id_2 : l.property_id_1);

  const { data: properties, error: propsError } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url),
      lifestyle_tags(tag_name),
      owner:users!owner_id(name, role, avatar, trust_score, created_at)
    `)
    .in('id', similarIds);

  if (propsError) {
    console.error('Error fetching similar properties details:', propsError);
    return [];
  }

  return properties || [];
};

module.exports = {
  getProperties,
  createProperty,
  getPropertyById,
  updateProperty,
  deleteProperty,
  checkSimilarity,
  getSimilarProperties
};
