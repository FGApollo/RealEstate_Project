const propertyService = require('../services/propertyService');
const reviewService = require('../services/reviewService');

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
    const property = await propertyService.createProperty(req.body);
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
    const { id } = req.params;
    const property = await propertyService.updateProperty(id, req.body);
    res.status(200).json({ success: true, property });
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    await propertyService.deleteProperty(id);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
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
    const { userId, rating, comment, isVerifiedReview, images } = req.body;
    
    if (!userId || !rating) {
      return res.status(400).json({ error: 'Missing userId or rating' });
    }

    const review = await reviewService.createPropertyReview(id, userId, rating, comment, isVerifiedReview, images);
    res.status(201).json({ success: true, review });
  } catch (error) {
    console.error('Error creating property review:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getProperties,
  createProperty,
  getPropertyById,
  updateProperty,
  deleteProperty,
  getPropertyReviews,
  createPropertyReview
};
