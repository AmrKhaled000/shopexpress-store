const mongoose = require('mongoose');

const Schema = mongoose.Schema;

// Snapshot of the product at the moment of purchase. Orders keep exactly
// what the customer saw — title, price, image — even if the catalog changes
// later, without embedding internal catalog internals into order history.
const orderProductSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    description: {
      type: String,
      maxlength: 2000
    },
    imageUrl: {
      type: String,
      maxlength: 2048
    },
    // Apparel-style size selected at purchase time, if the product has sizes.
    size: {
      type: String,
      trim: true,
      maxlength: 20
    }
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    products: [
      {
        product: { type: orderProductSchema, required: true },
        quantity: { type: Number, required: true, min: 1 }
      }
    ],
    user: {
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
      },
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
      }
    },
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

// Common access patterns: "my orders, newest first" and dashboard reporting.
orderSchema.index({ 'user.userId': 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
