'use strict';

/**
 * Development seed.
 * Creates the admin account, a demo customer, a considered catalog, and one
 * sample order so every page can be reviewed with realistic content.
 *
 * Product photos are real photographs (Unsplash, free license) committed
 * under public/images/products/.
 *
 * Existing seeded products are updated in place (images, sizes, copy) so
 * re-running the seed refreshes the catalog instead of duplicating it.
 *
 * Usage: npm run seed
 */

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Product = require('../models/product');
const User = require('../models/user');
const Order = require('../models/order');
const snapshotProduct = require('../util/order-product');

const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopexpress';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DEMO_EMAIL = (process.env.DEMO_EMAIL || '').trim().toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Passwords are never stored in the repository. Development convenience:
// if none is configured, one is generated and printed once on creation.
function resolvePassword(envValue, label) {
  if (envValue) {
    return { password: envValue, generated: false };
  }
  if (IS_PRODUCTION) {
    console.error(`${label} must be set when NODE_ENV=production.`);
    process.exit(1);
  }
  const generated = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, 'x');
  console.warn(`${label} is not set — using a generated development password: ${generated}`);
  return { password: generated, generated: true };
}

// `lookupTitles` lets us migrate products that existed under an earlier
// title (e.g. the "Drift Weekender" became the "Drift Field Pack").
const products = [
  {
    title: 'Arc Task Lamp',
    lookupTitles: ['Arc Task Lamp'],
    price: 189,
    imageUrl: '/images/products/arc-task-lamp.jpg',
    description:
      'A sweeping powder-coated steel lamp with a warm, dimmable pool of light. Designed for late pages and early mornings, with a weighted base that holds its ground on the smallest desk.'
  },
  {
    title: 'Meridian Headphones',
    lookupTitles: ['Meridian Headphones'],
    price: 299,
    imageUrl: '/images/products/meridian-headphones.jpg',
    description:
      'Closed-back headphones with a quiet, balanced signature and memory-foam cups. Built for long listening sessions that don’t ask for attention.'
  },
  {
    title: 'Terra Mug',
    lookupTitles: ['Terra Mug'],
    price: 34,
    imageUrl: '/images/products/terra-mug.jpg',
    description:
      'Hand-thrown stoneware in a soft clay glaze. Each 12 oz mug keeps heat, sits comfortably in the hand, and carries the small variations of the maker.'
  },
  {
    title: 'Form Keyboard',
    lookupTitles: ['Form Keyboard'],
    price: 159,
    imageUrl: '/images/products/form-keyboard.jpg',
    description:
      'A compact mechanical keyboard with tactile switches, a machined aluminium body, and a layout that leaves room for your hands to think.'
  },
  {
    title: 'Drift Field Pack',
    lookupTitles: ['Drift Field Pack', 'Drift Weekender'],
    price: 225,
    imageUrl: '/images/products/drift-field-pack.jpg',
    description:
      'A black waxed-canvas backpack with leather trim and one deep compartment. Boxy and quiet, sized for a laptop, a change of clothes, and everything you carry without thinking.'
  },
  {
    title: 'Halo Speaker',
    lookupTitles: ['Halo Speaker'],
    price: 129,
    imageUrl: '/images/products/halo-speaker.jpg',
    description:
      'A portable fabric-wrapped speaker with a warm, room-filling sound. Pair it in seconds, and let it disappear into wherever you take it.'
  },
  {
    title: 'Linen Throw',
    lookupTitles: ['Linen Throw'],
    price: 89,
    imageUrl: '/images/products/linen-throw.jpg',
    sizes: ['S', 'M', 'L'],
    description:
      'Stonewashed European linen, woven in a muted clay stripe and finished with a soft fringe. Light enough for summer, warm enough for the chair you keep meaning to leave.'
  },
  {
    title: 'Mono Watch',
    lookupTitles: ['Mono Watch'],
    price: 249,
    imageUrl: '/images/products/mono-watch.jpg',
    description:
      'A quiet automatic watch with a matte black case, a mesh steel strap, and a sandblasted dial. The seconds hand sweeps; everything else stays still.'
  },
  {
    title: 'Kanso Bottle',
    lookupTitles: ['Kanso Bottle'],
    price: 48,
    imageUrl: '/images/products/kanso-bottle.jpg',
    description:
      'Double-walled stainless steel with a matte, grippy finish. Holds 24 oz, keeps cold for a full day, and fits the cup holder you actually use.'
  },
  {
    title: 'Field Notebook',
    lookupTitles: ['Field Notebook'],
    price: 28,
    imageUrl: '/images/products/field-notebook.jpg',
    description:
      'A cloth-bound notebook with 192 dot-grid pages and a lay-flat binding. The kind of object that becomes more useful the more it is used.'
  }
];

async function ensureUser(email, password, isAdmin) {
  const existing = await User.findOne({ email });
  if (existing) {
    if (isAdmin && !existing.isAdmin) {
      existing.isAdmin = true;
      await existing.save();
    }
    return { user: existing, created: false };
  }
  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await new User({
    email,
    password: hashedPassword,
    isAdmin,
    cart: { items: [] }
  }).save();
  return { user, created: true };
}

function seedImages(data) {
  return [data.imageUrl];
}

async function ensureProduct(data, adminId) {
  const sizes = Array.isArray(data.sizes) ? data.sizes : [];
  const images = seedImages(data);

  let product = await Product.findOne({ title: { $in: data.lookupTitles } });
  if (!product) {
    product = await new Product({
      title: data.title,
      price: data.price,
      description: data.description,
      images,
      sizes,
      userId: adminId
    }).save();
    return { product, created: true };
  }

  product.title = data.title;
  product.price = data.price;
  product.description = data.description;
  product.images = images;
  product.sizes = sizes;
  await product.save();
  return { product, created: false };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('The seed script is development-only and will not run in production.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  if (!ADMIN_EMAIL) {
    console.error('ADMIN_EMAIL must be set in .env (see .env.example).');
    process.exit(1);
  }
  const adminCredentials = resolvePassword(ADMIN_PASSWORD, 'ADMIN_PASSWORD');
  const { user: admin, created: adminCreated } = await ensureUser(
    ADMIN_EMAIL,
    adminCredentials.password,
    true
  );

  let demo = null;
  let demoCreated = false;
  if (DEMO_EMAIL) {
    const demoCredentials = resolvePassword(DEMO_PASSWORD, 'DEMO_PASSWORD');
    const result = await ensureUser(DEMO_EMAIL, demoCredentials.password, false);
    demo = result.user;
    demoCreated = result.created;
  } else {
    console.log('DEMO_EMAIL is not set — skipping the demo customer.');
  }

  let createdProducts = 0;
  const seededProducts = [];

  for (const data of products) {
    const { product, created } = await ensureProduct(data, admin._id);
    if (created) {
      createdProducts += 1;
    }
    seededProducts.push(product);
  }

  let createdOrder = false;
  const existingOrder = demo
    ? await Order.findOne({ 'user.userId': demo._id })
    : null;
  if (existingOrder) {
    // Refresh the embedded snapshot so demo history shows the current catalog imagery.
    let resized = false;
    for (const item of existingOrder.products || []) {
      const seedEntry = products.find(
        entry =>
          entry.title === item.product.title || entry.lookupTitles.includes(item.product.title)
      );
      if (seedEntry && item.product.imageUrl !== seedEntry.imageUrl) {
        item.product.imageUrl = seedEntry.imageUrl;
        item.product.title = seedEntry.title;
        resized = true;
      }
    }
    if (resized) {
      existingOrder.markModified('products');
      await existingOrder.save();
    }
  } else if (demo) {
    const lamp = seededProducts.find(product => product.title === 'Arc Task Lamp');
    const throwBlanket = seededProducts.find(product => product.title === 'Linen Throw');
    const picks = [lamp, throwBlanket].filter(Boolean);
    if (picks.length > 0) {
      const orderProducts = picks.map((product, index) => ({
        quantity: index === 0 ? 1 : 2,
        product: snapshotProduct(product, product.title === 'Linen Throw' ? 'M' : undefined)
      }));
      const total = picks.reduce(
        (sum, product, index) => sum + product.price * (index === 0 ? 1 : 2),
        0
      );
      await new Order({
        user: { email: demo.email, userId: demo._id },
        products: orderProducts,
        total: parseFloat(total.toFixed(2))
      }).save();
      createdOrder = true;
    }
  }

  console.log('');
  console.log('  ShopExpress seed complete');
  console.log('  -------------------------');
  console.log(`  Catalog: ${seededProducts.length} products (${createdProducts} new)`);
  console.log(`  Admin:   ${ADMIN_EMAIL} (${adminCreated ? 'created' : 'existing'})`);
  console.log(`  Demo:    ${demo ? `${DEMO_EMAIL} (${demoCreated ? 'created' : 'existing'})` : 'skipped — DEMO_EMAIL not set'}`);
  console.log(`  Order:   ${createdOrder ? 'sample order created (Linen Throw, size M)' : 'already present or skipped'}`);
  console.log('');

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('Seed failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    /* ignore */
  }
  process.exit(1);
});
