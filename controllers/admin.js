'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const multer = require('multer');

const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const { formatPrice } = require('../util/format');

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const MAX_PRODUCT_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 6;

const IMAGE_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif'
};

const uploadDirectory = path.join(__dirname, '..', 'public', 'images', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    const extension = IMAGE_MIME_EXT[file.mimetype] || '.bin';
    callback(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_FILES_PER_UPLOAD },
  fileFilter: (req, file, callback) => {
    if (IMAGE_MIME_EXT[file.mimetype]) {
      return callback(null, true);
    }
    return callback(new Error('Only JPEG, PNG, WebP, AVIF, or GIF images are allowed.'));
  }
});

// Wraps multer so upload failures land back on the form with a flash
// message instead of blowing up as a 500.
exports.uploadImages = redirectTo => (req, res, next) => {
  imageUpload.array('images', MAX_FILES_PER_UPLOAD)(req, res, error => {
    if (error) {
      req.flash('error', error.message || 'The upload failed. Try smaller images.');
      return res.redirect(redirectTo);
    }
    return next();
  });
};

function uploadedImageUrls(req) {
  return (req.files || []).map(file => `/images/uploads/${file.filename}`);
}

function unlinkOwnedUploads(urls) {
  for (const url of urls) {
    if (typeof url === 'string' && url.startsWith('/images/uploads/')) {
      const target = path.join(__dirname, '..', 'public', url);
      fs.unlink(target, () => {});
    }
  }
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

// Accepts "S, M, L" (Latin or Arabic commas) and normalises it into a
// deduped, trimmed list.
function parseSizes(raw) {
  const seen = new Set();
  const sizes = [];
  for (const piece of String(raw || '').split(/[,،،|\/]/)) {
    const size = piece.trim().slice(0, 12);
    if (size && !seen.has(size.toLowerCase())) {
      seen.add(size.toLowerCase());
      sizes.push(size);
    }
    if (sizes.length >= 12) {
      break;
    }
  }
  return sizes;
}

function invalidProductRedirect(req, res) {
  req.flash('error', 'That product could not be found in your catalog.');
  return res.redirect('/admin/products');
}

exports.redirectToDashboard = (req, res) => {
  res.redirect('/admin/dashboard');
};

exports.getDashboard = async (req, res, next) => {
  const DAY_MS = 1000 * 60 * 60 * 24;
  const now = Date.now();
  const start30 = new Date(now - 30 * DAY_MS);
  const start60 = new Date(now - 60 * DAY_MS);
  const monthWindowStart = new Date(now - 183 * DAY_MS);

  try {
    const [totalsAgg, last30Agg, prev30Agg, customerCount, productCount, topProducts, monthlyRaw, recentOrders] =
      await Promise.all([
        Order.aggregate([
          {
            $group: {
              _id: null,
              revenue: { $sum: '$total' },
              orders: { $sum: 1 },
              units: { $sum: { $sum: '$products.quantity' } }
            }
          }
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: start30 } } },
          { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: start60, $lt: start30 } } },
          { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }
        ]),
        User.countDocuments({ isAdmin: { $ne: true } }),
        Product.countDocuments(),
        Order.aggregate([
          { $unwind: '$products' },
          {
            $group: {
              _id: '$products.product.title',
              units: { $sum: '$products.quantity' },
              revenue: {
                $sum: { $multiply: ['$products.product.price', '$products.quantity'] }
              }
            }
          },
          { $sort: { units: -1, revenue: -1 } },
          { $limit: 5 }
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: monthWindowStart } } },
          {
            $group: {
              _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
              revenue: { $sum: '$total' },
              orders: { $sum: 1 }
            }
          }
        ]),
        Order.find().sort({ createdAt: -1 }).limit(6)
      ]);

    const totals = totalsAgg[0] || { revenue: 0, orders: 0, units: 0 };
    const last30 = last30Agg[0] || { revenue: 0, orders: 0 };
    const prev30 = prev30Agg[0] || { revenue: 0, orders: 0 };

    totals.revenue = roundCurrency(totals.revenue);
    totals.units = totals.units || 0;
    last30.revenue = roundCurrency(last30.revenue);
    prev30.revenue = roundCurrency(prev30.revenue);

    const averageOrderValue = totals.orders > 0 ? roundCurrency(totals.revenue / totals.orders) : 0;
    const revenueTrend =
      prev30.revenue > 0 ? Math.round(((last30.revenue - prev30.revenue) / prev30.revenue) * 100) : null;

    const months = buildSixMonthWindow(now);
    const monthlyByKey = new Map(
      monthlyRaw.map(row => [`${row._id.year}-${row._id.month}`, { revenue: row.revenue, orders: row.orders }])
    );
    months.forEach(month => {
      const hit = monthlyByKey.get(`${month.year}-${month.month}`);
      month.revenue = hit ? roundCurrency(hit.revenue) : 0;
      month.orders = hit ? hit.orders : 0;
    });
    const sixMonthRevenue = roundCurrency(months.reduce((sum, month) => sum + month.revenue, 0));
    const chart = buildChart(months);

    res.render('admin/dashboard', {
      pageTitle: 'Admin · Dashboard',
      pageDescription: 'Revenue, orders, and customer activity across the store.',
      path: '/admin/dashboard',
      totals,
      last30,
      prev30,
      averageOrderValue,
      revenueTrend,
      customerCount,
      productCount,
      sixMonthRevenue,
      chart,
      months,
      topProducts,
      recentOrders
    });
  } catch (error) {
    next(error);
  }
};

function roundCurrency(value) {
  return parseFloat((Number(value) || 0).toFixed(2));
}

function buildSixMonthWindow(now) {
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
  const cursor = new Date(now);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - offset, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: formatter.format(date),
      revenue: 0,
      orders: 0
    });
  }
  return months;
}

function buildChart(months) {
  const WIDTH = 640;
  const HEIGHT = 240;
  const TOP = 34;
  const LABEL_GAP = 46;
  const maxBarHeight = HEIGHT - TOP - LABEL_GAP;
  const slot = WIDTH / months.length;
  const barWidth = 52;
  const maxValue = Math.max(...months.map(month => month.revenue), 0);

  const bars = months.map((month, index) => {
    const ratio = maxValue > 0 ? month.revenue / maxValue : 0;
    const height = Math.round(ratio * maxBarHeight);
    const x = Math.round(index * slot + (slot - barWidth) / 2);
    const y = TOP + maxBarHeight - height;
    return {
      x,
      y,
      width: barWidth,
      height,
      cx: Math.round(x + barWidth / 2),
      valueY: Math.max(y - 8, 12),
      labelY: TOP + maxBarHeight + 28,
      label: month.label,
      valueLabel: formatPrice(month.revenue),
      revenue: month.revenue,
      orders: month.orders
    };
  });

  return {
    bars,
    width: WIDTH,
    height: HEIGHT,
    baseline: TOP + maxBarHeight,
    ariaLabel: `Monthly revenue for the last six months. Peak month $${Math.round(maxValue)}.`
  };
}

exports.getAddProduct = (req, res) => {
  res.render('admin/edit-product', {
    pageTitle: 'Add product',
    path: '/admin/add-product',
    editing: false,
    errorMessage: null,
    validationErrors: {},
    form: {
      title: '',
      price: '',
      description: '',
      sizes: ''
    },
    product: null
  });
};

exports.postAddProduct = (req, res, next) => {
  const title = (req.body.title || '').trim();
  const price = parseFloat(req.body.price);
  const description = (req.body.description || '').trim();
  const rawSizes = String(req.body.sizes || '');
  const sizes = parseSizes(rawSizes);
  const newImages = uploadedImageUrls(req);

  const validationErrors = validateProduct({ title, price, description, imageCount: newImages.length });

  if (Object.keys(validationErrors).length > 0) {
    unlinkOwnedUploads(newImages);
    return res.status(422).render('admin/edit-product', {
      pageTitle: 'Add product',
      path: '/admin/add-product',
      editing: false,
      errorMessage: 'Please fix the highlighted fields below.',
      validationErrors,
      form: { title, price: req.body.price, description, sizes: rawSizes },
      product: null
    });
  }

  const product = new Product({
    title,
    price,
    description,
    images: newImages,
    sizes,
    userId: req.user
  });

  product
    .save()
    .then(() => {
      req.flash('success', 'Product created and published to the storefront.');
      res.redirect('/admin/products');
    })
    .catch(error => {
      unlinkOwnedUploads(newImages);
      next(error);
    });
};

exports.getEditProduct = (req, res, next) => {
  const editMode = req.query.edit;
  if (!editMode) {
    return res.redirect('/admin/products');
  }

  const prodId = req.params.productId;
  if (!OBJECT_ID.test(prodId)) {
    return invalidProductRedirect(req, res);
  }

  Product.findById(prodId)
    .then(product => {
      if (!product || product.userId.toString() !== req.user._id.toString()) {
        req.flash('error', 'That product could not be found in your catalog.');
        return res.redirect('/admin/products');
      }
      res.render('admin/edit-product', {
        pageTitle: 'Edit product',
        path: '/admin/edit-product',
        editing: true,
        product,
        errorMessage: null,
        validationErrors: {},
        form: null
      });
    })
    .catch(next);
};

exports.postEditProduct = (req, res, next) => {
  const prodId = req.body.productId;
  if (!OBJECT_ID.test(String(prodId || ''))) {
    unlinkOwnedUploads(uploadedImageUrls(req));
    return invalidProductRedirect(req, res);
  }

  const title = (req.body.title || '').trim();
  const price = parseFloat(req.body.price);
  const description = (req.body.description || '').trim();
  const rawSizes = String(req.body.sizes || '');
  const sizes = parseSizes(rawSizes);
  const newImages = uploadedImageUrls(req);
  const removeSet = new Set(asArray(req.body.removeImages).map(String));

  Product.findById(prodId)
    .then(product => {
      if (!product || product.userId.toString() !== req.user._id.toString()) {
        unlinkOwnedUploads(newImages);
        req.flash('error', 'That product could not be found in your catalog.');
        return res.redirect('/admin/products');
      }

      const kept = product.images.filter(url => !removeSet.has(url));
      const finalImages = [...kept, ...newImages].slice(0, MAX_PRODUCT_IMAGES);

      const validationErrors = validateProduct({
        title,
        price,
        description,
        imageCount: finalImages.length
      });

      if (Object.keys(validationErrors).length > 0) {
        unlinkOwnedUploads(newImages);
        return res.status(422).render('admin/edit-product', {
          pageTitle: 'Edit product',
          path: '/admin/edit-product',
          editing: true,
          product,
          errorMessage: 'Please fix the highlighted fields below.',
          validationErrors,
          form: { title, price: req.body.price, description, sizes: rawSizes }
        });
      }

      const droppedUploads = newImages.filter(url => !finalImages.includes(url));
      if (droppedUploads.length > 0) {
        unlinkOwnedUploads(droppedUploads);
      }

      const removedImages = product.images.filter(url => !finalImages.includes(url));
      product.title = title;
      product.price = price;
      product.description = description;
      product.images = finalImages;
      product.sizes = sizes;

      return product.save().then(() => {
        unlinkOwnedUploads(removedImages);
        req.flash('success', 'Product updated.');
        res.redirect('/admin/products');
      });
    })
    .catch(next);
};

exports.getProducts = (req, res, next) => {
  Product.find({ userId: req.user._id })
    .sort({ _id: -1 })
    .then(products => {
      const thirtyDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
      const stats = products.reduce(
        (result, product) => {
          result.totalValue += Number(product.price) || 0;
          if (product._id.getTimestamp().getTime() > thirtyDaysAgo) {
            result.recentCount += 1;
          }
          return result;
        },
        { totalValue: 0, recentCount: 0 }
      );
      stats.totalValue = parseFloat(stats.totalValue.toFixed(2));
      stats.averagePrice = products.length
        ? parseFloat((stats.totalValue / products.length).toFixed(2))
        : 0;

      res.render('admin/products', {
        prods: products,
        stats,
        pageTitle: 'Admin · Catalog',
        pageDescription: 'Manage the ShopExpress catalog.',
        path: '/admin/products'
      });
    })
    .catch(next);
};

exports.postDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;

  if (!OBJECT_ID.test(String(prodId || ''))) {
    return invalidProductRedirect(req, res);
  }

  Product.findOne({ _id: prodId, userId: req.user._id })
    .then(product => {
      if (!product) {
        req.flash('error', 'That product could not be found in your catalog.');
        return null;
      }
      return Product.deleteOne({ _id: product._id }).then(() => {
        unlinkOwnedUploads(product.images || []);
        req.flash('success', 'Product deleted from the catalog.');
      });
    })
    .then(() => {
      res.redirect('/admin/products');
    })
    .catch(next);
};

function validateProduct({ title, price, description, imageCount }) {
  const errors = {};
  if (!title || title.length < 3) {
    errors.title = 'Title must be at least 3 characters.';
  } else if (title.length > 120) {
    errors.title = 'Title must be 120 characters or fewer.';
  }
  if (!Number.isFinite(price) || price <= 0) {
    errors.price = 'Price must be a positive number.';
  }
  if (!description || description.length < 10) {
    errors.description = 'Description must be at least 10 characters.';
  } else if (description.length > 2000) {
    errors.description = 'Description must be 2,000 characters or fewer.';
  }
  if (!Number.isInteger(imageCount) || imageCount < 1) {
    errors.images = 'Add at least one product image.';
  } else if (imageCount > MAX_PRODUCT_IMAGES) {
    errors.images = `A product can carry at most ${MAX_PRODUCT_IMAGES} images.`;
  }
  return errors;
}
