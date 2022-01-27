const path = require('path');

const express = require('express');

const userController = require('../controllers/user');

const router = express.Router();

router.get('/', userController.getIndex);

router.get('/token-info', userController.getTokenInfo);

router.get('/filter', userController.getFilter)

module.exports = router;
