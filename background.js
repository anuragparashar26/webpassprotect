const DEFAULTS = {
  blockedDomains: [],
  passwordHash: null,
  passwordSalt: null,
  unlockDurationMinutes: 15,
  settingsPassword: null
};

async function getSettings() {
  const data = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...data };
}

function domainMatchesBlocked(domain, blockedDomains) {
  const d = domain.toLowerCase();
  for (const blocked of blockedDomains) {
    const b = blocked.toLowerCase();
    if (d === b || d.endsWith('.' + b)) {
      return true;
    }
  }
  return false;
}

async function getTemporarilyUnlocked() {
  const data = await chrome.storage.local.get('temporarilyUnlocked');
  return data.temporarilyUnlocked || {};
}

async function getActiveUnlocks() {
  const data = await chrome.storage.local.get('activeUnlocks');
  return data.activeUnlocks || {};
}

async function cleanupExpiredUnlocks() {
  const data = await chrome.storage.local.get('temporarilyUnlocked');
  const unlocked = data.temporarilyUnlocked || {};
  const now = Date.now();
  let changed = false;
  for (const [domain, expiry] of Object.entries(unlocked)) {
    if (now >= expiry) {
      delete unlocked[domain];
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ temporarilyUnlocked: unlocked });
  }
}

function getRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

async function isDomainBlocked(domain) {
  const settings = await getSettings();
  if (!domainMatchesBlocked(domain, settings.blockedDomains)) return false;

  const root = getRootDomain(domain);

  const active = await getActiveUnlocks();
  if (active[root]) return false;

  const unlocked = await getTemporarilyUnlocked();
  const expiry = unlocked[root];
  if (expiry && Date.now() < expiry) return false;

  return true;
}

async function startTimersForDomain(rootDomain) {
  const settings = await getSettings();
  const data = await chrome.storage.local.get(['temporarilyUnlocked', 'activeUnlocks']);
  const unlocked = data.temporarilyUnlocked || {};
  const active = data.activeUnlocks || {};

  if (active[rootDomain]) {
    delete active[rootDomain];
    unlocked[rootDomain] = Date.now() + (settings.unlockDurationMinutes * 60 * 1000);
    await chrome.storage.local.set({ temporarilyUnlocked: unlocked, activeUnlocks: active });
  }
}

async function handleNavigation(details) {
  if (details.frameId !== 0) return;
  const url = new URL(details.url);
  const hostname = url.hostname;
  const root = getRootDomain(hostname);

  if (await isDomainBlocked(hostname)) {
    const lockedUrl = chrome.runtime.getURL('blocked.html') + '?domain=' + encodeURIComponent(hostname);
    chrome.tabs.update(details.tabId, { url: lockedUrl });
    return;
  }

  const active = await getActiveUnlocks();
  if (active[root]) {
    const tabs = await chrome.tabs.query({});
    let domainStillOpen = false;
    for (const tab of tabs) {
      try {
        const tabUrl = new URL(tab.url);
        if (getRootDomain(tabUrl.hostname) === root) {
          domainStillOpen = true;
          break;
        }
      } catch (e) {}
    }
    if (!domainStillOpen) {
      await startTimersForDomain(root);
    }
  }
}

chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation);

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const active = await getActiveUnlocks();
  const activeDomains = Object.keys(active);
  if (activeDomains.length === 0) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return;
    const root = getRootDomain(new URL(tab.url).hostname);
    if (!active[root]) return;

    const tabs = await chrome.tabs.query({});
    let domainStillOpen = false;
    for (const t of tabs) {
      try {
        if (t.id === tabId) continue;
        const tabUrl = new URL(t.url);
        if (getRootDomain(tabUrl.hostname) === root) {
          domainStillOpen = true;
          break;
        }
      } catch (e) {}
    }
    if (!domainStillOpen) {
      await startTimersForDomain(root);
    }
  } catch (e) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'check-domain') {
    isDomainBlocked(msg.domain).then(blocked => {
      sendResponse({ blocked });
    });
    return true;
  }

  if (msg.type === 'unlock-domain') {
    handleUnlock(msg, sendResponse);
    return true;
  }

  if (msg.type === 'get-settings') {
    getSettings().then(settings => {
      sendResponse(settings);
    });
    return true;
  }

  if (msg.type === 'save-settings') {
    handleSaveSettings(msg, sendResponse);
    return true;
  }

  if (msg.type === 'verify-password') {
    verifyPassword(msg.password).then(ok => {
      sendResponse({ valid: ok });
    });
    return true;
  }

  if (msg.type === 'password-status') {
    getSettings().then(settings => {
      sendResponse({ isSet: !!settings.passwordHash });
    });
    return true;
  }

  if (msg.type === 'set-initial-password') {
    handleSetInitialPassword(msg, sendResponse);
    return true;
  }

  if (msg.type === 'get-unlock-status') {
    getUnlockStatus().then(status => {
      sendResponse(status);
    });
    return true;
  }

  if (msg.type === 'lock-all') {
    handleLockAll(sendResponse);
    return true;
  }
});

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 600000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return new Uint8Array(derivedBits);
}

function buffersEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function verifyPassword(password) {
  const settings = await getSettings();
  if (!settings.passwordHash || !settings.passwordSalt) return false;
  const salt = new Uint8Array(settings.passwordSalt);
  const hash = await hashPassword(password, salt);
  const storedHash = new Uint8Array(settings.passwordHash);
  return buffersEqual(hash, storedHash);
}

async function handleUnlock(msg, sendResponse) {
  const valid = await verifyPassword(msg.password);
  if (valid) {
    const root = getRootDomain(msg.domain);
    const data = await chrome.storage.local.get(['temporarilyUnlocked', 'activeUnlocks']);
    const unlocked = data.temporarilyUnlocked || {};
    const active = data.activeUnlocks || {};

    delete unlocked[root];
    active[root] = Date.now();

    await chrome.storage.local.set({ temporarilyUnlocked: unlocked, activeUnlocks: active });

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        const tabUrl = new URL(tab.url);
        if (getRootDomain(tabUrl.hostname) === root) {
          chrome.tabs.reload(tab.id);
        }
      } catch (e) {}
    }

    sendResponse({ success: true });
  } else {
    sendResponse({ success: false });
  }
}

async function handleSaveSettings(msg, sendResponse) {
  const settings = await getSettings();
  if (settings.passwordHash) {
    const valid = await verifyPassword(msg.currentPassword);
    if (!valid) {
      sendResponse({ success: false, error: 'Wrong password' });
      return;
    }
  }

  const newSettings = {};

  if (msg.blockedDomains !== undefined) {
    newSettings.blockedDomains = msg.blockedDomains;
  }
  if (msg.unlockDurationMinutes !== undefined) {
    newSettings.unlockDurationMinutes = msg.unlockDurationMinutes;
  }

  if (msg.newPassword) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const hash = await hashPassword(msg.newPassword, salt);
    newSettings.passwordHash = Array.from(hash);
    newSettings.passwordSalt = Array.from(salt);
  }

  await chrome.storage.local.set(newSettings);
  sendResponse({ success: true });
}

async function getUnlockStatus() {
  const settings = await getSettings();
  if (settings.blockedDomains.length === 0) return { anyUnlocked: false };

  const active = await getActiveUnlocks();
  const unlocked = await getTemporarilyUnlocked();
  const now = Date.now();

  for (const domain of settings.blockedDomains) {
    const root = getRootDomain(domain);
    if (active[root] || (unlocked[root] && now < unlocked[root])) {
      return { anyUnlocked: true };
    }
  }
  return { anyUnlocked: false };
}

async function handleLockAll(sendResponse) {
  const settings = await getSettings();
  await chrome.storage.local.set({ activeUnlocks: {}, temporarilyUnlocked: {} });

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const url = new URL(tab.url);
      if (domainMatchesBlocked(url.hostname, settings.blockedDomains)) {
        const lockedUrl = chrome.runtime.getURL('blocked.html') + '?domain=' + encodeURIComponent(url.hostname);
        chrome.tabs.update(tab.id, { url: lockedUrl });
      }
    } catch (e) {}
  }

  sendResponse({ success: true });
}

async function handleSetInitialPassword(msg, sendResponse) {
  const settings = await getSettings();
  if (settings.passwordHash) {
    sendResponse({ success: false, error: 'Password already set' });
    return;
  }
  if (!msg.password || msg.password.length < 4) {
    sendResponse({ success: false, error: 'Password must be at least 4 characters' });
    return;
  }
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const hash = await hashPassword(msg.password, salt);
  await chrome.storage.local.set({
    passwordHash: Array.from(hash),
    passwordSalt: Array.from(salt)
  });
  sendResponse({ success: true });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const existing = await getSettings();
    if (!existing.passwordHash) {
      await chrome.storage.local.set({
        blockedDomains: [],
        unlockDurationMinutes: 15,
        temporarilyUnlocked: {},
        activeUnlocks: {}
      });
    }
  }
  await cleanupExpiredUnlocks();
});

setInterval(cleanupExpiredUnlocks, 60000);
