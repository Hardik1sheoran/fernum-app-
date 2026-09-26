import DodoPayments from 'dodopayments'

const apiKey = process.env.DODO_PAYMENTS_API_KEY
const hasValidKey = apiKey && !apiKey.startsWith('your_dodo_api_key')

// Safe client instance: falls back to a placeholder token if none is configured
// so the Electron desktop app never crashes on import/startup.
export const dodo: DodoPayments = new DodoPayments({
  bearerToken: hasValidKey ? apiKey : 'placeholder_token_fernum_desktop',
  environment: (process.env.DODO_ENVIRONMENT as 'live_mode' | 'test_mode') || 'test_mode',
})

export default dodo
