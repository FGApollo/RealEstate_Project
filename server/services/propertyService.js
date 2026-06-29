const { supabase } = require('../config/supabase');

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
      address,
      address_detail,
      thumbnail,
      virtual_tour_url,
      contact_phone,
      latitude: parseFloat(latitude) || null,
      longitude: parseFloat(longitude) || null,
      views: 0
    }])
    .select()
    .single();

  if (propertyError) throw new Error(propertyError.message);

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
      image_url: url
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

  return property;
};

module.exports = {
  getProperties,
  createProperty
};
