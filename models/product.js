const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const productSchema = new Schema(
  {
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
      required: true,
      maxlength: 2000
    },
    // Ordered list of image paths/URLs. The first image is the storefront
    // thumbnail; the rest appear in the product gallery.
    images: {
      type: [String],
      default: [],
      validate: {
        validator: value => Array.isArray(value) && value.length >= 1 && value.length <= 8,
        message: 'A product needs at least one image (up to 8).'
      }
    },
    // Optional apparel-style sizes (e.g. S, M, L). Empty means no size
    // selection is required at purchase time.
    sizes: {
      type: [String],
      default: []
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

// Backwards-compatible primary image accessor for older views/helpers.
productSchema.virtual('imageUrl').get(function () {
  return this.images && this.images.length > 0 ? this.images[0] : '';
});

// Admin catalog queries always filter by owner.
productSchema.index({ userId: 1 });

module.exports = mongoose.model('Product', productSchema);
