const crypto = require('crypto');

const bcrypt = require('bcryptjs');

const User = require('../models/user');
const { sendSignupEmail, sendResetEmail } = require('../util/mailer');

exports.getLogin = (req, res, next) => {
  res.render('auth/login', {
    path: '/login',
    pageTitle: 'Login',
    errorMessage: null,
    successMessage: null,
    validationErrors: {},
    form: { email: '' }
  });
};

exports.getSignup = (req, res, next) => {
  res.render('auth/signup', {
    path: '/signup',
    pageTitle: 'Signup',
    errorMessage: null,
    successMessage: null,
    validationErrors: {},
    form: { email: '' }
  });
};

exports.postLogin = (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  const validationErrors = {};
  if (!isValidEmail(email)) {
    validationErrors.email = 'Please enter a valid email address.';
  }
  if (!password) {
    validationErrors.password = 'Password is required.';
  }

  if (Object.keys(validationErrors).length > 0) {
    return res.status(422).render('auth/login', {
      path: '/login',
      pageTitle: 'Login',
      errorMessage: 'Please fix the errors below.',
      successMessage: null,
      validationErrors,
      form: { email }
    });
  }

  User.findOne({ email })
    .then(user => {
      if (!user) {
        req.flash('error', 'Invalid email or password.');
        return res.redirect('/login');
      }
      return bcrypt
        .compare(password, user.password)
        .then(doMatch => {
          if (!doMatch) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
          }
          // Regenerate the session id on login to prevent session fixation.
          req.session.regenerate(regenerateError => {
            if (regenerateError) {
              return next(regenerateError);
            }
            req.session.isLoggedIn = true;
            req.session.user = {
              _id: user._id,
              email: user.email,
              isAdmin: user.isAdmin
            };
            return req.session.save(saveError => {
              if (saveError) {
                return next(saveError);
              }
              res.redirect('/');
            });
          });
        })
        .catch(err => next(err));
    })
    .catch(err => next(err));
};

exports.postSignup = (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';

  const validationErrors = {};
  if (!isValidEmail(email)) {
    validationErrors.email = 'Please enter a valid email address.';
  }
  if (password.length < 6) {
    validationErrors.password = 'Password must be at least 6 characters.';
  }
  if (password !== confirmPassword) {
    validationErrors.confirmPassword = 'Passwords do not match.';
  }

  if (Object.keys(validationErrors).length > 0) {
    return res.status(422).render('auth/signup', {
      path: '/signup',
      pageTitle: 'Signup',
      errorMessage: 'Please fix the errors below.',
      validationErrors,
      form: { email }
    });
  }

  User.findOne({ email })
    .then(userDoc => {
      if (userDoc) {
        req.flash('error', 'An account with this email already exists.');
        return res.redirect('/signup');
      }
      return bcrypt
        .hash(password, 12)
        .then(hashedPassword => {
          const user = new User({
            email: email,
            password: hashedPassword,
            cart: { items: [] }
          });
          return user.save();
        })
        .then(result => {
          req.flash('success', 'Your account is ready. Sign in to start shopping.');
          res.redirect('/login');
          return sendSignupEmail(email).catch(mailError => {
            console.warn('[mailer] Welcome email could not be sent:', mailError.message);
          });
        })
        .catch(err => {
          if (err && err.code === 11000) {
            req.flash('error', 'An account with this email already exists.');
            return res.redirect('/signup');
          }
          if (!res.headersSent) {
            next(err);
          } else {
            console.error(err);
          }
        });
    })
    .catch(err => next(err));
};

exports.postLogout = (req, res, next) => {
  req.session.destroy(err => {
    if (err) {
      return next(err);
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

exports.getReset = (req, res, next) => {
  res.render('auth/reset', {
    path: '/reset',
    pageTitle: 'Reset Password',
    errorMessage: null,
    successMessage: null
  });
};

exports.postReset = (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase();

  if (!isValidEmail(email)) {
    req.flash('error', 'Please enter a valid email address.');
    return res.redirect('/reset');
  }

  crypto.randomBytes(32, (err, buffer) => {
    if (err) {
      return next(err);
    }
    const token = buffer.toString('hex');
    const genericMessage =
      'If an account exists for that email, password reset instructions are on their way.';

    User.findOne({ email })
      .then(user => {
        if (!user) {
          return null;
        }
        user.resetToken = hashResetToken(token);
        user.resetTokenExpiration = Date.now() + 3600000;
        return user.save();
      })
      .then(result => {
        req.flash('success', genericMessage);
        res.redirect('/login');
        if (result) {
          return sendResetEmail(email, token).catch(mailError => {
            console.warn('[mailer] Reset email could not be sent:', mailError.message);
          });
        }
      })
      .catch(err => next(err));
  });
};

exports.getNewPassword = (req, res, next) => {
  const token = req.params.token;
  User.findOne({ resetToken: hashResetToken(token), resetTokenExpiration: { $gt: Date.now() } })
    .then(user => {
      if (!user) {
        req.flash('error', 'Password reset link is invalid or has expired.');
        return res.redirect('/reset');
      }
      res.render('auth/new-password', {
        path: '/new-password',
        pageTitle: 'New Password',
        errorMessage: null,
        successMessage: null,
        userId: user._id.toString(),
        passwordToken: token,
        validationErrors: {}
      });
    })
    .catch(err => next(err));
};

exports.postNewPassword = (req, res, next) => {
  const newPassword = req.body.password || '';
  const userId = req.body.userId;
  const passwordToken = req.body.passwordToken;

  if (newPassword.length < 6) {
    return User.findOne({ _id: userId })
      .then(user => {
        return res.status(422).render('auth/new-password', {
          path: '/new-password',
          pageTitle: 'New Password',
          errorMessage: 'Password must be at least 6 characters.',
          userId: userId,
          passwordToken: passwordToken,
          validationErrors: { password: 'Password must be at least 6 characters.' }
        });
      })
      .catch(err => next(err));
  }

  User.findOne({
    resetToken: hashResetToken(passwordToken),
    resetTokenExpiration: { $gt: Date.now() },
    _id: userId
  })
    .then(user => {
      if (!user) {
        req.flash('error', 'Password reset link is invalid or has expired.');
        return res.redirect('/reset');
      }
      return bcrypt.hash(newPassword, 12).then(hashedPassword => {
        user.password = hashedPassword;
        user.resetToken = undefined;
        user.resetTokenExpiration = undefined;
        return user.save();
      });
    })
    .then(result => {
      if (result) {
        req.flash('success', 'Password updated. You can now log in.');
        res.redirect('/login');
      }
    })
    .catch(err => next(err));
};

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}