(() => {
  const hostname = location.hostname;
  if (!hostname) return;

  chrome.runtime.sendMessage({ type: 'check-domain', domain: hostname }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.blocked) {
      const lockedUrl = chrome.runtime.getURL('blocked.html') + '?domain=' + encodeURIComponent(hostname);
      location.replace(lockedUrl);
    }
  });
})();
