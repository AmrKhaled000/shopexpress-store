'use strict';

const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const MAIL_FROM = process.env.MAIL_FROM || process.env.EMAIL_USER || 'shop@shopexpress.com';
const BRAND_INK = '#1B1916';
const BRAND_PAPER = '#F5F1E8';
const BRAND_ACCENT = '#B9451F';
const BRAND_MUTED = '#6E6558';
const BRAND_LINE = '#E2DACB';

function buildTransporter() {
  // Primary path: the store's Gmail account over SMTP. Gmail requires an
  // App Password (with 2FA enabled), not the account password.
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT || 465),
      secure: String(process.env.EMAIL_SECURE || 'true') !== 'false',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  // Legacy path: SendGrid, when an API key is configured.
  if (process.env.SENDGRID_API_KEY) {
    try {
      return nodemailer.createTransport(
        sendgridTransport({
          auth: {
            api_key: process.env.SENDGRID_API_KEY
          }
        })
      );
    } catch (error) {
      console.warn('Mailer not configured:', error.message);
      return null;
    }
  }
  return null;
}

const transporter = buildTransporter();
const mailerReady = Boolean(transporter);
if (!mailerReady) {
  console.warn('[mailer] No email credentials configured (EMAIL_USER/EMAIL_PASS or SENDGRID_API_KEY). Emails will be skipped.');
}

function emailShell({ heading, body, actionLabel, actionUrl, note }) {
  return `
    <div style="margin:0; padding:32px 16px; background:${BRAND_PAPER}; font-family:Inter, Arial, sans-serif; color:${BRAND_INK};">
    <div style="max-width:520px; margin:0 auto; overflow:hidden; border:1px solid ${BRAND_LINE}; border-radius:20px; background:#FFFDF9;">
            <div style="padding:24px 28px; background:${BRAND_INK}; color:${BRAND_PAPER};">
                <span style="font-family:Georgia, 'Times New Roman', serif; font-size:22px; letter-spacing:-0.02em;">ShopExpress</span>
            </div>
            <div style="padding:32px 28px;">
                <h1 style="margin:0 0 14px; font-family:Georgia, 'Times New Roman', serif; font-size:30px; font-weight:500; line-height:1.1; letter-spacing:-0.03em; color:${BRAND_INK};">${heading}</h1>
                <div style="font-size:15px; line-height:1.7; color:${BRAND_MUTED};">${body}</div>
                ${
                    actionLabel && actionUrl
                        ? `<p style="margin:26px 0 0;"><a href="${actionUrl}" style="display:inline-block; padding:13px 22px; border-radius:999px; background:${BRAND_INK}; color:${BRAND_PAPER}; font-size:13px; font-weight:600; text-decoration:none;">${actionLabel}</a></p>`
                        : ''
                }
                ${
                    note
                        ? `<p style="margin:28px 0 0; padding-top:18px; border-top:1px solid ${BRAND_LINE}; font-size:12px; line-height:1.6; color:#948A7A;">${note}</p>`
                        : ''
                }
            </div>
            <div style="padding:16px 28px; border-top:1px solid ${BRAND_LINE}; font-size:11px; line-height:1.6; color:#948A7A;">
                ShopExpress · Considered objects for everyday living · <a href="${APP_URL}" style="color:${BRAND_ACCENT}; text-decoration:none;">Visit the shop</a>
            </div>
        </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(value) {
  const amount = Number(value);
  return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

function sendMail(options) {
  if (!transporter) {
    console.warn('[mailer] Skipping email (email not configured).', options.subject);
    return Promise.resolve({ skipped: true });
  }
  return transporter.sendMail({ from: MAIL_FROM, ...options });
}

function sendSignupEmail(to) {
  return sendMail({
    to,
    subject: 'Welcome to ShopExpress',
    html: emailShell({
      heading: 'Your account is ready.',
      body:
        '<p style="margin:0 0 12px;">Thank you for joining ShopExpress. Your cart and order history are now tied to this email address.</p>' +
        '<p style="margin:0;">The catalog is small on purpose — a tightly edited collection of objects chosen to be kept. We hope you find something that belongs on your shelf.</p>',
      actionLabel: 'Visit the shop',
      actionUrl: `${APP_URL}/products`,
      note: "If you didn't create this account, you can safely ignore this message."
    })
  });
}

function sendResetEmail(to, token) {
  const resetUrl = `${APP_URL}/reset/${token}`;
  return sendMail({
    to,
    subject: 'Reset your ShopExpress password',
    html: emailShell({
      heading: 'Reset your password.',
      body:
        '<p style="margin:0 0 12px;">Use the button below to choose a new password. The link is valid for one hour.</p>' +
        '<p style="margin:0;">If you didn’t ask for this, no changes have been made to your account.</p>',
      actionLabel: 'Choose a new password',
      actionUrl: resetUrl,
      note: 'For your security, this link expires after 60 minutes and can only be used once.'
    })
  });
}

function sendOrderEmail(to, order) {
  const reference = order._id ? order._id.toString().slice(-8).toUpperCase() : '';
  const lines = (order.products || []).map(item => {
    const product = item.product || {};
    const title = escapeHtml(product.title || 'Product');
    const size = product.size ? ` · Size ${escapeHtml(product.size)}` : '';
    const lineTotal = formatMoney((Number(product.price) || 0) * (Number(item.quantity) || 0));
    return (
      '<tr>' +
      `<td style="padding:10px 0; border-bottom:1px solid ${BRAND_LINE}; color:${BRAND_INK};">${title}${size}<br><span style="color:${BRAND_MUTED}; font-size:12px;">${Number(item.quantity) || 0} × ${formatMoney(product.price)}</span></td>` +
      `<td style="padding:10px 0; border-bottom:1px solid ${BRAND_LINE}; text-align:right; color:${BRAND_INK}; font-variant-numeric:tabular-nums;">${lineTotal}</td>` +
      '</tr>'
    );
  }).join('');

  return sendMail({
    to,
    subject: `Your ShopExpress order #${reference}`,
    html: emailShell({
      heading: 'Order confirmed.',
      body:
        `<p style="margin:0 0 14px;">Thank you for your order — reference <strong>#${escapeHtml(reference)}</strong>. Here is what you chose:</p>` +
        `<table style="width:100%; border-collapse:collapse; font-size:14px; margin:0 0 14px;">${lines}</table>` +
        `<p style="margin:0; font-size:15px; color:${BRAND_INK};">Total: <strong>${formatMoney(order.total)}</strong> · Shipping: complimentary</p>`,
      actionLabel: 'View your orders',
      actionUrl: `${APP_URL}/orders`,
      note: 'No payment details are collected by ShopExpress; this email is a record of the order placed in your account.'
    })
  });
}

module.exports = { sendSignupEmail, sendResetEmail, sendOrderEmail, mailerReady };
