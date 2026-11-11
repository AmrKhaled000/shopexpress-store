'use strict';

/**
 * Builds the product snapshot stored inside an order. Only customer-facing
 * fields are copied — internal catalog data never leaks into order history.
 */
module.exports = function snapshotProduct(product, size) {
  const snapshot = {
    productId: product._id,
    title: product.title,
    price: product.price,
    description: product.description,
    imageUrl:
      (product.images && product.images.length > 0 ? product.images[0] : null) ||
      product.imageUrl ||
      ''
  };
  const normalizedSize = String(size || '').trim().slice(0, 20);
  if (normalizedSize) {
    snapshot.size = normalizedSize;
  }
  return snapshot;
};
