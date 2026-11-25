const tabsList = document.getElementById("tabsList");
const tabCount = document.getElementById("tabCount");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");

const sessionsList = document.getElementById("sessionsList");

const sessionCount = document.getElementById("sessionCount");

const emptyTabs = document.getElementById("emptyTabs");
const emptySessions = document.getElementById("emptySessions");

const saveSessionBtn = document.getElementById("saveSessionBtn");
const removeDuplicatesBtn = document.getElementById("removeDuplicatesBtn");
const refreshBtn = document.getElementById("refreshBtn");

const toast = document.getElementById("toast");

let currentTabs = [];
let savedSessions = [];


function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function getHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return "Browser page";
    }
}

async function loadTabs() {
    try{
        currentTabs = await chrome.tabs.query({
            currentWindow: true
        });

        tabCount.textContent = currentTabs.length;

        renderTabs();
    } catch (error) {
        tabsList.innerHTML = '<div class="loading">Unable to load tabs.</div>';
        console.error(error);
    }
}

function renderTabs() {
    const searchTerm = searchInput.value.trim().toLowerCase();

    const filteredTabs = currentTabs.filter(tab => {
        const title = (tab.title || "").toLowerCase();
        const url = (tab.url || "").toLowerCase();

        return title.includes(searchTerm) || url.includes(searchTerm);
    });

    tabsList.innerHTML = "";

    emptyTabs.classList.toggle("hidden", filteredTabs.length !== 0);

    filteredTabs.forEach(tab => {
        const item = document.createElement("div");
        item.className = "tab-item";

        const favicon = tab.favIconUrl
          ? `<img src="${escapeHTML(tab.favIconUrl)}" alt="" onerror="this.parentElement.textContent='T'">`
          : "T";

          item.innerHTML = `
            <div class="tab-favicon">${favicon}</div>
            
            <div class="tab-info">
              <span class="tab-title">${escapeHTML(tab.title || "Untitled tab")}</span>
              <span class="tab-url">${escapeHTML(getHostname(tab.url))}</span>
            </div>
            
            <button
              class="close-tab"
              data-action="close"
              data-id="${tab.id}"
              title="Close tab"
              aria-label="Close tab"
            >*</button>
            `;

            item.querySelector(".tab-info").addEventListener("click", async () => {
                await chrome.tabs.update(tab.id, { active: true });
                await chrome.windows.update(tab.windowId, { focused: true });
            });

            tabsList.appendChild(item);
    });
}


tabsList.addEventListener("click", async event => {
    const button = event.target.closest('[data-action="close"]');

    if (!button) return;

    const id = Number(button.dataset.id);

    try {
        await chrome.tabs.remove(id);
        await loadTabs();
        showToast("Tab closed");
    } catch (error) {
        showToast("could not close this tab.");
        console.error(error);
    }
});


searchInput.addEventListener("input", () => {
    clearSearch.style.display = searchInput.value ? "block" : "none";
    renderTabs();
});

clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    clearSearch.style.display = "none";
    renderTabs();
    searchInput.focus();
});

saveSessionBtn.addEventListener("click", async () => {
    try {
        const tabs = await chrome.tabs.query({
            currentWindow: true
        });

        const validTabs = tabs
         .filter(tab => tab.url && /^https?:\/\//i.test(tab.url))
         .map(tab => ({
            title: tab.title || "Untitled tab",
            url: tab.url
         }));

         if (validTabs.length === 0) {
            showToast("No tabs available to save.");
            return;
         }

         const name = `Session ${new Date().toLocaleString()}`;

         const session = {
            id: crypto.randomUUID(),
            name,
            createdAt: Date.now(),
            tabs: validTabs
         };

         savedSessions.unshift(session);

         await chrome.storage.local.set({
            savedSessions
         });

         renderSessions();

         showToast("Browsing session saved.")
    } catch (error){
        showToast("could not save session.");
    }
});

async function loadSessions() {
    try{
        const result = await chrome.storage.local.get("savedSessions");

        savedSessions = Array.isArray(result.savedSessions)
         ? result.savedSessions
         : [];

        renderSessions();
    } catch (error) {
        console.error("Could not load sessions:", error);
    }
}


function renderSessions() {
    sessionsList.innerHTML = "";

    sessionCount.textContent = 
      `${savedSessions.length} saved`;

    emptySessions.classList.toggle(
        "hidden",
        savedSessions.length !==0
    );

    savedSessions.forEach(session => {
        const item = document.createElement("div");
        item.className = "session-item";

        const date = new Date(session.createdAt).toLocaleDateString();

        item.innerHTML = `
          <div class="session-icon"></div>
          
          <div class="session-info">
            <span class="session-name">${escapeHTML(session.name)}</span>
            <span class="session-details">
              ${session.tabs.length} tabs . ${escapeHTML(date)}
            </span>
          </div>
          
          
          <div class="session-actions">
           <button data-action="restore" data-id="${escapeHTML(session.id)}">
             Restore
           </button>
           
           <button
             class="delete-session"
             data-action="delete"
             data-id="${escapeHTML(session.id)}"
             title="Delete session"
           >*</button>
          </div>
        `;

        sessionsList.appendChild(item);
    });
}

sessionsList.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");

  if (!session) return;

if (button.dataset.action === "restore") {
    let restoredCount = 0;
    let failedCount = 0;

    for (let i = 0; i < session.tabs.length; i++) {
        const tab = session.tabs[i];

        try {
            await chrome.tabs.create({
                url: tab.url,
                active: restoredCount === 0
            });

            restoredCount++;

        } catch (error) {
            failedCount++;
            console.error("Could not restore:", tab.url, error);
        }
    }

    showToast(`${restoredCount} of ${session.tabs.length} tabs restored.`);
}

if (button.dataset.action === "delete") {
    const confirmed = confirm(
        `Delete "${session.name}"?`
    );

    if (!confirmed) return;

    savedSessions = savedSessions.filter(
        item => item.id !== session.id
    );

    await chrome.storage.local.set({
        savedSessions
    });

    renderSessions();
    showToast("Session deleted.");
}
});

removeDuplicatesBtn.addEventListener("click", async () => {
    try {
        const tabs = await chrome.tabs.query({
            currentWindow: true
        });

        const seenUrls = new Set();
        const duplicateIds = [];

        tabs.forEach(tab => {
            if (!tab.url) return;

            let normalizedUrl = tab.url;

try {
    const parsedUrl = new URL(tab.url);

    parsedUrl.hash = "";

    if (parsedUrl.pathname !== "/") {
       parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "");
    }

    normalizedUrl = parsedUrl.href;
} catch {

}

            if (seenUrls.has(normalizedUrl)) {
                duplicateIds.push(tab.id);
            } else {
                seenUrls.add(normalizedUrl);
            }
        });

        if (duplicateIds.length === 0) {
            showToast("No duplicate tabs found.");
            return;
        }

        const confirmed = confirm(
            `Close ${duplicateIds.length} duplicate tab(s)?`
        );

        if (!confirmed) return;

        await chrome.tabs.remove(duplicateIds);

        await loadTabs();

        showToast(`${duplicateIds.length} duplicate tabs removed.`);
    } catch (error) {
        showToast("could not remove duplicates.");
        console.error(error);
    }
});

refreshBtn.addEventListener("click", loadTabs);

chrome.tabs.onCreated.addListener(loadTabs);
chrome.tabs.onRemoved.addListener(loadTabs);
chrome.tabs.onUpdated.addListener(loadTabs);

async function initialise() {
    await loadTabs();
    await loadSessions();
}

initialise();