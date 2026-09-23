const express = require('express');
const router = express.Router();
const favoritesController = require('../controllers/favoritesController');
const { authenticate } = require('../middleware/authenticate');

router.use(authenticate);

router.get('/', favoritesController.getFavorites);
router.post('/', favoritesController.addFavorite);
router.post('/delete', favoritesController.removeFavorite);

module.exports = router;
