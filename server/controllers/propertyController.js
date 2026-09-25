const propertyService = require('../services/propertyService');
const reviewService = require('../services/reviewService');
const geminiService = require('../services/geminiService');

const MAX_PROPERTY_IMAGE_COUNT = 6;
const MAX_PROPERTY_IMAGE_BYTES = 5 * 1024 * 1024;

const validatePropertyImages = (body = {}) => {
  const images = body.images || [];
  if (!Array.isArray(images)) return 'images must be an array';
  if (images.length > MAX_PROPERTY_IMAGE_COUNT) {
    return `A listing can contain at most ${MAX_PROPERTY_IMAGE_COUNT} images`;
  }

  for (const image of [body.thumbnail, ...images]) {
    if (typeof image !== 'string' || !image.startsWith('data:image/')) continue;
    const comma = image.indexOf(',');
    const encoded = comma >= 0 ? image.slice(comma + 1) : '';
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    const sizeBytes = Math.floor((encoded.length * 3) / 4) - padding;
    if (sizeBytes > MAX_PROPERTY_IMAGE_BYTES) {
      return 'Each listing image must be 5 MB or smaller';
    }
  }

  return null;
};

const getProperties = async (req, res) => {
  try {
    const properties = await propertyService.getProperties();
    res.status(200).json({ properties });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const createProperty = async (req, res) => {
  try {
    const imageError = validatePropertyImages(req.body);
    if (imageError) return res.status(413).json({ error: imageError });
    const property = await propertyService.createProperty({ ...req.body, owner_id: req.user.id });
    res.status(201).json({ success: true, property });
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await propertyService.getPropertyById(id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(200).json({ property });
  } catch (error) {
    console.error('Error fetching property by id:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const updateProperty = async (req, res) => {
  try {
    const imageError = validatePropertyImages(req.body);
    if (imageError) return res.status(413).json({ error: imageError });
    const { id } = req.params;
    const property = await propertyService.updateProperty(id, req.user.id, req.body);
    res.status(200).json({ success: true, property });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error('Error updating property:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    await propertyService.deleteProperty(id, req.user.id);
    res.status(200).json({ success: true });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error('Error deleting property:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

const getPropertyReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const reviews = await reviewService.getPropertyReviews(id);
    res.status(200).json({ reviews });
  } catch (error) {
    console.error('Error fetching property reviews:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const createPropertyReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, images } = req.body;
    
    if (!rating) {
      return res.status(400).json({ error: 'Missing rating' });
    }

    const review = await reviewService.createPropertyReview(id, req.user.id, rating, comment, images);
    res.status(201).json({ success: true, review });
  } catch (error) {
    console.error('Error creating property review:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

const checkBeforeSave = async (req, res) => {
  try {
    const imageError = validatePropertyImages(req.body);
    if (imageError) return res.status(413).json({ error: imageError });
    const { excludeId } = req.query;
    const propertyData = { ...req.body, owner_id: req.user.id };

    // 1. Check similarity in DB
    const similarityResult = await propertyService.checkSimilarity(propertyData, excludeId);

    // 2. Scan with Gemini if description is provided
    let isMultiListing = false;
    let geminiReason = '';
    if (propertyData.description) {
      const geminiResult = await geminiService.checkDescriptionIsMultiListing(propertyData.description);
      isMultiListing = geminiResult.is_multi_listing;
      geminiReason = geminiResult.reason;
    }

    res.status(200).json({
      success: true,
      similarOwn: similarityResult.similarOwn,
      similarOther: similarityResult.similarOther,
      isMultiListing,
      geminiReason
    });
  } catch (error) {
    console.error('Error in checkBeforeSave:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const getSimilarProperties = async (req, res) => {
  try {
    const { id } = req.params;
    const similar = await propertyService.getSimilarProperties(id);
    res.status(200).json({ success: true, properties: similar });
  } catch (error) {
    console.error('Error in getSimilarProperties:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  MAX_PROPERTY_IMAGE_COUNT,
  MAX_PROPERTY_IMAGE_BYTES,
  getProperties,
  createProperty,
  getPropertyById,
  updateProperty,
  deleteProperty,
  getPropertyReviews,
  createPropertyReview,
  checkBeforeSave,
  getSimilarProperties
};
