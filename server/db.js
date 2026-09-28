import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

/**
 * Interface definition for License Stores:
 * - init(): Promise<void>
 * - isLicensed(deviceId: string): Promise<boolean>
 * - getLicense(deviceId: string): Promise<object | null>
 * - setLicense(deviceId: string, details: object): Promise<boolean>
 * - revokeLicenseByPaymentId(paymentId: string): Promise<boolean>
 * - revokeLicense(deviceId: string): Promise<boolean>
 * - deleteLicense(deviceId: string): Promise<boolean>
 * - healthCheck(): Promise<boolean>
 * - close(): Promise<void>
 */

// Helper to execute query with 1 retry on connection timeout / wake-up
async function executeWithRetry(fn, retries = 1, delayMs = 1500) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      console.warn(`[DB] Database query error, retrying in ${delayMs}ms (Neon waking):`, err?.message || err);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return executeWithRetry(fn, retries - 1, delayMs);
    }
    throw err;
  }
}

/**
 * PostgreSQL / Neon License Store implementation
 */
export class PostgresLicenseStore {
  constructor(connectionString) {
    this.connectionString = connectionString || process.env.DATABASE_URL;
    this.pool = null;
    this.initialized = false;
  }

  getPool() {
    if (!this.pool) {
      if (!this.connectionString) {
        throw new Error('DATABASE_URL is not configured');
      }
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000, // 15s timeout to allow Neon compute to wake from sleep
        idleTimeoutMillis: 30000,
        max: 10,
      });

      this.pool.on('error', (err) => {
        console.error('[DB] Unexpected error on idle client in pool:', err?.message || err);
      });
    }
    return this.pool;
  }

  async init() {
    if (this.initialized) return;
    const pool = this.getPool();

    await executeWithRetry(async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS licenses (
            device_id uuid PRIMARY KEY,
            licensed boolean NOT NULL,
            email text,
            payment_id text UNIQUE,
            product_id text,
            updated_at timestamptz DEFAULT now()
          );
        `);
        this.initialized = true;
      } finally {
        client.release();
      }
    });
  }

  async isLicensed(deviceId) {
    if (!deviceId) return false;
    const pool = this.getPool();

    return executeWithRetry(async () => {
      const res = await pool.query(
        'SELECT licensed FROM licenses WHERE device_id = $1 LIMIT 1',
        [deviceId]
      );
      if (res.rows.length === 0) return false;
      return Boolean(res.rows[0].licensed);
    });
  }

  async getLicense(deviceId) {
    if (!deviceId) return null;
    const pool = this.getPool();

    return executeWithRetry(async () => {
      const res = await pool.query(
        'SELECT device_id, licensed, email, payment_id, product_id, updated_at FROM licenses WHERE device_id = $1 LIMIT 1',
        [deviceId]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        deviceId: row.device_id,
        licensed: row.licensed,
        email: row.email,
        paymentId: row.payment_id,
        productId: row.product_id,
        updatedAt: row.updated_at,
      };
    });
  }

  async setLicense(deviceId, details = {}) {
    if (!deviceId) return false;
    const pool = this.getPool();
    const isLicensed = details.licensed !== undefined ? Boolean(details.licensed) : true;
    const email = details.email || null;
    const paymentId = details.paymentId || null;
    const productId = details.productId || null;

    return executeWithRetry(async () => {
      // Upsert: keyed by device_id.
      // Replaying payment.succeeded updates the record idempotently.
      await pool.query(
        `INSERT INTO licenses (device_id, licensed, email, payment_id, product_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (device_id) DO UPDATE SET
           licensed = EXCLUDED.licensed,
           email = COALESCE(EXCLUDED.email, licenses.email),
           payment_id = COALESCE(EXCLUDED.payment_id, licenses.payment_id),
           product_id = COALESCE(EXCLUDED.product_id, licenses.product_id),
           updated_at = now();`,
        [deviceId, isLicensed, email, paymentId, productId]
      );
      return true;
    });
  }

  async revokeLicenseByPaymentId(paymentId) {
    if (!paymentId) return false;
    const pool = this.getPool();

    return executeWithRetry(async () => {
      const res = await pool.query(
        'UPDATE licenses SET licensed = false, updated_at = now() WHERE payment_id = $1',
        [paymentId]
      );
      return res.rowCount > 0;
    });
  }

  async revokeLicense(deviceId) {
    if (!deviceId) return false;
    const pool = this.getPool();

    return executeWithRetry(async () => {
      const res = await pool.query(
        'UPDATE licenses SET licensed = false, updated_at = now() WHERE device_id = $1',
        [deviceId]
      );
      return res.rowCount > 0;
    });
  }

  async deleteLicense(deviceId) {
    if (!deviceId) return false;
    const pool = this.getPool();

    return executeWithRetry(async () => {
      const res = await pool.query(
        'DELETE FROM licenses WHERE device_id = $1',
        [deviceId]
      );
      return res.rowCount > 0;
    });
  }

  async healthCheck() {
    const pool = this.getPool();
    return executeWithRetry(async () => {
      const res = await pool.query('SELECT 1 as alive');
      return res.rows.length > 0;
    });
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
    }
  }
}

/**
 * In-Memory License Store implementation for testing and offline development
 */
export class InMemoryLicenseStore {
  constructor() {
    this.licenses = new Map();
    this.simulateFailure = false;
  }

  setSimulateFailure(fail) {
    this.simulateFailure = Boolean(fail);
  }

  _checkFailure() {
    if (this.simulateFailure) {
      const err = new Error('Connection terminated unexpectedly: Neon database unreachable');
      err.code = 'ECONNREFUSED';
      throw err;
    }
  }

  async init() {
    this._checkFailure();
  }

  async isLicensed(deviceId) {
    this._checkFailure();
    if (!deviceId) return false;
    const item = this.licenses.get(deviceId);
    return Boolean(item && item.licensed);
  }

  async getLicense(deviceId) {
    this._checkFailure();
    if (!deviceId) return null;
    return this.licenses.get(deviceId) || null;
  }

  async setLicense(deviceId, details = {}) {
    this._checkFailure();
    if (!deviceId) return false;
    const existing = this.licenses.get(deviceId) || {};
    this.licenses.set(deviceId, {
      deviceId,
      licensed: details.licensed !== undefined ? Boolean(details.licensed) : true,
      email: details.email !== undefined ? details.email : existing.email || null,
      paymentId: details.paymentId !== undefined ? details.paymentId : existing.paymentId || null,
      productId: details.productId !== undefined ? details.productId : existing.productId || null,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async revokeLicenseByPaymentId(paymentId) {
    this._checkFailure();
    if (!paymentId) return false;
    let found = false;
    for (const [deviceId, record] of this.licenses.entries()) {
      if (record.paymentId === paymentId) {
        record.licensed = false;
        record.updatedAt = new Date().toISOString();
        this.licenses.set(deviceId, record);
        found = true;
      }
    }
    return found;
  }

  async revokeLicense(deviceId) {
    this._checkFailure();
    if (!deviceId) return false;
    const record = this.licenses.get(deviceId);
    if (record) {
      record.licensed = false;
      record.updatedAt = new Date().toISOString();
      this.licenses.set(deviceId, record);
      return true;
    }
    return false;
  }

  async deleteLicense(deviceId) {
    this._checkFailure();
    if (!deviceId) return false;
    return this.licenses.delete(deviceId);
  }

  async healthCheck() {
    this._checkFailure();
    return true;
  }

  async close() {
    this.licenses.clear();
  }
}

// Global active store instance
let activeStore = process.env.DATABASE_URL
  ? new PostgresLicenseStore(process.env.DATABASE_URL)
  : new InMemoryLicenseStore();

export function setLicenseStore(store) {
  activeStore = store;
}

export function getLicenseStore() {
  return activeStore;
}

export const licenseDb = {
  init: () => activeStore.init(),
  isLicensed: (id) => activeStore.isLicensed(id),
  getLicense: (id) => activeStore.getLicense(id),
  setLicense: (id, details) => activeStore.setLicense(id, details),
  revokeLicenseByPaymentId: (paymentId) => activeStore.revokeLicenseByPaymentId(paymentId),
  revokeLicense: (id) => activeStore.revokeLicense(id),
  deleteLicense: (id) => activeStore.deleteLicense(id),
  healthCheck: () => activeStore.healthCheck(),
  close: () => activeStore.close(),
};

export default licenseDb;
