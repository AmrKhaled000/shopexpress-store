'use strict';

const Product = require('../models/product');
const Order = require('../models/order');
const { parseCatalogQuery, buildProductQuery, buildProductSort } = require('../util/catalog');
const snapshotProduct = require('../util/order-product');
const { sendOrderEmail } = require('../util/mailer');

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

function renderProductNotFound(res) {
  return res.status(404).render('404', {
    pageTitle: 'Product Not Found',
    path: '/404'
  });
}

exports.getIndex = (req, res, next) => {
  Promise.all([
    Product.find().sort({ _id: -1 }).limit(8),
    Product.countDocuments()
  ])
    .then(([products, totalProducts]) => {
      res.render('shop/index', {
        prods: products,
        totalProducts,
        pageTitle: 'Considered goods for everyday living',
        pageDescription:
          'ShopExpress is a small catalog of considered objects — lighting, audio, and everyday tools made to be kept.',
        path: '/'
      });
    })
    .catch(next);
};

exports.getProducts = (req, res, next) => {
  const catalog = parseCatalogQuery(req.query);

  Product.find(buildProductQuery(catalog))
    .sort(buildProductSort(catalog.sort))
    .then(products => {
      res.render('shop/product-list', {
        prods: products,
        catalog,
        pageTitle: catalog.search ? `Search results for “${catalog.search}”` : 'All products',
        pageDescription:
          'Browse the complete ShopExpress catalog of lighting, audio, desk objects, and everyday essentials.',
        path: '/products'
      });
    })
    .catch(next);
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;

  if (!OBJECT_ID.test(prodId)) {
    return renderProductNotFound(res);
  }

  Promise.all([
    Product.findById(prodId),
    Product.find({ _id: { $ne: prodId } }).sort({ _id: -1 }).limit(4)
  ])
    .then(([product, relatedProducts]) => {
      if (!product) {
        return renderProductNotFound(res);
      }
      res.render('shop/product-detail', {
        product,
        relatedProducts,
        pageTitle: product.title,
        pageDescription: product.description,
        path: '/products'
      });
    })
    .catch(next);
};

exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const items = user.cart.items.filter(item => item.productId !== null);
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
      const total = items.reduce(
        (sum, item) => sum + item.productId.price * item.quantity,
        0
      );

      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your cart',
        pageDescription: 'Review the items in your ShopExpress cart and place your order.',
        items,
        itemCount,
        total: parseFloat(total.toFixed(2))
      });
    })
    .catch(next);
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  const requestedQuantity = parseInt(req.body.quantity, 10);
  const quantity =
    Number.isInteger(requestedQuantity) && requestedQuantity > 0
      ? Math.min(requestedQuantity, 10)
      : 1;
  const requestedSize = String(req.body.size || '').trim().slice(0, 20);

  if (!OBJECT_ID.test(String(prodId || ''))) {
    req.flash('error', 'That product could not be found.');
    return res.redirect('/products');
  }

  Product.findById(prodId)
    .then(product => {
      if (!product) {
        req.flash('error', 'That product could not be found.');
        return null;
      }
      const productSizes = Array.isArray(product.sizes) ? product.sizes : [];
      if (productSizes.length > 0 && !productSizes.includes(requestedSize)) {
        req.flash('error', 'Choose a size before adding this to your cart.');
        res.redirect(`/products/${prodId}`);
        return false; // sentinel: response already sent
      }
      const chosenSize = productSizes.length > 0 ? requestedSize : '';
      return req.user
        .addToCart(product, quantity, chosenSize)
        .then(() => product);
    })
    .then(product => {
      if (product === false) {
        return undefined;
      }
      if (product) {
        req.flash('success', `${product.title} added to your cart.`);
        return res.redirect('/cart');
      }
      return res.redirect('/products');
    })
    .catch(next);
};

exports.postCartUpdateQuantity = (req, res, next) => {
  const prodId = req.body.productId;
  const delta = parseInt(req.body.delta, 10);

  const size = String(req.body.size || '').trim().slice(0, 20);

  if (!OBJECT_ID.test(String(prodId || '')) || (delta !== 1 && delta !== -1)) {
    req.flash('error', 'We could not update that cart item.');
    return res.redirect('/cart');
  }

  req.user
    .updateCartQuantity(prodId, delta, size)
    .then(() => res.redirect('/cart'))
    .catch(next);
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;

  const size = String(req.body.size || '').trim().slice(0, 20);

  if (!OBJECT_ID.test(String(prodId || ''))) {
    req.flash('error', 'That cart item could not be found.');
    return res.redirect('/cart');
  }

  req.user
    .removeFromCart(prodId, size)
    .then(() => {
      req.flash('success', 'Item removed from your cart.');
      res.redirect('/cart');
    })
    .catch(next);
};

exports.postOrder = async (req, res, next) => {
  try {
    const user = await req.user.populate('cart.items.productId').execPopulate();
    const validItems = user.cart.items.filter(item => item.productId !== null);

    if (validItems.length === 0) {
      req.flash('error', 'Your cart is empty. Add something before placing an order.');
      return res.redirect('/cart');
    }

    const products = validItems.map(item => ({
      quantity: item.quantity,
      product: snapshotProduct(item.productId, item.size)
    }));
    const total = validItems.reduce(
      (sum, item) => sum + item.productId.price * item.quantity,
      0
    );

    const order = new Order({
      user: {
        email: req.user.email,
        userId: req.user
      },
      products,
      total: parseFloat(total.toFixed(2))
    });

    await order.save();
    await req.user.clearCart();
    // Fire-and-forget: the order is saved, the confirmation email must
    // never block checkout or break it if SMTP is down/misconfigured.
    sendOrderEmail(req.user.email, order).catch(mailError => {
      console.warn('[mailer] Order confirmation email could not be sent:', mailError.message);
    });
    req.flash('success', 'Order placed. Thank you for shopping with ShopExpress.');
    return res.redirect('/orders');
  } catch (error) {
    return next(error);
  }
};

exports.getOrders = (req, res, next) => {
  Order.find({ 'user.userId': req.user._id })
    .sort({ createdAt: -1 })
    .then(orders => {
      const stats = orders.reduce(
        (result, order) => {
          result.orderCount += 1;
          result.totalSpent += Number(order.total) || 0;
          result.itemCount += (order.products || []).reduce(
            (sum, item) => sum + (Number(item.quantity) || 0),
            0
          );
          return result;
        },
        { orderCount: 0, itemCount: 0, totalSpent: 0 }
      );
      stats.totalSpent = parseFloat(stats.totalSpent.toFixed(2));

      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your orders',
        pageDescription: 'Track your ShopExpress order history.',
        orders,
        stats
      });
    })
    .catch(next);
};

exports.getAbout = (req, res, next) => {
  Product.countDocuments()
    .then(productCount => {
      res.render('pages/about', {
        path: '/about',
        pageTitle: 'About ShopExpress',
        pageDescription:
          'ShopExpress is a small, independent catalog built around a simple idea: fewer things, chosen better.',
        productCount
      });
    })
    .catch(next);
};

exports.getHelp = (req, res) => {
  res.render('pages/help', {
    path: '/help',
    pageTitle: 'Help & information',
    pageDescription:
      'Answers about ordering, delivery, returns, accounts, and shopping at ShopExpress.'
  });
};
