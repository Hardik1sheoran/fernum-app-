import { describe, it, expect, beforeEach } from 'vitest';
import { licenseDb } from '../server/db';

describe('Fernum License Database & Service', () => {
  const testDevice = 'test-device-uuid-999';

  beforeEach(() => {
    licenseDb.deleteLicense(testDevice);
  });

  it('initially reports an unknown device as not licensed', () => {
    expect(licenseDb.isLicensed(testDevice)).toBe(false);
    expect(licenseDb.getLicense(testDevice)).toBeNull();
  });

  it('marks a device as licensed and persists license details', () => {
    const success = licenseDb.setLicense(testDevice, {
      email: 'customer@example.com',
      paymentId: 'pay_test_12345',
      productId: 'prod_fernum_pro',
    });

    expect(success).toBe(true);
    expect(licenseDb.isLicensed(testDevice)).toBe(true);

    const license = licenseDb.getLicense(testDevice);
    expect(license).toBeDefined();
    expect(license?.licensed).toBe(true);
    expect(license?.email).toBe('customer@example.com');
    expect(license?.paymentId).toBe('pay_test_12345');
    expect(license?.productId).toBe('prod_fernum_pro');
  });

  it('allows revoking a license', () => {
    licenseDb.setLicense(testDevice);
    expect(licenseDb.isLicensed(testDevice)).toBe(true);

    licenseDb.revokeLicense(testDevice);
    expect(licenseDb.isLicensed(testDevice)).toBe(false);
  });
});
