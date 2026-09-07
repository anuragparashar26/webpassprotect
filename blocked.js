(() => {
  const params = new URLSearchParams(location.search);
  const rawUrl = params.get('url') || '';
  let displayName = '';
  let redirectUrl = '';

  try {
    const parsed = new URL(rawUrl);
    displayName = parsed.hostname;
    redirectUrl = parsed.origin + parsed.pathname + parsed.search + parsed.hash;
  } catch {
    displayName = rawUrl;
    redirectUrl = 'https://' + rawUrl;
  }

  const domainEl = document.getElementById('domain');
  const form = document.getElementById('unlock-form');
  const input = document.getElementById('password');
  const error = document.getElementById('error');

  domainEl.textContent = displayName;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = input.value;
    if (!password) return;

    error.classList.remove('visible');

    chrome.runtime.sendMessage(
      { type: 'unlock-domain', domain: displayName, password: password },
      (response) => {
        if (chrome.runtime.lastError) {
          error.classList.add('visible');
          input.value = '';
          input.focus();
          return;
        }
        if (response && response.success) {
          location.replace(redirectUrl);
        } else {
          error.classList.add('visible');
          input.value = '';
          input.focus();
        }
      }
    );
  });
})();
