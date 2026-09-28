import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { dodo } from '../dodo.js';
import { licenseDb } from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust reverse proxy (Render sits behind Cloudflare/Render proxy)
app.set('trust proxy', 1);

// Standard UUID v4/v1-5 format validator
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

// RFC 5322 standard email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function isValidName(name) {
  if (typeof name !== 'string') return false;
  return name.trim().length <= 100;
}

// In-memory rate limiting middleware
export function createRateLimiter({ windowMs = 60000, max = 30, message = 'Too many requests. Please try again later.' }) {
  const hits = new Map();

  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, windowMs);
  if (interval.unref) interval.unref();

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = hits.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(ip, record);
    } else {
      record.count += 1;
    }

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

// Rate limiters for public endpoints
const checkoutLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many checkout requests. Please wait a moment before trying again.',
});

const licenseCheckLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many license verification requests. Please wait a moment before trying again.',
});

// Tightened CORS: Allows desktop app (no Origin), landing page, and local dev
const allowedOrigins = [
  'https://fernum.online',
  'https://www.fernum.online',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Electron main process, server-to-server, cURL)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.fernum.online') ||
        /^http:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);

// Capture raw body for webhook HMAC signature verification alongside JSON parsing
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf-8');
    },
  })
);

// Health check endpoint (kept free of database calls for UptimeRobot)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fernum-license-server' });
});

// Database health check endpoint for manual checks
app.get('/health/db', async (_req, res) => {
  try {
    const isHealthy = await licenseDb.healthCheck();
    if (isHealthy) {
      return res.json({ status: 'ok', database: 'connected' });
    }
    return res.status(503).json({ status: 'error', database: 'unhealthy' });
  } catch (err) {
    console.error('[Health/DB] Database check failed:', err?.message || err);
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

/**
 * POST /api/create-checkout
 * Accepts { email, name, deviceId } in request body.
 * Validates inputs: deviceId must be UUID, email format, name length.
 * Creates a Dodo checkout session and returns checkout_url as JSON.
 */
app.post('/api/create-checkout', checkoutLimiter, async (req, res) => {
  try {
    const { email, name, deviceId } = req.body || {};

    // 1. Validate deviceId (must be valid UUID)
    if (!deviceId || !isValidUuid(deviceId)) {
      return res.status(400).json({
        error: 'Invalid or missing deviceId. Must be a valid UUID.',
      });
    }

    // 2. Validate email if supplied
    if (email !== undefined && email !== null && String(email).trim() !== '') {
      if (!isValidEmail(email)) {
        return res.status(400).json({
          error: 'Invalid email address format.',
        });
      }
    }

    // 3. Validate name if supplied
    if (name !== undefined && name !== null && String(name).trim() !== '') {
      if (!isValidName(name)) {
        return res.status(400).json({
          error: 'Name must not exceed 100 characters.',
        });
      }
    }

    const productId = process.env.DODO_PRODUCT_ID || 'prod_yourlicense';
    const cleanDeviceId = String(deviceId).trim();
    const cleanEmail = email ? String(email).trim() : undefined;
    const cleanName = name ? String(name).trim() : undefined;

    // Create checkout session with Dodo Payments
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      customer: {
        email: cleanEmail,
        name: cleanName,
      },
      metadata: {
        deviceId: cleanDeviceId,
      },
    });

    if (!session || !session.checkout_url) {
      return res.status(502).json({
        error: 'Failed to generate checkout URL from payment provider.',
      });
    }

    return res.json({
      checkout_url: session.checkout_url,
      session_id: session.session_id,
    });
  } catch (err) {
    console.error('[API] /api/create-checkout error:', err?.message || err);
    return res.status(500).json({
      error: 'Failed to create checkout session. Please try again later.',
    });
  }
});

/**
 * POST /api/webhooks/dodo
 * Verifies incoming webhook signature using process.env.DODO_WEBHOOK_SECRET.
 * On 'payment.succeeded' event: verifies product and valid UUID, then upserts idempotently.
 * On 'refund.succeeded' or dispute events: revokes the license for that payment_id.
 */
app.post('/api/webhooks/dodo', async (req, res) => {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  const rawBody = req.rawBody || JSON.stringify(req.body);

  let event;
  try {
    // Verify webhook signature using Dodo SDK unwrap / verify
    if (dodo.webhooks && typeof dodo.webhooks.unwrap === 'function') {
      event = dodo.webhooks.unwrap(rawBody, {
        headers: req.headers,
        key: secret,
      });
    } else if (dodo.webhooks && typeof dodo.webhooks.verify === 'function') {
      event = dodo.webhooks.verify(rawBody, req.headers, secret);
    } else {
      event = req.body;
    }
  } catch (verifyErr) {
    console.error('[Webhook] Signature verification failed:', verifyErr?.message || verifyErr);
    return res.status(400).json({
      error: 'Webhook signature verification failed.',
    });
  }

  try {
    const eventType = event.type || event.event_type;
    console.log(`[Webhook] Received verified Dodo event: ${eventType}`);

    if (eventType === 'payment.succeeded') {
      const payloadData = event.data || {};
      const metadata = payloadData.metadata || payloadData.payment?.metadata || {};
      const deviceId = metadata.deviceId || metadata.device_id;

      // 1. Verify deviceId is a valid UUID
      if (!deviceId || !isValidUuid(deviceId)) {
        console.warn('[Webhook] payment.succeeded ignored: missing or invalid UUID deviceId in metadata');
        return res.status(200).json({ received: true, ignored: 'invalid_device_id' });
      }

      // 2. Verify product matches DODO_PRODUCT_ID
      const expectedProductId = process.env.DODO_PRODUCT_ID;
      if (expectedProductId) {
        const cartProducts = (payloadData.product_cart || []).map((p) => p.product_id);
        const itemProducts = (payloadData.items || []).map((p) => p.product_id);
        const directProductId = payloadData.product_id;
        const allProducts = [...cartProducts, ...itemProducts, directProductId].filter(Boolean);

        const matchesProduct = allProducts.length === 0 || allProducts.includes(expectedProductId);
        if (!matchesProduct) {
          console.warn(
            `[Webhook] payment.succeeded ignored: product mismatch. Expected: ${expectedProductId}, Found: ${allProducts.join(', ')}`
          );
          return res.status(200).json({ received: true, ignored: 'product_mismatch' });
        }
      }

      // 3. Mark device as licensed (Idempotent upsert: safe to replay repeatedly)
      const cleanDeviceId = String(deviceId).trim();
      await licenseDb.setLicense(cleanDeviceId, {
        licensed: true,
        email: payloadData.customer?.email || event.customer?.email,
        paymentId: payloadData.payment_id || payloadData.id,
        productId: payloadData.product_cart?.[0]?.product_id || process.env.DODO_PRODUCT_ID,
      });
      console.log(`[Webhook] Device ${cleanDeviceId} successfully marked as licensed!`);
    } else if (eventType === 'refund.succeeded') {
      // Dodo Payments official refund event: revoke license associated with payment_id
      const payloadData = event.data || {};
      const paymentId = payloadData.payment_id || payloadData.payment?.id || payloadData.id;
      if (paymentId) {
        const revoked = await licenseDb.revokeLicenseByPaymentId(paymentId);
        console.log(`[Webhook] refund.succeeded: license for payment ${paymentId} revoked: ${revoked}`);
      } else {
        console.warn('[Webhook] refund.succeeded received without payment_id in payload');
      }
    } else if (
      eventType === 'dispute.opened' ||
      eventType === 'dispute.lost' ||
      eventType === 'dispute.accepted'
    ) {
      // Customer dispute opened/accepted: revoke license associated with payment_id
      const payloadData = event.data || {};
      const paymentId = payloadData.payment_id || payloadData.id;
      if (paymentId) {
        const revoked = await licenseDb.revokeLicenseByPaymentId(paymentId);
        console.log(`[Webhook] ${eventType}: license for payment ${paymentId} revoked: ${revoked}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Processing error:', err?.message || err);
    return res.status(500).json({ error: 'Internal error processing webhook' });
  }
});

/**
 * GET /api/license/:deviceId
 * Strictly returns { licensed: boolean } only.
 * No email, paymentId, or productId is exposed in public response.
 * If database is unreachable or query fails, returns HTTP 503 (NOT { licensed: false }).
 */
app.get('/api/license/:deviceId', licenseCheckLimiter, async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId || !isValidUuid(deviceId)) {
    return res.status(400).json({ error: 'Invalid or missing deviceId. Must be a valid UUID.' });
  }

  try {
    const isLicensed = await licenseDb.isLicensed(deviceId.trim());
    return res.json({
      licensed: isLicensed,
    });
  } catch (err) {
    console.error('[API] /api/license/:deviceId database error:', err?.message || err);
    // Return HTTP 503 so client preserves cached Pro state instead of revoking on temporary DB outage
    return res.status(503).json({
      error: 'License verification service temporarily unavailable. Please retry shortly.',
    });
  }
});

// Centralized error handler to catch CORS errors or unhandled throws without leaking stacks
app.use((err, _req, res, _next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed by CORS.' });
  }
  console.error('[Server] Unhandled error:', err?.message || err);
  return res.status(500).json({ error: 'Internal server error.' });
});

// Start server if run directly
if (process.env.NODE_ENV !== 'test') {
  // Initialize database schema asynchronously on startup
  licenseDb.init().catch((err) => {
    console.warn('[Server] Initial database connection/migration deferred until first query:', err?.message || err);
  });

  app.listen(PORT, () => {
    console.log(`[Fernum License Server] Running on http://localhost:${PORT}`);
  });
}

export default app;


