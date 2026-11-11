'use strict';

module.exports = (req, res, next) => {
  if (!req.session.isLoggedIn) {
    return res.redirect('/login');
  }
  if (!req.user || req.user.isAdmin !== true) {
    return res.status(403).render('403', {
      pageTitle: 'Access denied',
      path: '/403'
    });
  }
  return next();
};
