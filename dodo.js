import DodoPayments from 'dodopayments';
import 'dotenv/config';

/**
 * Validates and normalizes the Dodo environment string.
 * Allows only 'test_mode' or 'live_mode', defaulting to 'live_mode' if unset or invalid.
 */
export function getDodoEnvironment(env = process.env.DODO_ENV) {
  const normalized = typeof env === 'string' ? env.trim().toLowerCase() : '';
  if (normalized === 'test_mode' || normalized === 'live_mode') {
    return normalized;
  }
  return 'live_mode';
}

const apiKey = process.env.DODO_PAYMENTS_API_KEY;
const hasValidKey = apiKey && !apiKey.startsWith('your_dodo_api_key');
export const activeDodoEnv = getDodoEnvironment(process.env.DODO_ENV);

export const dodo = new DodoPayments({
  bearerToken: hasValidKey ? apiKey : 'placeholder_token_fernum_desktop',
  webhookKey: process.env.DODO_WEBHOOK_SECRET,
  environment: activeDodoEnv,
});

// Helper for dodo.webhooks.verify to wrap unwrap verification
if (!dodo.webhooks.verify) {
  dodo.webhooks.verify = (payload, headers, secret) => {
    return dodo.webhooks.unwrap(payload, {
      headers,
      key: secret || process.env.DODO_WEBHOOK_SECRET,
    });
  };
}

export default dodo;
