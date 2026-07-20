document.addEventListener('submit', function (e) {
  const form = e.target;
  if (form && form.matches('[data-confirm]')) {
    const msg = form.getAttribute('data-confirm') || 'مطمئن هستید؟';
    if (!window.confirm(msg)) {
      e.preventDefault();
    }
  }
});

document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('siteMenuBtn');
  const menu = document.getElementById('siteMenu');
  const overlay = document.getElementById('siteMenuOverlay');
  if (btn && menu && overlay) {
    btn.addEventListener('click', function () {
      menu.classList.add('open');
      overlay.classList.add('open');
    });
    overlay.addEventListener('click', function () {
      menu.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  const copyBtn = document.getElementById('copyCardBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      const text = copyBtn.getAttribute('data-copy') || '';
      const done = () => {
        const original = copyBtn.textContent;
        copyBtn.textContent = '✅ کپی شد';
        setTimeout(() => { copyBtn.textContent = original; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
          window.prompt('شماره کارت را کپی کنید:', text);
        });
      } else {
        window.prompt('شماره کارت را کپی کنید:', text);
      }
    });
  }
});
