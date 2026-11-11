'use strict';

const express = require('express');

const adminController = require('../controllers/admin');
const isAuth = require('../middleware/is-auth');
const isAdmin = require('../middleware/is-admin');

const router = express.Router();

// /admin => redirect to the dashboard
router.get('/', isAuth, isAdmin, adminController.redirectToDashboard);

// /admin/dashboard => GET
router.get('/dashboard', isAuth, isAdmin, adminController.getDashboard);

// /admin/add-product => GET
router.get('/add-product', isAuth, isAdmin, adminController.getAddProduct);

// /admin/products => GET
router.get('/products', isAuth, isAdmin, adminController.getProducts);

// /admin/add-product => POST
router.post('/add-product', isAuth, isAdmin, adminController.uploadImages('/admin/add-product'), adminController.postAddProduct);

router.get('/edit-product/:productId', isAuth, isAdmin, adminController.getEditProduct);

router.post('/edit-product', isAuth, isAdmin, adminController.uploadImages('/admin/edit-product'), adminController.postEditProduct);

router.post('/delete-product', isAuth, isAdmin, adminController.postDeleteProduct);

module.exports = router;
