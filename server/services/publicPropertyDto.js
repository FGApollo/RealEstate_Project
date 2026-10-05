const CONTACT_EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
const CONTACT_PHONE = /\b(?:\+?84|0)(?:[\s().-]*\d){8,10}\b/g;

const scrubPublicDescription = (value) => String(value || '')
  .replace(CONTACT_EMAIL, '[email ẩn]')
  .replace(CONTACT_PHONE, '[số điện thoại ẩn]');

const mapImage = (image) => typeof image === 'string'
  ? { image_url: image }
  : (image?.image_url ? { image_url: image.image_url } : null);

const mapFeature = (feature) => typeof feature === 'string'
  ? { feature_name: feature }
  : (feature?.feature_name ? { feature_name: feature.feature_name } : null);

const mapTag = (tag) => typeof tag === 'string'
  ? { tag_name: tag }
  : (tag?.tag_name ? { tag_name: tag.tag_name } : null);

const toPublicProperty = (property = {}) => {
  const publicLocation = [property.ward, property.district, property.city]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
  const propertyImages = (property.property_images || property.images || []).map(mapImage).filter(Boolean);
  const propertyFeatures = (property.property_features || property.features || []).map(mapFeature).filter(Boolean);
  const lifestyleTags = (property.lifestyle_tags || []).map(mapTag).filter(Boolean);

  return {
    id: property.id,
    title: property.title,
    description: scrubPublicDescription(property.description),
    price: property.price,
    area: property.area,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    property_type: property.property_type,
    listing_type: property.listing_type,
    status: property.status,
    city: property.city,
    district: property.district,
    ward: property.ward,
    public_location: publicLocation,
    address: publicLocation,
    floor_range: property.floor_range,
    thumbnail: property.thumbnail || propertyImages[0]?.image_url || null,
    images: propertyImages.map((image) => image.image_url),
    property_images: propertyImages,
    property_features: propertyFeatures,
    features: propertyFeatures.map((feature) => feature.feature_name),
    lifestyle_tags: lifestyleTags,
    virtual_tour_url: property.virtual_tour_url,
    is_highlighted: Boolean(property.is_highlighted),
    created_at: property.created_at,
    average_rating: property.average_rating,
    review_count: property.review_count,
    owner: property.owner ? {
      name: property.owner.name,
      role: property.owner.role,
      avatar: property.owner.avatar
    } : null
  };
};

module.exports = { toPublicProperty, scrubPublicDescription };
