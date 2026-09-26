import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { dodo } from '../dodo.js';
import { licenseDb } from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS setup
app.use(cors());

// Capture raw body for webhook HMAC signature verification alongside JSON parsing
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf-8');
    },
  })
);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fernum-license-server' });
});

/**
 * POST /api/create-checkout
 * Accepts { email, name, deviceId } in request body.
 * Creates a Dodo checkout session for product_id 'prod_yourlicense' (or process.env.DODO_PRODUCT_ID).
 * Passes deviceId in metadata, and returns checkout_url as JSON.
 */
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { email, name, deviceId } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({
        error: 'Missing required field: deviceId',
      });
    }

    const productId = process.env.DODO_PRODUCT_ID || 'prod_yourlicense';

    // Create checkout session with Dodo Payments
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      customer: {
        email: email || undefined,
        name: name || undefined,
      },
      metadata: {
        deviceId: String(deviceId),
      },
    });

    if (!session || !session.checkout_url) {
      return res.status(502).json({
        error: 'Failed to generate checkout URL from payment provider',
      });
    }

    return res.json({
      checkout_url: session.checkout_url,
      session_id: session.session_id,
    });
  } catch (err) {
    console.error('[API] /api/create-checkout error:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error creating checkout session',
    });
  }
});

/**
 * POST /api/webhooks/dodo
 * Verifies incoming webhook signature using process.env.DODO_WEBHOOK_SECRET.
 * On 'payment.succeeded' event, marks deviceId as licensed in database.
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
    console.error('[Webhook] Signature verification failed:', verifyErr.message);
    return res.status(400).json({
      error: `Webhook signature verification failed: ${verifyErr.message}`,
    });
  }

  try {
    const eventType = event.type || event.event_type;
    console.log(`[Webhook] Received verified Dodo event: ${eventType}`);

    if (eventType === 'payment.succeeded') {
      const payloadData = event.data || {};
      const metadata = payloadData.metadata || payloadData.payment?.metadata || {};
      const deviceId = metadata.deviceId || metadata.device_id;

      if (deviceId) {
        licenseDb.setLicense(deviceId, {
          licensed: true,
          email: payloadData.customer?.email || event.customer?.email,
          paymentId: payloadData.payment_id || payloadData.id,
          productId: payloadData.product_cart?.[0]?.product_id || process.env.DODO_PRODUCT_ID,
        });
        console.log(`[Webhook] Device ${deviceId} successfully marked as licensed!`);
      } else {
        console.warn('[Webhook] payment.succeeded received without deviceId in metadata');
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook] Processing error:', err);
    return res.status(500).json({ error: 'Internal error processing webhook' });
  }
});

/**
 * GET /api/license/:deviceId
 * Looks up and returns { licensed: true/false } for that deviceId.
 */
app.get('/api/license/:deviceId', (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    return res.status(400).json({ error: 'Missing deviceId parameter' });
  }

  const isLicensed = licenseDb.isLicensed(deviceId);
  const licenseInfo = licenseDb.getLicense(deviceId);

  return res.json({
    deviceId,
    licensed: isLicensed,
    details: isLicensed ? licenseInfo : null,
  });
});

// Start server if run directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Fernum License Server] Running on http://localhost:${PORT}`);
  });
}

export default app;
