const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 254
  },
  password: {
    type: String,
    required: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  // Stored as a SHA-256 hash of the emailed token, never in plaintext.
  resetToken: String,
  resetTokenExpiration: Date,
  cart: {
    items: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        quantity: { type: Number, required: true, min: 1 },
        // Empty string for products without apparel-style sizes.
        size: { type: String, default: '', trim: true, maxlength: 20 }
      }
    ]
  }
}, { timestamps: true });

// Reset-token lookups happen against a sparse index so plain accounts stay out of it.
userSchema.index({ resetToken: 1 }, { sparse: true });

function normalizeSize(size) {
  return String(size || '')
    .trim()
    .slice(0, 20);
}

function sameCartLine(item, productId, size) {
  return (
    item.productId.toString() === productId.toString() &&
    normalizeSize(item.size) === normalizeSize(size)
  );
}

userSchema.methods.addToCart = function(product, quantity = 1, size) {
  const amount =
    Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 10) : 1;
  const normalizedSize = normalizeSize(size);
  const cartProductIndex = this.cart.items.findIndex(cp => {
    return sameCartLine(cp, product._id, normalizedSize);
  });
  const updatedCartItems = [...this.cart.items];

  if (cartProductIndex >= 0) {
    updatedCartItems[cartProductIndex].quantity = Math.min(
      updatedCartItems[cartProductIndex].quantity + amount,
      10
    );
  } else {
    updatedCartItems.push({
      productId: product._id,
      quantity: Math.min(amount, 10),
      size: normalizedSize
    });
  }
  this.cart = {
    items: updatedCartItems
  };
  return this.save();
};

userSchema.methods.updateCartQuantity = function(productId, delta, size) {
  const normalizedSize = normalizeSize(size);
  const item = this.cart.items.find(cp => {
    return sameCartLine(cp, productId, normalizedSize);
  });

  if (!item) {
    return Promise.resolve(this);
  }

  const nextQuantity = item.quantity + delta;
  if (nextQuantity <= 0) {
    this.cart.items = this.cart.items.filter(cp => {
      return !sameCartLine(cp, productId, normalizedSize);
    });
  } else {
    item.quantity = Math.min(nextQuantity, 10);
  }

  return this.save();
};

userSchema.methods.removeFromCart = function(productId, size) {
  const normalizedSize = normalizeSize(size);
  const updatedCartItems = this.cart.items.filter(item => {
    return !sameCartLine(item, productId, normalizedSize);
  });
  this.cart.items = updatedCartItems;
  return this.save();
};

userSchema.methods.clearCart = function() {
  this.cart = { items: [] };
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
