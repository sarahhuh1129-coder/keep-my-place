// "Unfinished" = you gave it real attention, then haven't been back for a while.
const MIN_FOCUS_MS = 60 * 1000;
const AWAY_MS = 5 * 1000;
const CHECK_AFTER_MS = 60 * 1000; // ask about progress only after a minute back on the task
const openedAt = Date.now();
const GROUP_COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan"];

const $ = (id) => document.getElementById(id);
const ago = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`; };

async function get() {
  const s = await chrome.storage.local.get(["tabs", "active", "pending", "events", "ignored", "done", "pinned", "groups"]);
  return { tabs: s.tabs || {}, active: s.active, pending: s.pending, events: s.events || [], ignored: s.ignored || {}, done: s.done || {}, pinned: s.pinned || {}, groups: s.groups || [] };
}
async function log(type, data) {
  const { events } = await get();
  events.push({ type, at: Date.now(), ...data });
  await chrome.storage.local.set({ events });
}
const key = (t) => t.url.split("#")[0];

function makeGroup(tabIds) {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "New group",
    color: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)],
    tabIds
  };
}

async function moveTabToGroup(tabId, groupId) {
  const { groups } = await get();
  const destination = groups.find((group) => group.id === groupId);
  if (!destination || destination.tabIds.includes(tabId)) return;
  for (const group of groups) group.tabIds = group.tabIds.filter((id) => id !== tabId);
  destination.tabIds.push(tabId);
  await chrome.storage.local.set({ groups: groups.filter((group) => group.tabIds.length > 0) });
  render();
}

async function groupTabs(sourceId, targetId) {
  if (sourceId === targetId) return;
  const { groups } = await get();
  const sourceGroup = groups.find((group) => group.tabIds.includes(sourceId));
  const targetGroup = groups.find((group) => group.tabIds.includes(targetId));
  if (sourceGroup && sourceGroup === targetGroup) return;

  if (targetGroup) {
    for (const group of groups) group.tabIds = group.tabIds.filter((id) => id !== sourceId);
    targetGroup.tabIds.push(sourceId);
    await chrome.storage.local.set({ groups: groups.filter((group) => group.tabIds.length > 0) });
  } else {
    for (const group of groups) group.tabIds = group.tabIds.filter((id) => id !== sourceId && id !== targetId);
    const remaining = groups.filter((group) => group.tabIds.length > 0);
    remaining.push(makeGroup([targetId, sourceId]));
    await chrome.storage.local.set({ groups: remaining });
  }
  render();
}

function enableDropTarget(element, onDrop) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("drop-target");
  });
  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove("drop-target");
  });
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove("drop-target");
    const sourceId = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(sourceId)) onDrop(sourceId);
  });
}

async function render() {
  const s = await get();
  const now = Date.now();
  const live = new Set((await chrome.tabs.query({})).map((t) => t.id));

  // Progress check
  const p = s.pending;
  let pFocus = p ? p.focusSinceReturn || 0 : 0;
  if (p && s.active && s.active.tabId === p.tabId) pFocus += now - s.active.since;
  const check = $("check");
  if (p && pFocus >= CHECK_AFTER_MS) {
    check.hidden = false;
    check.innerHTML = `<p>You went back to <b></b>. Did you make progress?</p><div class="actions"><button class="primary" data-a="yes">Yes</button><button data-a="no">Not yet</button><button class="link" data-a="skip">Skip</button></div>`;
    check.querySelector("b").textContent = p.title;
    check.querySelectorAll("button").forEach((b) => b.onclick = async () => {
      await log("progress", { answer: b.dataset.a, url: p.url, title: p.title, recoverMs: p.recoverMs });
      await chrome.storage.local.set({ pending: null });
      render();
    });
  } else check.hidden = true;

  const pin = (t) => s.pinned[key(t)];
  const items = Object.entries(s.tabs)
    .map(([id, t]) => ({ id: Number(id), ...t }))
    .filter((t) => live.has(t.id) && (pin(t) || (t.focusMs >= MIN_FOCUS_MS && now - t.lastActive >= AWAY_MS)))
    .filter((t) => !s.ignored[key(t)] && !(s.done[key(t)] && s.done[key(t)] > t.lastActive && s.done[key(t)] >= (pin(t) || 0)))
    .filter((t) => !(s.active && s.active.tabId === t.id))
    .sort((a, b) => b.focusMs - a.focusMs);

  const list = $("list");
  list.innerHTML = "";
  $("empty").hidden = items.length > 0;

  const groupForTab = new Map();
  s.groups.forEach((group) => group.tabIds.forEach((id) => groupForTab.set(id, group)));
  const createTabCard = (t, i) => {
    const li = document.createElement("li");
    li.className = "tab-card";
    li.draggable = true;
    li.dataset.tabId = t.id;
    li.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(t.id));
      event.dataTransfer.effectAllowed = "move";
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    enableDropTarget(li, (sourceId) => groupTabs(sourceId, t.id));
    li.innerHTML = `<div class="row"><img alt=""><span class="title"></span></div>
      <div class="meta">${pin(t) ? "Added by you · " : ""}Worked on for ${ago(t.focusMs)} · left ${ago(now - t.lastActive)} ago</div>
      <div class="actions"><button class="primary" data-a="go">Return</button><button data-a="done">Finished</button><button data-a="no">Not a task</button></div>`;
    li.querySelector("img").src = t.favIconUrl || "icon.png";
    li.querySelector(".title").textContent = t.title;
    li.querySelector(".title").title = t.url;
    li.querySelectorAll("button").forEach((b) => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === "go") {
        const recoverMs = Date.now() - openedAt;
        b.disabled = true;
        b.textContent = "Returning…";
        try {
          const target = await chrome.tabs.get(t.id);
          await log("return", { url: t.url, title: t.title, recoverMs, rank: i + 1, listSize: items.length });
          await chrome.storage.local.set({ pending: { tabId: target.id, url: t.url, title: t.title, recoverMs, focusSinceReturn: 0 } });
          const activateTab = chrome.tabs.update(target.id, { active: true });
          const focusWindow = chrome.windows.update(target.windowId, { focused: true });
          await Promise.all([activateTab, focusWindow]);
          window.close();
        } catch (error) {
          console.error("Could not return to the selected tab:", error);
          b.disabled = false;
          b.textContent = "Return";
          li.querySelector(".meta").textContent = `Couldn't open this tab: ${error.message || error}`;
        }
      } else if (a === "done") {
        li.innerHTML = `<div class="row"><img alt=""><span class="title"></span></div><p class="celebrate">Great job! Let's close the tab!</p><p class="meta">Closing&hellip;</p>`;
        li.querySelector("img").src = t.favIconUrl || "icon.png";
        li.querySelector(".title").textContent = t.title;
        await log("finished", { url: t.url });
        setTimeout(async () => {
          const { done } = await get(); done[key(t)] = Date.now();
          await chrome.storage.local.set({ done });
          try { await chrome.tabs.remove(t.id); } catch (e) { /* tab already closed */ }
          render();
        }, 2000);
      } else {

        const { ignored } = await get(); ignored[key(t)] = true;
        const { groups } = await get();
        for (const group of groups) group.tabIds = group.tabIds.filter((id) => id !== t.id);
        await chrome.storage.local.set({ ignored, groups }); await log("unwanted", { url: t.url }); render();
      }
    });
    return li;
  };

  s.groups.forEach((group) => {
    const members = items.filter((t) => group.tabIds.includes(t.id));
    if (!members.length) return;
    const container = document.createElement("li");
    container.className = `tab-group group-${GROUP_COLORS.includes(group.color) ? group.color : "blue"}`;
    container.dataset.groupId = group.id;
    const heading = document.createElement("div");
    heading.className = "group-heading";
    const name = document.createElement("input");
    name.className = "group-name";
    name.setAttribute("aria-label", "Group name");
    name.value = group.name || "New group";
    name.maxLength = 32;
    name.addEventListener("change", async () => {
      const { groups } = await get();
      const current = groups.find((entry) => entry.id === group.id);
      if (current) {
        current.name = name.value.trim() || "New group";
        await chrome.storage.local.set({ groups });
        name.value = current.name;
      }
    });
    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${members.length}`;
    const ungroup = document.createElement("button");
    ungroup.className = "ungroup";
    ungroup.textContent = "Ungroup";
    ungroup.addEventListener("click", async () => {
      const { groups } = await get();
      await chrome.storage.local.set({ groups: groups.filter((entry) => entry.id !== group.id) });
      render();
    });
    heading.append(name, count, ungroup);
    const groupList = document.createElement("ul");
    groupList.className = "group-list";
    members.forEach((t) => groupList.appendChild(createTabCard(t, items.indexOf(t))));
    container.append(heading, groupList);
    enableDropTarget(container, (sourceId) => moveTabToGroup(sourceId, group.id));
    list.appendChild(container);
  });

  items.forEach((t, i) => {
    if (!groupForTab.has(t.id)) list.appendChild(createTabCard(t, i));
  });

}

$("export").onclick = async () => {
  const { events } = await get();
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `keep-my-place-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};

async function addTabs(chromeTabs) {
  const s = await get();
  const now = Date.now();
  for (const tab of chromeTabs) {
    if (!tab.url || !/^https?:/.test(tab.url)) continue;
    const t = s.tabs[tab.id] || { focusMs: 0, firstSeen: now, lastActive: now };
    Object.assign(t, { url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl || "", windowId: tab.windowId });
    s.tabs[tab.id] = t;
    s.pinned[key(t)] = now;
    await log("added", { url: tab.url, title: t.title });
  }
  await chrome.storage.local.set({ tabs: s.tabs, pinned: s.pinned });
  render();
}

$("addCur").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) { $("addCur").textContent = "Can't add this page"; return; }
  await addTabs([tab]);
  $("addCur").textContent = "Added ✓ — shows when you switch away";
};

render();
