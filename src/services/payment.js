// نکته مهم: اتصال مستقیم به درگاه بانک ملت (به‌سام / behpardakht) نیاز به قرارداد
// پذیرندگی مستقیم با بانک دارد. برای فروشگاه‌های کوچک از یک «درگاه واسط» (PSP)
// مثل زرین‌پال، آیدی‌پی یا نکست‌پی استفاده می‌شود که پشت صحنه به بانک‌ها (از جمله ملت)
// وصل هستند. این فایل با زرین‌پال پیاده شده و قابل تعویض با هر PSP دیگر است.
// شناسه پذیرندگی (Merchant ID) از پنل مدیریت -> تنظیمات قابل ثبت است؛ بدون آن
// این درگاه کار نمی‌کند چون واقعا فعال نشده (این یک محدودیت واقعی بانکی است، نه باگ).

const fetch = require('node-fetch');

function getUrls(sandbox) {
  return sandbox
    ? {
        base: 'https://sandbox.zarinpal.com/pg/v4/payment',
        startpay: 'https://sandbox.zarinpal.com/pg/StartPay',
      }
    : {
        base: 'https://payment.zarinpal.com/pg/v4/payment',
        startpay: 'https://www.zarinpal.com/pg/StartPay',
      };
}

async function requestPayment({ amountToman, description, callbackUrl, mobile, merchantId, sandbox }) {
  if (!merchantId) {
    const err = new Error('درگاه بانکی هنوز پیکربندی نشده است');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const { base, startpay } = getUrls(sandbox);

  const res = await fetch(`${base}/request.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId,
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
      url: `${startpay}/${data.data.authority}`,
    };
  }
  const err = new Error('خطا در اتصال به درگاه بانکی');
  err.detail = data;
  throw err;
}

async function verifyPayment({ amountToman, authority, merchantId, sandbox }) {
  const { base } = getUrls(sandbox);

  const res = await fetch(`${base}/verify.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId,
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
