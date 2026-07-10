document.addEventListener('submit', function (e) {
  const form = e.target;
  if (form && form.matches('[data-confirm]')) {
    const msg = form.getAttribute('data-confirm') || 'مطمئن هستید؟';
    if (!window.confirm(msg)) {
      e.preventDefault();
    }
  }
});
