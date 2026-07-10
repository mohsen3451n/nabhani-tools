// نکته مهم: اتصال مستقیم به درگاه بانک ملت (به‌سام / behpardakht) نیاز به قرارداد
// پذیرندگی مستقیم با بانک دارد. برای فروشگاه‌های کوچک از یک «درگاه واسط» (PSP)
// مثل زرین‌پال، آیدی‌پی یا نکست‌پی استفاده می‌شود که پشت صحنه به بانک‌ها (از جمله ملت)
// وصل هستند. این فایل با زرین‌پال پیاده شده و قابل تعویض با هر PSP دیگر است.

const fetch = require('node-fetch');

const SANDBOX = String(process.env.ZARINPAL_SANDBOX || 'true') === 'true';
const MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID || '';

const BASE = SANDBOX
  ? 'https://sandbox.zarinpal.com/pg/v4/payment'
  : 'https://payment.zarinpal.com/pg/v4/payment';

const STARTPAY = SANDBOX
  ? 'https://sandbox.zarinpal.com/pg/StartPay'
  : 'https://www.zarinpal.com/pg/StartPay';

async function requestPayment({ amountToman, description, callbackUrl, mobile }) {
  if (!MERCHANT_ID) {
    const err = new Error('درگاه بانکی هنوز پیکربندی نشده است (ZARINPAL_MERCHANT_ID خالی است)');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch(`${BASE}/request.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: MERCHANT_ID,
      amount: amountToman * 10,
      description,
      callback_url: callbackUrl,
      metadata: mobile ? { mobile } : undefined,
    }),
  });
  const data = await res.json();
  if (data?.data?.code === 100) {
    return {
      authority: data.data.authority,
      url: `${STARTPAY}/${data.data.authority}`,
    };
  }
  const err = new Error('خطا در اتصال به درگاه بانکی');
  err.detail = data;
  throw err;
}

async function verifyPayment({ amountToman, authority }) {
  const res = await fetch(`${BASE}/verify.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: MERCHANT_ID,
      amount: amountToman * 10,
      authority,
    }),
  });
  const data = await res.json();
  if (data?.data?.code === 100 || data?.data?.code === 101) {
    return { ok: true, refId: data.data.ref_id };
  }
  return { ok: false, detail: data };
}

module.exports = { requestPayment, verifyPayment };
