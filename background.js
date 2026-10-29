// Tracks how long each tab has had your attention. No content is read; only title, URL and timing.
const MAX_SPAN_MS = 10 * 60 * 1000; // cap a single focus span (you may have walked away)

async function load() {
  const s = await chrome.storage.local.get(["tabs", "active", "pending"]);
  return { tabs: s.tabs || {}, active: s.active || null, pending: s.pending || null };
}

function trackable(url) {
  return url && /^https?:/.test(url);
}

async function closeSpan(state, now) {
  const a = state.active;
  if (!a) return;
  const t = state.tabs[a.tabId];
  if (t) {
    const span = Math.min(now - a.since, MAX_SPAN_MS);
    t.focusMs += span;
    t.lastActive = now;
    if (state.pending && state.pending.tabId === a.tabId) {
      state.pending.focusSinceReturn = (state.pending.focusSinceReturn || 0) + span;
    }
  }
  state.active = null;
}

async function startSpan(tabId) {
  const now = Date.now();
  const state = await load();
  await closeSpan(state, now);
  if (tabId != null) {
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch { tab = null; }
    if (tab && trackable(tab.url)) {
      const t = state.tabs[tabId] || { focusMs: 0, firstSeen: now };
      Object.assign(t, { url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl || "", windowId: tab.windowId, lastActive: now });
      state.tabs[tabId] = t;
      state.active = { tabId, since: now };
    }
  }
  await chrome.storage.local.set(state);
}

async function applyOpenMode() {
  const { openMode = "popup" } = await chrome.storage.local.get("openMode");
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: openMode === "sidePanel" });
  } catch (error) {
    console.error("Could not apply the extension open mode:", error);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.openMode) applyOpenMode();
});

chrome.tabs.onActivated.addListener(({ tabId }) => startSpan(tabId));

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return startSpan(null);
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  startSpan(tab ? tab.id : null);
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!info.title && !info.url && !info.favIconUrl) return;
  const state = await load();
  const t = state.tabs[tabId];
  if (t && trackable(tab.url)) {
    Object.assign(t, { url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl || t.favIconUrl });
    await chrome.storage.local.set({ tabs: state.tabs });
  } else if (tab.active) {
    startSpan(tabId);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await load();
  if (state.active && state.active.tabId === tabId) await closeSpan(state, Date.now());
  delete state.tabs[tabId];
  const { groups = [] } = await chrome.storage.local.get("groups");
  for (const group of groups) group.tabIds = group.tabIds.filter((id) => id !== tabId);
  state.groups = groups.filter((group) => group.tabIds.length > 0);
  await chrome.storage.local.set(state);
});

chrome.runtime.onStartup.addListener(() => {
  applyOpenMode();
  chrome.storage.local.set({ tabs: {}, active: null, groups: [] });
});

chrome.runtime.onInstalled.addListener(async () => {
  await applyOpenMode();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) startSpan(tab.id);
});
