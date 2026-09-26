import DodoPayments from 'dodopayments';
import 'dotenv/config';

const apiKey = process.env.DODO_PAYMENTS_API_KEY;
const hasValidKey = apiKey && !apiKey.startsWith('your_dodo_api_key');

export const dodo = new DodoPayments({
  bearerToken: hasValidKey ? apiKey : 'placeholder_token_fernum_desktop',
  webhookKey: process.env.DODO_WEBHOOK_SECRET,
  environment: process.env.DODO_ENVIRONMENT || 'test_mode',
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
