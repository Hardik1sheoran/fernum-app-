import DodoPayments from 'dodopayments'

export const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
  environment: (process.env.DODO_ENVIRONMENT as 'live_mode' | 'test_mode') || 'test_mode',
})

export default dodo
