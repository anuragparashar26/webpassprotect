(() => {
  const domainList = document.getElementById('domain-list');
  const domainCount = document.getElementById('domain-count');
  const newDomainInput = document.getElementById('new-domain');
  const addDomainBtn = document.getElementById('add-domain-btn');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const durationInput = document.getElementById('duration');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  const statusBadge = document.getElementById('status-badge');
  const badgeText = document.getElementById('badge-text');
  const setupModal = document.getElementById('setup-modal');
  const setupPasswordInput = document.getElementById('setup-password');
  const setupConfirmInput = document.getElementById('setup-confirm');
  const setupConfirmBtn = document.getElementById('setup-confirm-btn');
  const authModal = document.getElementById('auth-modal');
  const authPasswordInput = document.getElementById('auth-password');
  const authConfirmBtn = document.getElementById('auth-confirm');
  const authCancelBtn = document.getElementById('auth-cancel');

  let currentDomains = [];
  let passwordIsSet = false;
  let pendingAction = null;

  function showStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = 'save-status ' + (isError ? 'error' : 'success');
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'save-status';
    }, 3000);
  }

  function updateBadge() {
    if (passwordIsSet) {
      statusBadge.classList.remove('needs-setup');
      badgeText.textContent = 'Configured';
    } else {
      statusBadge.classList.add('needs-setup');
      badgeText.textContent = 'Setup Required';
    }
  }

  function renderDomains() {
    domainCount.textContent = currentDomains.length;
    domainList.innerHTML = '';
    if (currentDomains.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'domain-empty';
      empty.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span>No domains blocked yet.<br>Add a domain below to get started.</span>
      `;
      domainList.appendChild(empty);
      return;
    }
    currentDomains.forEach((domain, i) => {
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'domain-name';
      nameSpan.textContent = domain;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        currentDomains.splice(i, 1);
        renderDomains();
      });
      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      domainList.appendChild(li);
    });
  }

  function updatePresetButtons() {
    const val = parseInt(durationInput.value);
    document.querySelectorAll('.preset-btn').forEach(btn => {
      const btnVal = parseInt(btn.dataset.value);
      btn.classList.toggle('active', btnVal === val);
    });
  }

  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'get-settings' }, (settings) => {
      if (chrome.runtime.lastError) return;
      currentDomains = settings.blockedDomains || [];
      durationInput.value = settings.unlockDurationMinutes || 15;
      renderDomains();
      updatePresetButtons();
    });
    chrome.runtime.sendMessage({ type: 'password-status' }, (response) => {
      if (chrome.runtime.lastError) return;
      passwordIsSet = response && response.isSet;
      updateBadge();
      if (!passwordIsSet) {
        showSetupModal();
      }
    });
  }

  function showSetupModal() {
    setupModal.classList.add('active');
    setupPasswordInput.value = '';
    setupConfirmInput.value = '';
    setupPasswordInput.focus();
  }

  function hideSetupModal() {
    setupModal.classList.remove('active');
  }

  function showAuthModal(callback) {
    authModal.classList.add('active');
    authPasswordInput.value = '';
    authPasswordInput.focus();
    pendingAction = callback;
  }

  function hideAuthModal() {
    authModal.classList.remove('active');
    authPasswordInput.value = '';
    pendingAction = null;
  }

  setupConfirmBtn.addEventListener('click', () => {
    const password = setupPasswordInput.value;
    const confirm = setupConfirmInput.value;

    if (!password || password.length < 4) {
      showStatus('Password must be at least 4 characters', true);
      return;
    }
    if (password !== confirm) {
      showStatus('Passwords do not match', true);
      return;
    }

    chrome.runtime.sendMessage(
      { type: 'set-initial-password', password: password },
      (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Extension error', true);
          return;
        }
        if (response && response.success) {
          passwordIsSet = true;
          updateBadge();
          hideSetupModal();
          showStatus('Password set successfully', false);
        } else {
          showStatus(response?.error || 'Failed', true);
        }
      }
    );
  });

  setupPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setupConfirmInput.focus();
  });

  setupConfirmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setupConfirmBtn.click();
  });

  authConfirmBtn.addEventListener('click', () => {
    const password = authPasswordInput.value;
    if (!password) return;
    if (typeof pendingAction === 'function') {
      pendingAction(password);
    }
    hideAuthModal();
  });

  authCancelBtn.addEventListener('click', hideAuthModal);

  authPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      authConfirmBtn.click();
    }
  });

  addDomainBtn.addEventListener('click', () => {
    const domain = newDomainInput.value.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!domain) return;
    if (currentDomains.includes(domain)) {
      showStatus('Domain already in blocklist', true);
      return;
    }
    currentDomains.push(domain);
    newDomainInput.value = '';
    renderDomains();
  });

  newDomainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDomainBtn.click();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      durationInput.value = btn.dataset.value;
      updatePresetButtons();
    });
  });

  durationInput.addEventListener('input', updatePresetButtons);

  saveBtn.addEventListener('click', () => {
    if (!passwordIsSet) {
      showStatus('Set a password first', true);
      showSetupModal();
      return;
    }
    showAuthModal(async (currentPassword) => {
      const updates = {
        currentPassword: currentPassword,
        blockedDomains: currentDomains,
        unlockDurationMinutes: parseInt(durationInput.value) || 15
      };

      const newPass = newPasswordInput.value;
      const confirmPass = confirmPasswordInput.value;

      if (newPass) {
        if (newPass !== confirmPass) {
          showStatus('Passwords do not match', true);
          return;
        }
        updates.newPassword = newPass;
      }

      chrome.runtime.sendMessage({ type: 'save-settings', ...updates }, (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Extension error', true);
          return;
        }
        if (response && response.success) {
          showStatus('Settings saved successfully', false);
          newPasswordInput.value = '';
          confirmPasswordInput.value = '';
        } else {
          showStatus(response?.error || 'Wrong password', true);
        }
      });
    });
  });

  loadSettings();
})();
