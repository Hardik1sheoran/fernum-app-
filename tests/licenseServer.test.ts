import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from 'vitest';
import type { Server } from 'node:http';
import app, { getDodoEnvironment, activeDodoEnv } from '../server/index.js';
import { licenseDb, InMemoryLicenseStore, setLicenseStore } from '../server/db.js';
import { dodo } from '../dodo.js';

describe('Fernum License Database & Service (Postgres & In-Memory Store)', () => {
  const testDevice = 'b3d3f572-c516-43b9-8e5c-02cf4cfa3e91';
  let server: Server;
  let baseUrl: string;
  let memStore: InMemoryLicenseStore;

  beforeAll(async () => {
    // Inject clean in-memory store behind the store interface for unit & integration testing
    memStore = new InMemoryLicenseStore();
    setLicenseStore(memStore);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3001;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(async () => {
    memStore.setSimulateFailure(false);
    await memStore.close();
    vi.restoreAllMocks();
  });

  describe('Database Store Interface & Unit Functions', () => {
    it('initially reports an unknown device as not licensed', async () => {
      expect(await licenseDb.isLicensed(testDevice)).toBe(false);
      expect(await licenseDb.getLicense(testDevice)).toBeNull();
    });

    it('marks a device as licensed and persists license details', async () => {
      const success = await licenseDb.setLicense(testDevice, {
        email: 'customer@example.com',
        paymentId: 'pay_test_12345',
        productId: 'prod_fernum_pro',
      });

      expect(success).toBe(true);
      expect(await licenseDb.isLicensed(testDevice)).toBe(true);

      const license = await licenseDb.getLicense(testDevice);
      expect(license).toBeDefined();
      expect(license?.licensed).toBe(true);
      expect(license?.email).toBe('customer@example.com');
      expect(license?.paymentId).toBe('pay_test_12345');
      expect(license?.productId).toBe('prod_fernum_pro');
    });

    it('allows revoking a license by device_id', async () => {
      await licenseDb.setLicense(testDevice);
      expect(await licenseDb.isLicensed(testDevice)).toBe(true);

      const revoked = await licenseDb.revokeLicense(testDevice);
      expect(revoked).toBe(true);
      expect(await licenseDb.isLicensed(testDevice)).toBe(false);
    });

    it('allows revoking a license by payment_id', async () => {
      await licenseDb.setLicense(testDevice, { paymentId: 'pay_revoke_999' });
      expect(await licenseDb.isLicensed(testDevice)).toBe(true);

      const revoked = await licenseDb.revokeLicenseByPaymentId('pay_revoke_999');
      expect(revoked).toBe(true);
      expect(await licenseDb.isLicensed(testDevice)).toBe(false);
    });
  });

  describe('Database Outage Handling & HTTP 503 Invariant', () => {
    it('returns HTTP 503 (NOT { licensed: false }) when database query fails or is unreachable', async () => {
      memStore.setSimulateFailure(true);

      const res = await fetch(`${baseUrl}/api/license/${testDevice}`);
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.error).toMatch(/temporarily unavailable/i);
      // Crucial: Must NEVER return licensed: false during database failure
      expect(json.licensed).toBeUndefined();
    });

    it('returns HTTP 503 on /health/db when database check fails', async () => {
      memStore.setSimulateFailure(true);

      const res = await fetch(`${baseUrl}/health/db`);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.status).toBe('error');
    });

    it('returns HTTP 200 on /health/db when database is healthy', async () => {
      memStore.setSimulateFailure(false);

      const res = await fetch(`${baseUrl}/health/db`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.database).toBe('connected');
    });

    it('keeps GET /health completely independent of database state for UptimeRobot monitoring', async () => {
      // Even when the database is completely unreachable / sleeping, /health must return 200
      memStore.setSimulateFailure(true);

      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
    });
  });

  describe('GET /api/license/:deviceId response shape & privacy', () => {
    it('strictly returns only { licensed: boolean } and hides all customer PII / payment details', async () => {
      await licenseDb.setLicense(testDevice, {
        email: 'secret_user@example.com',
        paymentId: 'pay_secret_9999',
        productId: 'prod_live_xyz',
      });

      const res = await fetch(`${baseUrl}/api/license/${testDevice}`);
      expect(res.status).toBe(200);

      const json = await res.json();
      // Public response shape MUST contain only the boolean 'licensed' property
      expect(json).toEqual({ licensed: true });
      expect(json.email).toBeUndefined();
      expect(json.paymentId).toBeUndefined();
      expect(json.productId).toBeUndefined();
      expect(json.details).toBeUndefined();
      expect(json.deviceId).toBeUndefined();
    });

    it('returns { licensed: false } for an unlicensed valid UUID', async () => {
      const unlicensedUuid = '11111111-2222-4333-8444-555555555555';
      const res = await fetch(`${baseUrl}/api/license/${unlicensedUuid}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ licensed: false });
    });

    it('rejects invalid or non-UUID deviceId with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/license/not-a-valid-uuid-12345`);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Must be a valid UUID/i);
    });
  });

  describe('POST /api/create-checkout input validation & security', () => {
    it('rejects request with missing deviceId with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Must be a valid UUID/i);
    });

    it('rejects request with invalid UUID format deviceId with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'invalid-device-string' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Must be a valid UUID/i);
    });

    it('rejects request with invalid email format with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testDevice,
          email: 'not-an-email-address',
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Invalid email/i);
    });

    it('rejects request with name exceeding 100 characters with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testDevice,
          name: 'A'.repeat(101),
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Name must not exceed 100 characters/i);
    });

    it('accepts valid input and returns checkout session URL without leaking internal errors', async () => {
      vi.spyOn(dodo.checkoutSessions, 'create').mockResolvedValueOnce({
        checkout_url: 'https://checkout.dodopayments.com/buy/session_abc',
        session_id: 'sess_abc123',
      } as any);

      const res = await fetch(`${baseUrl}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testDevice,
          email: 'valid.user@example.com',
          name: 'Valid User',
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.checkout_url).toBe('https://checkout.dodopayments.com/buy/session_abc');
      expect(json.session_id).toBe('sess_abc123');
    });

    it('sanitizes upstream error responses when payment provider call fails', async () => {
      vi.spyOn(dodo.checkoutSessions, 'create').mockRejectedValueOnce(
        new Error('Upstream provider internal fatal network failure stack trace details')
      );

      const res = await fetch(`${baseUrl}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testDevice,
        }),
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      // Upstream error details or stacks must NEVER leak
      expect(json.error).toBe('Failed to create checkout session. Please try again later.');
      expect(json.stack).toBeUndefined();
    });
  });

  describe('POST /api/webhooks/dodo signature, upsert idempotency & refund revocation', () => {
    const validUuid = 'a0000000-b111-4222-8333-c44444444444';

    it('rejects webhooks with invalid signatures with HTTP 400 and sanitized message', async () => {
      vi.spyOn(dodo.webhooks, 'unwrap').mockImplementationOnce(() => {
        throw new Error('Signature mismatch raw cryptographic error');
      });

      const res = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'payment.succeeded' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Webhook signature verification failed.');
      expect(json.stack).toBeUndefined();
    });

    it('marks device as licensed upon verified payment.succeeded event with matching product and valid UUID', async () => {
      const currentProductId = process.env.DODO_PRODUCT_ID || 'prod_yourlicense';
      vi.spyOn(dodo.webhooks, 'unwrap').mockReturnValueOnce({
        type: 'payment.succeeded',
        data: {
          payment_id: 'pay_live_test_001',
          product_cart: [{ product_id: currentProductId }],
          customer: { email: 'buyer@example.com' },
          metadata: { deviceId: validUuid },
        },
      } as any);

      const res = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'test' }),
      });

      expect(res.status).toBe(200);
      expect(await licenseDb.isLicensed(validUuid)).toBe(true);
    });

    it('ensures webhook upsert idempotency: replaying the identical payment event is safe', async () => {
      const currentProductId = process.env.DODO_PRODUCT_ID || 'prod_yourlicense';
      const eventPayload = {
        type: 'payment.succeeded',
        data: {
          payment_id: 'pay_live_test_replay',
          product_cart: [{ product_id: currentProductId }],
          customer: { email: 'buyer@example.com' },
          metadata: { deviceId: validUuid },
        },
      };

      // Delivery 1
      vi.spyOn(dodo.webhooks, 'unwrap').mockReturnValueOnce(eventPayload as any);
      const res1 = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'test' }),
      });
      expect(res1.status).toBe(200);
      expect(await licenseDb.isLicensed(validUuid)).toBe(true);

      // Delivery 2 (replay)
      vi.spyOn(dodo.webhooks, 'unwrap').mockReturnValueOnce(eventPayload as any);
      const res2 = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'test' }),
      });
      expect(res2.status).toBe(200);
      expect(await licenseDb.isLicensed(validUuid)).toBe(true);
    });

    it('revokes license on refund.succeeded webhook event', async () => {
      const refundPaymentId = 'pay_to_refund_001';
      await licenseDb.setLicense(validUuid, {
        licensed: true,
        paymentId: refundPaymentId,
      });
      expect(await licenseDb.isLicensed(validUuid)).toBe(true);

      // Dodo Payments official refund event
      vi.spyOn(dodo.webhooks, 'unwrap').mockReturnValueOnce({
        type: 'refund.succeeded',
        data: {
          payment_id: refundPaymentId,
          refund_id: 'ref_12345',
        },
      } as any);

      const res = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'test' }),
      });

      expect(res.status).toBe(200);
      // License must be revoked!
      expect(await licenseDb.isLicensed(validUuid)).toBe(false);
    });

    it('revokes license on customer dispute events (dispute.opened / dispute.lost)', async () => {
      const disputePaymentId = 'pay_dispute_002';
      await licenseDb.setLicense(validUuid, {
        licensed: true,
        paymentId: disputePaymentId,
      });
      expect(await licenseDb.isLicensed(validUuid)).toBe(true);

      vi.spyOn(dodo.webhooks, 'unwrap').mockReturnValueOnce({
        type: 'dispute.opened',
        data: {
          payment_id: disputePaymentId,
          dispute_id: 'dsp_999',
        },
      } as any);

      const res = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'test' }),
      });

      expect(res.status).toBe(200);
      expect(await licenseDb.isLicensed(validUuid)).toBe(false);
    });

    it('ignores payment.succeeded if product does not match DODO_PRODUCT_ID', async () => {
      vi.spyOn(dodo.webhooks, 'unwrap').mockReturnValueOnce({
        type: 'payment.succeeded',
        data: {
          payment_id: 'pay_other_product',
          product_cart: [{ product_id: 'pdt_unrelated_cheaper_item' }],
          customer: { email: 'attacker@example.com' },
          metadata: { deviceId: validUuid },
        },
      } as any);

      const res = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'test' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ignored).toBe('product_mismatch');
      expect(await licenseDb.isLicensed(validUuid)).toBe(false);
    });

    it('ignores payment.succeeded if metadata.deviceId is not a valid UUID', async () => {
      const currentProductId = process.env.DODO_PRODUCT_ID || 'prod_yourlicense';
      vi.spyOn(dodo.webhooks, 'unwrap').mockReturnValueOnce({
        type: 'payment.succeeded',
        data: {
          payment_id: 'pay_bad_device_id',
          product_cart: [{ product_id: currentProductId }],
          customer: { email: 'test@example.com' },
          metadata: { deviceId: 'malicious-string-not-uuid' },
        },
      } as any);

      const res = await fetch(`${baseUrl}/api/webhooks/dodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'test' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ignored).toBe('invalid_device_id');
      expect(await licenseDb.isLicensed('malicious-string-not-uuid')).toBe(false);
    });
  });

  describe('Dodo Environment Configuration (getDodoEnvironment & DODO_ENV)', () => {
    it('defaults to live_mode when DODO_ENV is unset or undefined', () => {
      expect(getDodoEnvironment(undefined)).toBe('live_mode');
    });

    it('defaults to live_mode when DODO_ENV is empty or whitespace', () => {
      expect(getDodoEnvironment('')).toBe('live_mode');
      expect(getDodoEnvironment('   ')).toBe('live_mode');
    });

    it('defaults to live_mode when DODO_ENV contains invalid strings', () => {
      expect(getDodoEnvironment('sandbox')).toBe('live_mode');
      expect(getDodoEnvironment('production')).toBe('live_mode');
      expect(getDodoEnvironment('development')).toBe('live_mode');
      expect(getDodoEnvironment('staging')).toBe('live_mode');
      expect(getDodoEnvironment('false')).toBe('live_mode');
    });

    it('accepts and normalizes test_mode correctly', () => {
      expect(getDodoEnvironment('test_mode')).toBe('test_mode');
      expect(getDodoEnvironment('TEST_MODE')).toBe('test_mode');
      expect(getDodoEnvironment(' test_mode ')).toBe('test_mode');
    });

    it('accepts and normalizes live_mode correctly', () => {
      expect(getDodoEnvironment('live_mode')).toBe('live_mode');
      expect(getDodoEnvironment('LIVE_MODE')).toBe('live_mode');
      expect(getDodoEnvironment(' live_mode ')).toBe('live_mode');
    });

    it('exports active mode from both dodo.js and server/index.js adhering to allowed modes', () => {
      expect(['live_mode', 'test_mode']).toContain(activeDodoEnv);
    });

    describe('reading from process.env.DODO_ENV', () => {
      const originalEnv = process.env.DODO_ENV;

      afterEach(() => {
        if (originalEnv !== undefined) {
          process.env.DODO_ENV = originalEnv;
        } else {
          delete process.env.DODO_ENV;
        }
      });

      it('defaults to live_mode when no DODO_ENV set', () => {
        delete process.env.DODO_ENV;
        expect(getDodoEnvironment()).toBe('live_mode');
      });

      it('activates test mode when DODO_ENV=test_mode', () => {
        process.env.DODO_ENV = 'test_mode';
        expect(getDodoEnvironment()).toBe('test_mode');
      });

      it('falls back to live_mode when an invalid value is set', () => {
        process.env.DODO_ENV = 'invalid_environment_value';
        expect(getDodoEnvironment()).toBe('live_mode');
      });
    });
  });
});

