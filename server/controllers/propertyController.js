const propertyService = require('../services/propertyService');

const getProperties = async (req, res) => {
  try {
    const properties = await propertyService.getProperties();
    res.status(200).json({ properties });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getProperties
};
