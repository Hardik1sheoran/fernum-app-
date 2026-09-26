import DodoPayments from 'dodopayments';
import 'dotenv/config';

export const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
  webhookKey: process.env.DODO_WEBHOOK_SECRET,
  environment: 'test_mode', // switch to 'live_mode' when live
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
