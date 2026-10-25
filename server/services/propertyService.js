const { supabase } = require('../config/supabase');
const { positiveId, propertyInput } = require('./businessValidation');
const { savePublicImage, deleteOwnedListingImage } = require('./publicImageStorage');
const saveBase64Image = (image, userId) => savePublicImage(image, 'listings', userId);

// Sync a child table: delete all rows for this property then re-insert.
const syncRelatedRows = async (table, idField, propertyId, rows) => {
  const { error: delErr } = await supabase.from(table).delete().eq(idField, propertyId);
  if (delErr) throw new Error(delErr.message);
  if (rows && rows.length > 0) {
    const { error: insErr } = await supabase.from(table).insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
};

const getProperties = async (limit = 24, propertyType = null) => {
  let query = supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url),
      lifestyle_tags(tag_name),
      owner:users!owner_id(name, role, avatar, trust_score)
    `)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .eq('status', 'AVAILABLE')
    .limit(limit);

  if (propertyType) query = query.ilike('property_type', propertyType);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  // Filter out any properties whose owner trust_score is 30 or below (<= 30)
  return (data || []).filter((p) => {
    const ownerScore = Number(p.owner?.trust_score ?? 50);
    return ownerScore > 30;
  });
};

const createProperty = async (propertyData) => {
  propertyInput(propertyData);
  positiveId(propertyData.owner_id, 'owner_id');
  const {
    owner_id,
    title,
    description,
    price,
    area,
    bedrooms,
    bathrooms,
    property_type,
    listing_type,
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

  if (!['RENT', 'SALE'].includes(listing_type)) {
    const error = new Error('Chọn tin cho thuê hoặc mua bán.');
    error.statusCode = 400;
    throw error;
  }

  console.log('createProperty service called. Title:', title);
  
  // Verify owner is an AGENT with adequate trust score (> 30) and verified KYC (F28)
  const { data: ownerUser, error: ownerError } = await supabase
    .from('users')
    .select('role, trust_score, verification_status')
    .eq('id', owner_id)
    .single();

  if (ownerError || !ownerUser || ownerUser.role !== 'AGENT') {
    const err = new Error('Chỉ tài khoản có vai trò Môi giới (AGENT) mới có quyền đăng tin.');
    err.statusCode = 403;
    throw err;
  }

  if (ownerUser.verification_status !== 'VERIFIED') {
    const err = new Error('Tài khoản chưa hoàn tất xác minh danh tính (KYC). Vui lòng hoàn tất KYC để đăng tin.');
    err.statusCode = 403;
    throw err;
  }

  const currentTrustScore = Number(ownerUser.trust_score ?? 50);
  if (currentTrustScore <= 30) {
    const err = new Error(`Điểm uy tín hiện tại của bạn là ${currentTrustScore} (từ 30 điểm trở xuống). Quyền đăng tin mới đã bị tạm đình chỉ do vi phạm quy định sàn. Bạn cần đạt từ 31 điểm trở lên để được mở lại quyền đăng bài.`);
    err.statusCode = 403;
    throw err;
  }

  // Validate contact phone format (F28)
  const cleanPhone = (contact_phone || '').trim().replace(/[\s().-]/g, '').replace(/^\+84/, '0');
  if (!/^0[35789]\d{8}$/.test(cleanPhone)) {
    const err = new Error('Số điện thoại liên hệ không hợp lệ. Vui lòng cung cấp số di động Việt Nam hợp lệ.');
    err.statusCode = 400;
    throw err;
  }

  // F32: Hard blocking for multi-listing portfolio descriptions
  const geminiService = require('./geminiService');
  if (description) {
    const spamCheck = await geminiService.checkDescriptionIsMultiListing(description);
    if (spamCheck.is_multi_listing) {
      const err = new Error(`Tin đăng bị từ chối: Mô tả vi phạm quy định giỏ hàng / nhiều căn hộ (${spamCheck.reason}).`);
      err.statusCode = 400;
      throw err;
    }
  }

  // F31: Silent penalty for duplicate own property (-50 priority score)
  const similarityResult = await checkSimilarity(propertyData);
  const duplicatePenalty = similarityResult.similarOwn ? -50 : 0;

  console.log('thumbnail input length:', thumbnail ? thumbnail.length : 'empty');
  
  // Save thumbnail locally/storage if base64
  const savedThumbnail = await saveBase64Image(thumbnail, owner_id);
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
      listing_type,
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
      priority_score: duplicatePenalty,
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
    const imageRecords = await Promise.all(images.map(async (url) => ({
      property_id: propertyId,
      image_url: await saveBase64Image(url, owner_id)
    })));
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
  id = positiveId(id);
  const { data, error } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url),
      lifestyle_tags(tag_name),
      owner:users!owner_id(name, role, avatar, trust_score)
    `)
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const getContactAgentId = async (id, requesterId) => {
  id = positiveId(id);
  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('id, owner_id, status, is_hidden')
    .eq('id', id)
    .maybeSingle();
  if (propertyError) throw new Error(propertyError.message);
  if (!property || property.status !== 'AVAILABLE' || property.is_hidden === true) {
    const error = new Error('Không tìm thấy tin đăng đang hoạt động.');
    error.statusCode = 404;
    throw error;
  }
  if (String(property.owner_id) === String(requesterId)) {
    const error = new Error('Bạn không thể tự nhắn tin cho chính mình.');
    error.statusCode = 400;
    throw error;
  }

  const { data: agent, error: agentError } = await supabase
    .from('users')
    .select('id, role, is_active, trust_score')
    .eq('id', property.owner_id)
    .maybeSingle();
  if (agentError) throw new Error(agentError.message);
  if (!agent || String(agent.role).toUpperCase() !== 'AGENT' || agent.is_active !== true
    || Number(agent.trust_score ?? 50) <= 30) {
    const error = new Error('Tin đăng không có môi giới để liên hệ.');
    error.statusCode = 404;
    throw error;
  }
  return agent.id;
};

const updateProperty = async (id, actorId, propertyData) => {
  id = positiveId(id);
  propertyInput(propertyData, { partial: true });
  const { features, images, lifestyle_tags } = propertyData;
  const editableFields = [
    'title', 'description', 'price', 'area', 'bedrooms', 'bathrooms', 'property_type', 'listing_type',
    'status', 'city', 'district', 'ward', 'floor_range', 'address', 'address_detail',
    'thumbnail', 'virtual_tour_url', 'contact_phone', 'latitude', 'longitude'
  ];
  const fields = Object.fromEntries(
    editableFields.filter((field) => Object.hasOwn(propertyData, field))
      .map((field) => [field, propertyData[field]])
  );
  if (Object.hasOwn(fields, 'listing_type') && !['RENT', 'SALE'].includes(fields.listing_type)) {
    const error = new Error('Chọn tin cho thuê hoặc mua bán.');
    error.statusCode = 400;
    throw error;
  }
  if (Object.hasOwn(fields, 'price')) fields.price = parseFloat(fields.price) || 0;
  if (Object.hasOwn(fields, 'area')) fields.area = parseFloat(fields.area) || 0;
  if (Object.hasOwn(fields, 'bedrooms')) fields.bedrooms = parseInt(fields.bedrooms, 10) || 0;
  if (Object.hasOwn(fields, 'bathrooms')) fields.bathrooms = parseInt(fields.bathrooms, 10) || 0;
  if (Object.hasOwn(fields, 'latitude')) fields.latitude = parseFloat(fields.latitude) || null;
  if (Object.hasOwn(fields, 'longitude')) fields.longitude = parseFloat(fields.longitude) || null;

  // 1. Get the current property to check existing ownership
  const { data: existingProp, error: getPropError } = await supabase
    .from('properties')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (getPropError || !existingProp) {
    const error = new Error('Không tìm thấy tin đăng.');
    error.statusCode = 404;
    throw error;
  }

  if (String(existingProp.owner_id) !== String(actorId)) {
    const error = new Error('Bạn không có quyền chỉnh sửa tin đăng của người khác.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Verify role of the updater is AGENT
  const { data: ownerUser, error: ownerError } = await supabase
    .from('users')
    .select('role')
    .eq('id', actorId)
    .single();

  if (ownerError || !ownerUser || ownerUser.role !== 'AGENT') {
    throw new Error('Chỉ tài khoản có vai trò Môi giới (AGENT) mới có quyền chỉnh sửa tin đăng.');
  }

  if (Object.hasOwn(fields, 'thumbnail')) {
    fields.thumbnail = await saveBase64Image(fields.thumbnail, actorId);
  }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .update(fields)
    .eq('id', id)
    .eq('owner_id', actorId)
    .select()
    .single();

  if (propertyError) {
    console.error('Supabase Properties Table Update Error:', propertyError);
    throw new Error(propertyError.message);
  }

  if (features !== undefined) {
    await syncRelatedRows('property_features', 'property_id', id,
      features.map(name => ({ property_id: id, feature_name: name })));
  }

  if (images !== undefined) {
    const savedImages = await Promise.all(images.map(async (url) => ({
      property_id: id,
      image_url: await saveBase64Image(url, actorId)
    })));
    await syncRelatedRows('property_images', 'property_id', id, savedImages);
  }

  if (lifestyle_tags !== undefined) {
    await syncRelatedRows('lifestyle_tags', 'property_id', id,
      lifestyle_tags.map(tag => ({ property_id: id, tag_name: tag })));
  }

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

const deleteProperty = async (id, actorId) => {
  id = positiveId(id);
  // Verify ownership before soft-deleting the listing and retaining its assets.
  const { data: existingProp, error: getPropError } = await supabase
    .from('properties')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (getPropError || !existingProp) {
    const error = new Error('Không tìm thấy tin đăng.');
    error.statusCode = 404;
    throw error;
  }

  if (String(existingProp.owner_id) !== String(actorId)) {
    const error = new Error('Bạn không có quyền xoá tin đăng của người khác.');
    error.statusCode = 403;
    throw error;
  }

  // Soft delete: keep record and assets in DB, update status to DELETED
  const { error } = await supabase
    .from('properties')
    .update({ status: 'DELETED' })
    .eq('id', id);

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
  const propId = positiveId(propertyId);
  const source = await getPropertyById(propId);
  if (!source || source.is_hidden === true || source.status !== 'AVAILABLE'
    || Number(source.owner?.trust_score ?? 50) <= 30) return [];

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
      owner:users!owner_id(name, role, avatar, trust_score)
    `)
    .in('id', similarIds)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .eq('status', 'AVAILABLE')
    .limit(12);

  if (propsError) {
    console.error('Error fetching similar properties details:', propsError);
    return [];
  }

  return (properties || []).filter((property) => Number(property.owner?.trust_score ?? 50) > 30);
};

module.exports = {
  getProperties,
  createProperty,
  getPropertyById,
  getContactAgentId,
  updateProperty,
  deleteProperty,
  checkSimilarity,
  getSimilarProperties
};
