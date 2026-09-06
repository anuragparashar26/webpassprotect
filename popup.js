const lockToggle = document.getElementById('lock-toggle');
const lockStatus = document.getElementById('lock-status');
const settingsLink = document.getElementById('settings-link');

async function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'get-unlock-status' }, (response) => {
    if (chrome.runtime.lastError) return;
    const unlocked = response && response.anyUnlocked;
    lockToggle.checked = !unlocked;
    lockStatus.textContent = unlocked ? 'Sites unlocked' : 'All locked';
    lockStatus.classList.toggle('unlocked', unlocked);
  });
}

lockToggle.addEventListener('change', () => {
  if (!lockToggle.checked) {
    lockToggle.checked = true;
    return;
  }

  chrome.runtime.sendMessage({ type: 'lock-all' }, () => {
    lockStatus.textContent = 'All locked';
    lockStatus.classList.remove('unlocked');
  });
});

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refreshStatus();
