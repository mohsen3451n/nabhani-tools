document.addEventListener('submit', function (e) {
  const form = e.target;
  if (form && form.matches('[data-confirm]')) {
    const msg = form.getAttribute('data-confirm') || 'مطمئن هستید؟';
    if (!window.confirm(msg)) e.preventDefault();
  }
});

document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('siteMenuBtn');
  const menu = document.getElementById('siteMenu');
  const overlay = document.getElementById('siteMenuOverlay');
  if (btn && menu && overlay) {
    btn.addEventListener('click', function () { menu.classList.add('open'); overlay.classList.add('open'); });
    overlay.addEventListener('click', function () { menu.classList.remove('open'); overlay.classList.remove('open'); });
  }

  const copyBtn = document.getElementById('copyCardBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      const text = copyBtn.getAttribute('data-copy') || '';
      const done = () => { const o = copyBtn.textContent; copyBtn.textContent = '✅ کپی شد'; setTimeout(() => { copyBtn.textContent = o; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done).catch(() => window.prompt('شماره کارت را کپی کنید:', text)); }
      else window.prompt('شماره کارت را کپی کنید:', text);
    });
  }

  // ---- نصب روی صفحه اصلی (PWA) ----
  const banner = document.getElementById('pwaBanner');
  const bannerText = document.getElementById('pwaBannerText');
  const installBtn = document.getElementById('pwaInstallBtn');
  const dismissBtn = document.getElementById('pwaDismissBtn');
  let deferredPrompt = null;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const dismissed = localStorage.getItem('nb_pwa_dismissed');

  if (banner && !isStandalone && !dismissed) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (isIOS) {
      if (bannerText) bannerText.textContent = 'برای افزودن به صفحه اصلی: دکمه اشتراک‌گذاری (⬆️) را بزنید و «Add to Home Screen» را انتخاب کنید';
      if (installBtn) installBtn.style.display = 'none';
      banner.style.display = 'flex';
    } else {
      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        banner.style.display = 'flex';
      });
    }

    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
        banner.style.display = 'none';
      });
    }
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        banner.style.display = 'none';
        localStorage.setItem('nb_pwa_dismissed', '1');
      });
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(function () {});
  }
});
