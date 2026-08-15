import axios from 'axios';

export type BillingProviderHistory = {
  providerState: 'UNCONFIGURED' | 'NO_SUBSCRIPTION' | 'AVAILABLE' | 'UNAVAILABLE';
  subscriptionPayments: Array<{ id: string; amountPaise: number; currency: string; status: string; method: string | null; createdAt: Date }>;
  invoices: Array<{ id: string; amountPaise: number; currency: string; status: string; createdAt: Date }>;
};

function configuredCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret || keyId === 'dummy_key' || keySecret === 'dummy_secret') return null;
  return { username: keyId, password: keySecret };
}

function dateFromSeconds(value: unknown): Date {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(0);
}

export async function readBillingProviderHistory(subscriptionId: string | null): Promise<BillingProviderHistory> {
  const auth = configuredCredentials();
  if (!auth) return { providerState: 'UNCONFIGURED', subscriptionPayments: [], invoices: [] };
  if (!subscriptionId) return { providerState: 'NO_SUBSCRIPTION', subscriptionPayments: [], invoices: [] };
  try {
    const [paymentsResponse, invoicesResponse] = await Promise.all([
      axios.get('https://api.razorpay.com/v1/payments', { auth, params: { subscription_id: subscriptionId, count: 100 }, timeout: 10_000 }),
      axios.get('https://api.razorpay.com/v1/invoices', { auth, params: { subscription_id: subscriptionId, count: 100 }, timeout: 10_000 })
    ]);
    const paymentItems = Array.isArray(paymentsResponse.data?.items) ? paymentsResponse.data.items : [];
    const invoiceItems = Array.isArray(invoicesResponse.data?.items) ? invoicesResponse.data.items : [];
    return {
      providerState: 'AVAILABLE',
      subscriptionPayments: paymentItems.slice(0, 100).map((item: any) => ({
        id: String(item.id || ''),
        amountPaise: Number(item.amount || 0),
        currency: String(item.currency || 'INR'),
        status: String(item.status || 'unknown'),
        method: item.method ? String(item.method) : null,
        createdAt: dateFromSeconds(item.created_at)
      })),
      invoices: invoiceItems.slice(0, 100).map((item: any) => ({
        id: String(item.id || ''),
        amountPaise: Number(item.amount || item.amount_paid || 0),
        currency: String(item.currency || 'INR'),
        status: String(item.status || 'unknown'),
        createdAt: dateFromSeconds(item.created_at)
      }))
    };
  } catch {
    return { providerState: 'UNAVAILABLE', subscriptionPayments: [], invoices: [] };
  }
}
