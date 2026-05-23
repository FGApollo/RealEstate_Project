const express = require('express');
const router = express.Router();
const favoritesController = require('../controllers/favoritesController');

router.get('/', favoritesController.getFavorites);
router.post('/', favoritesController.addFavorite);
router.post('/delete', favoritesController.removeFavorite);

module.exports = router;
