const { supabase } = require('../config/supabase');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// TODO: TEMPORARY MOCK - This function currently mocks image uploads by returning a random Unsplash image URL.
// This is a temporary solution to bypass database varchar(500) limit for base64 string inserts,
// until the PM configures a dedicated Supabase Storage bucket.
const saveBase64Image = (base64Str) => {
  const isPlaceholder = !base64Str || base64Str === 'https://via.placeholder.com/400';
  
  if (!isPlaceholder && (typeof base64Str !== 'string' || !base64Str.startsWith('data:image/'))) {
    return base64Str;
  }

  // Discard the base64 data and return a random beautiful Unsplash house image URL
  const mockUnsplashImages = [
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80'
  ];

  const randomIndex = Math.floor(Math.random() * mockUnsplashImages.length);
  return mockUnsplashImages[randomIndex];
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

  return property;
};

module.exports = {
  getProperties,
  createProperty
};
