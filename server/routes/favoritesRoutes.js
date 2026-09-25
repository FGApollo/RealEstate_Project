const express = require('express');
const router = express.Router();
const favoritesController = require('../controllers/favoritesController');
const { authenticate } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate);

router.get('/', rateLimiters.read, favoritesController.getFavorites);
router.post('/', rateLimiters.write, favoritesController.addFavorite);
router.post('/delete', rateLimiters.write, favoritesController.removeFavorite);

module.exports = router;
