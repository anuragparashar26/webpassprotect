(() => {
  const params = new URLSearchParams(location.search);
  const domain = params.get('domain') || '';
  const domainEl = document.getElementById('domain');
  const form = document.getElementById('unlock-form');
  const input = document.getElementById('password');
  const error = document.getElementById('error');

  domainEl.textContent = domain;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = input.value;
    if (!password) return;

    error.classList.remove('visible');

    chrome.runtime.sendMessage(
      { type: 'unlock-domain', domain: domain, password: password },
      (response) => {
        if (chrome.runtime.lastError) {
          error.classList.add('visible');
          input.value = '';
          input.focus();
          return;
        }
        if (response && response.success) {
          const siteUrl = 'https://' + domain;
          location.replace(siteUrl);
        } else {
          error.classList.add('visible');
          input.value = '';
          input.focus();
        }
      }
    );
  });
})();
