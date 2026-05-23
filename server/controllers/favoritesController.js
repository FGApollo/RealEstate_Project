const favoritesService = require('../services/favoritesService');

const getFavorites = async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    const favorites = await favoritesService.getFavorites(userId);
    res.status(200).json({ favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const addFavorite = async (req, res) => {
  const { userId, propertyId } = req.body;
  if (!userId || !propertyId) {
    return res.status(400).json({ error: 'Missing userId or propertyId' });
  }

  try {
    const favorite = await favoritesService.addFavorite(userId, propertyId);
    res.status(201).json({ message: 'Added to favorites', favorite });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const removeFavorite = async (req, res) => {
  const { userId, propertyId } = req.body;
  if (!userId || !propertyId) {
    return res.status(400).json({ error: 'Missing userId or propertyId' });
  }

  try {
    await favoritesService.removeFavorite(userId, propertyId);
    res.status(200).json({ message: 'Removed from favorites' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite
};
