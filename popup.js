// Centralized state management
const appState = {
    org: { accessToken: '', instanceUrl: '', userId: '', userName: '', orgName: '' },
    objects: [], 
    flows: [],
    recentFlows: [],
    selectedFlow: null,
    fields: [],
    selectedFields: new Set(),
    objectManager: {
        selectedObject: null,
        activeSection: 'Details',
        items: [],
        cache: {}
    },
    favorites: {
        objects: new Set()
    },
    recordPage: {
        tabId: null,
        context: null,
        fieldMetadata: null
    },
    scanId: 0,
    flowsLoaded: false,
    flowsLoadPromise: null,
    recentFlowsLoaded: false,
    recentFlowsLoadPromise: null
};
let lastFieldFinderObject = null;
let orgLimitsData = null;
const OBJECT_FAVORITES_STORAGE_KEY = 'sfMetadataNavObjectFavorites';


// Centralized DOM references (call after DOM loaded)
function initDomRefs() {
    const refs = {};
    ['userBadge', 'userNameDisplay', 'orgNameDisplay', 'btnRefresh', 
    'objInput', 'objectList', 'fieldActions', 'fieldSearchInput',
        'recordApiActions', 'btnShowRecordApi', 'showAllRecordData'].forEach(id => {
        refs[id] = document.getElementById(id);
    });
    ['orgMetaOrgId', 'orgMetaInstance'].forEach(id => {
        refs[id] = document.getElementById(id);
    });
    return refs;
}



function showStatus(message, type = 'info') {
  const el = document.getElementById('emptyState');
  if (!el) return;
    if (!message) {
        el.textContent = '';
        el.style.display = 'none';
        return;
    }
  el.textContent = message;
  el.style.display = 'block';
  el.style.color = type === 'error' ? '#d32f2f'
                 : type === 'warn'  ? '#e65100'
                 : type === 'success' ? '#2e844a'
                 : '#0176d3';
}
window.showStatus = showStatus;

const typeaheadControllers = new Map();
const restoreController = {
    nextToken: 0,
    activeToken: 0,
    listenersBound: false
};

function markRestoredTypeaheadValue(input) {
    if (!input) return;
    input.dataset.restoredTypeaheadValue = 'true';
}

function clearRestoredTypeaheadValue(input) {
    if (!input) return;
    delete input.dataset.restoredTypeaheadValue;
}

function hideAllTypeaheads() {
    typeaheadControllers.forEach(controller => controller.hide());
}

function beginPendingRestore() {
    const token = ++restoreController.nextToken;
    restoreController.activeToken = token;
    return token;
}

function cancelPendingRestore() {
    restoreController.activeToken = 0;
}

function isRestoreActive(token) {
    return token !== 0 && restoreController.activeToken === token;
}

function bindRestoreInterruptionListeners() {
    if (restoreController.listenersBound) return;

    const interruptRestore = (event) => {
        if (!event.isTrusted) return;
        if (!restoreController.activeToken) return;
        cancelPendingRestore();
    };

    ['pointerdown', 'keydown', 'input'].forEach(eventName => {
        document.addEventListener(eventName, interruptRestore, true);
    });

    restoreController.listenersBound = true;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function ensureTypeaheadHost(input) {
    if (!input) return null;

    const existingHost = input.closest('.typeahead-anchor');
    if (existingHost) return existingHost;

    if (input.parentElement && input.parentElement.classList.contains('input-wrapper')) {
        input.parentElement.classList.add('typeahead-anchor');
        return input.parentElement;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'typeahead-anchor';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    return wrapper;
}

function setupInlineTypeahead(inputId, options = {}) {
    if (typeaheadControllers.has(inputId)) return typeaheadControllers.get(inputId);

    const input = document.getElementById(inputId);
    if (!input) return null;

    input.removeAttribute('list');

    const host = ensureTypeaheadHost(input);
    if (!host) return null;

    const panel = document.createElement('div');
    panel.className = 'typeahead-panel';
    host.appendChild(panel);

    let items = [];
    let activeIndex = -1;
    let suppressRefresh = false;

    const getItemValue = options.getItemValue || (item => item?.label || '');
    const getPrimaryText = options.getPrimaryText || (item => item?.label || '');
    const getSecondaryText = options.getSecondaryText || (() => '');

    function hide() {
        items = [];
        activeIndex = -1;
        panel.innerHTML = '';
        panel.classList.remove('visible');
    }

    function select(item) {
        suppressRefresh = true;
        input.value = getItemValue(item);
        hide();
        if (typeof options.onSelect === 'function') options.onSelect(item);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        requestAnimationFrame(() => {
            suppressRefresh = false;
        });
    }

    function render(nextItems) {
        const next = Array.isArray(nextItems) ? nextItems : [];
        const maxItems = Number.isFinite(options.maxItems) ? options.maxItems : null;
        items = maxItems != null ? next.slice(0, maxItems) : next;
        activeIndex = -1;

        if (!items.length) {
            hide();
            return;
        }

        panel.innerHTML = items.map((item, index) => {
            const primary = escapeHtml(getPrimaryText(item));
            const secondaryRaw = getSecondaryText(item);
            const secondary = secondaryRaw ? `<span class="typeahead-secondary">${escapeHtml(secondaryRaw)}</span>` : '';
            
            // Use custom render if provided
            if (typeof options.renderItem === 'function') {
                return options.renderItem(item, index);
            }
            
            return `
                <div class="typeahead-option" data-index="${index}">
                    <span class="typeahead-primary">${primary}</span>
                    ${secondary}
                </div>
            `;
        }).join('');

        panel.querySelectorAll('.typeahead-option').forEach(option => {
            const starBtn = option.querySelector('.typeahead-star');
            if (starBtn) {
                starBtn.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const index = Number(option.dataset.index);
                    const item = items[index];
                    if (item && item.name) {
                        toggleObjectFavorite(item.name);
                        render(options.getItems((input.value || '').trim()));
                    }
                });
                starBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                });
            }
            
            option.addEventListener('mousedown', (event) => {
                if (event.target.closest('.typeahead-star')) return;
                event.preventDefault();
                const index = Number(option.dataset.index);
                select(items[index]);
            });
        });

        panel.classList.add('visible');
    }

    function refreshFromSource(event) {
        if (suppressRefresh) return;
        if (typeof options.getItems !== 'function') return;

        if (event?.type === 'input') {
            clearRestoredTypeaheadValue(input);
        } else if (event?.type === 'focus' && input.dataset.restoredTypeaheadValue === 'true') {
            hide();
            return;
        }

        const term = (input.value || '').trim();
        if (term.length < (options.minChars || 0)) {
            hide();
            return;
        }
        render(options.getItems(term));
    }

    input.addEventListener('focus', refreshFromSource);
    input.addEventListener('input', refreshFromSource);
    input.addEventListener('blur', () => setTimeout(hide, 140));
    input.addEventListener('keydown', (event) => {
        if (!panel.classList.contains('visible') || !items.length) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
        } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            select(items[activeIndex]);
            return;
        } else if (event.key === 'Escape') {
            hide();
            return;
        } else {
            return;
        }

        panel.querySelectorAll('.typeahead-option').forEach((option, index) => {
            option.classList.toggle('active', index === activeIndex);
        });
    });

    const controller = {
        render,
        hide,
        refresh: refreshFromSource,
        input
    };

    typeaheadControllers.set(inputId, controller);
    return controller;
}

function filterObjects(term) {
    const query = term.trim().toLowerCase();
    const allMatches = (appState.objects || []).filter(item => {
        return item.name.toLowerCase().includes(query) || item.label.toLowerCase().includes(query);
    });

    // Sort favorites to the top
    allMatches.sort((a, b) => {
        const aIsFav = appState.favorites.objects.has(a.name);
        const bIsFav = appState.favorites.objects.has(b.name);
        if (aIsFav !== bIsFav) return bIsFav ? 1 : -1;
        return 0;
    });

    return allMatches;
}

function getFlowDisplayLabel(flow) {
    return String(
        flow?.MasterLabel ||
        flow?.Label ||
        flow?.FullName ||
        flow?.DeveloperName ||
        ''
    ).trim();
}

function toggleObjectFavorite(objectName) {
    if (!objectName) return;
    if (appState.favorites.objects.has(objectName)) {
        appState.favorites.objects.delete(objectName);
    } else {
        appState.favorites.objects.add(objectName);
    }
    renderObjectFavoritesWorkspace();
    saveObjectFavorites();
}

function isObjectFavorite(objectName) {
    return appState.favorites.objects.has(objectName);
}

function getFavoriteObjects() {
    return ObjectFavoriteRules.getAvailableFavoriteObjects(
        appState.favorites.objects,
        appState.objects
    );
}

function renderObjectFavoritesWorkspace() {
    const workspace = document.getElementById('objectFavoritesWorkspace');
    if (!workspace) return;

    const favoriteObjects = getFavoriteObjects();
    if (appState.recordPage.startupObjectName && appState.objectManager.selectedObject?.name === appState.recordPage.startupObjectName) {
        workspace.style.display = 'none';
        workspace.innerHTML = '';
        return;
    }
    if (!favoriteObjects.length) {
        if (appState.objectManager.selectedObject) {
            workspace.style.display = 'none';
            workspace.innerHTML = '';
            return;
        }
        workspace.style.display = 'flex';
        workspace.innerHTML = '<div class="object-favorites-header"><div class="object-favorites-title">Starred Objects</div><div class="object-favorites-subtitle">No starred objects yet. Search for an object and use its star to bookmark it.</div></div>';
        return;
    }

    workspace.style.display = 'flex';
    workspace.innerHTML = `
        <div class="object-favorites-header">
            <div>
                <div class="object-favorites-title">Starred Objects</div>
                <div class="object-favorites-subtitle">Click to open. Click the star to remove.</div>
            </div>
        </div>
        <div class="object-favorites-grid">
            ${favoriteObjects.map(item => `
                <div class="object-favorite-card" data-favorite-object="${escapeHtml(item.name)}">
                    <button type="button" class="object-favorite-open" data-open-favorite="${escapeHtml(item.name)}">
                        <span class="object-favorite-open-label">${escapeHtml(item.label || item.name)}</span>
                        <span class="object-favorite-open-api">${escapeHtml(item.name)}</span>
                    </button>
                    <button type="button" class="object-favorite-toggle" data-unfavorite-object="${escapeHtml(item.name)}" title="Remove from favorites">★</button>
                </div>
            `).join('')}
        </div>
    `;
}

async function loadObjectFavorites() {
    try {
        const result = await chrome.storage.local.get(OBJECT_FAVORITES_STORAGE_KEY);
        const favorites = result[OBJECT_FAVORITES_STORAGE_KEY];
        appState.favorites.objects = new Set(Array.isArray(favorites) ? favorites : []);
    } catch (err) {
        console.warn('Failed to load object favorites:', err);
    }
}

async function saveObjectFavorites() {
    try {
        await chrome.storage.local.set({
            [OBJECT_FAVORITES_STORAGE_KEY]: Array.from(appState.favorites.objects)
        });
        saveState();
    } catch (err) {
        console.warn('Failed to save object favorites:', err);
    }
}

function buildFlowDetailsUrl(flowId) {
    const setupBase = getSetupBaseUrl();
    if (!setupBase || !flowId) return '';
    return `${setupBase}/lightning/setup/Flows/page?address=${encodeURIComponent(`/${flowId}?retUrl=/lightning/setup/Flows/home`)}`;
}

function setSelectedFlow(flow) {
    const link = document.getElementById('flowDetailsLink');
    const flowId = flow?.Id || flow?.ActiveVersionId || '';

    appState.selectedFlow = flow ? {
        DeveloperName: flow.DeveloperName || '',
        MasterLabel: getFlowDisplayLabel(flow),
        ActiveVersionId: flow.ActiveVersionId || '',
        Id: flow.Id || ''
    } : null;

    if (!link) return;

    if (!flowId) {
        link.href = '#';
        link.style.display = 'none';
        return;
    }

    link.href = buildFlowDetailsUrl(flowId);
    link.title = appState.selectedFlow?.MasterLabel
        ? `Open ${appState.selectedFlow.MasterLabel} details`
        : 'Open flow details';
    link.style.display = 'inline-flex';
}

function clearSelectedFlow() {
    appState.selectedFlow = null;
    const link = document.getElementById('flowDetailsLink');
    if (!link) return;
    link.href = '#';
    link.title = 'Open flow details';
    link.style.display = 'none';
}

function filterFlows(term) {
    const tokens = String(term || '')
        .toLowerCase()
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);

    if (!tokens.length) return [];

    return (appState.flows || []).filter(item => {
        const haystack = `${String(item.DeveloperName || '')} ${getFlowDisplayLabel(item)} ${String(item.FullName || '')}`.toLowerCase();
        return tokens.every(token => haystack.includes(token));
    });
}

function initInlineTypeaheads() {
    const renderObjectItem = (item, index) => {
        const primary = escapeHtml(item.label || item.name);
        const secondary = item.name ? `<span class="typeahead-secondary">${escapeHtml(item.name)}</span>` : '';
        const isFav = isObjectFavorite(item.name);
        const starIcon = isFav ? '★' : '☆';
        const starLabel = isFav ? 'Saved' : 'Save';
        const starClassName = isFav ? 'typeahead-star filled' : 'typeahead-star';
        return `
            <div class="typeahead-option typeahead-option-object" data-index="${index}">
                <div class="typeahead-option-copy">
                    <span class="typeahead-primary">${primary}</span>
                    ${secondary}
                </div>
                <button
                    type="button"
                    class="${starClassName}"
                    title="${isFav ? 'Remove from favorites' : 'Add to favorites'}"
                    aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}"
                >
                    <span class="typeahead-star-icon">${starIcon}</span>
                    <span class="typeahead-star-label">${starLabel}</span>
                </button>
            </div>
        `;
    };

    [
        'objInput',
        'lv-object-input',
        'profileObjInput',
        'permObjInput'
    ].forEach(id => {
        setupInlineTypeahead(id, {
            minChars: 1,
            getItems: filterObjects,
            getItemValue: item => item.label || item.name,
            getPrimaryText: item => item.label || item.name,
            getSecondaryText: item => item.name || '',
            renderItem: renderObjectItem
        });
    });

    setupInlineTypeahead('vr-object', {
        minChars: 1,
        getItems: filterObjects,
        getItemValue: item => item.name || item.label || '',
        getPrimaryText: item => item.label || item.name,
        getSecondaryText: item => item.name || '',
        renderItem: renderObjectItem
    });

    setupInlineTypeahead('flowSearchInput', {
        minChars: 1,
        getItems: filterFlows,
        getItemValue: item => getFlowDisplayLabel(item) || item.DeveloperName,
        getPrimaryText: item => getFlowDisplayLabel(item) || item.DeveloperName,
        getSecondaryText: item => item.DeveloperName || '',
        onSelect: item => {
            if (!item?.DeveloperName) return;
            setSelectedFlow(item);
            fetchFlowVersions(item.DeveloperName);
            saveState();
        }
    });
}


window.onload = async () => {
    const domRefs = initDomRefs();
    if (!domRefs.userBadge) {
        showStatus('DOM not ready. Try refreshing.', 'error');
        return;
    }
    bindRestoreInterruptionListeners();
    bindRecordApiActions(domRefs);
    const restoreToken = beginPendingRestore();
    await loadObjectFavorites();
    initInlineTypeaheads();
    let sourceTab;
    try {
        [sourceTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    } catch (error) {
        console.error('Unable to identify the active tab:', error);
        showStatus(`Unable to identify the active tab: ${error.message}`, 'error');
        await restoreState(restoreToken);
        setupAutoSave();
        return;
    }
    const startupContext = RecordPageApiRules.getStartupContext(sourceTab?.url);
    await autoConnect(domRefs, sourceTab);
    await restoreState(restoreToken, { skipObjectManager: Boolean(startupContext) });
    if (startupContext && isRestoreActive(restoreToken)) {
        await applyObjectManagerStartup(startupContext, restoreToken);
    }
    if (isRestoreActive(restoreToken)) cancelPendingRestore();
    setupAutoSave();
};
window.addEventListener('beforeunload', () => {
    saveState();
});

function isSalesforceUrl(url) {
    if (typeof url !== 'string') return false;

    try {
        const hostname = new URL(url).hostname;
        return hostname.includes('salesforce.com')
            || hostname.includes('salesforce-setup.com')
            || hostname.includes('force.com')
            || hostname.includes('visualforce.com');
    } catch {
        return false;
    }
}

function getSalesforceApiOrigin(hostname) {
    const apiDomain = hostname
        .replace('.my.salesforce-setup.com', '.my.salesforce.com')
        .replace('.sandbox.my.salesforce-setup.com', '.sandbox.my.salesforce.com')
        .replace('.lightning.force.com', '.my.salesforce.com')
        .replace('.sandbox.lightning.force.com', '.sandbox.my.salesforce.com')
        .replace('.file.force.com', '.my.salesforce.com')
        .replace('.sandbox.file.force.com', '.sandbox.my.salesforce.com')
        .replace('.visualforce.com', '.my.salesforce.com')
        .replace('.sandbox.visualforce.com', '.sandbox.my.salesforce.com');

    return `https://${apiDomain}`;
}

async function hasSalesforceApiAccess(hostname) {
    return chrome.permissions.contains({
        permissions: ['cookies'],
        origins: [`${getSalesforceApiOrigin(hostname)}/*`]
    });
}

function showSalesforceAccessRequest(domRefs, tab) {
    const status = document.getElementById('emptyState');
    if (!status) return;

    status.innerHTML = '';
    status.append('Connect to this Salesforce org to use its metadata. Access is limited to this org and requested only once. ');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-primary';
    button.textContent = 'Connect';
    button.addEventListener('click', async () => {
        button.disabled = true;
        const hostname = new URL(tab.url).hostname;
        const granted = await chrome.permissions.request({
            permissions: ['cookies'],
            origins: [`${getSalesforceApiOrigin(hostname)}/*`]
        });
        if (granted) {
            const token = beginPendingRestore();
            await autoConnect(domRefs, tab);
            const context = RecordPageApiRules.getStartupContext(tab.url);
            if (context && isRestoreActive(token)) await applyObjectManagerStartup(context, token);
            if (isRestoreActive(token)) cancelPendingRestore();
        } else {
            button.disabled = false;
            showStatus('Salesforce access was not granted. Local tools remain available.', 'warn');
        }
    });
    status.appendChild(button);
}

function renderRecordApiState(state = {}) {
    const showButton = document.getElementById('btnShowRecordApi');
    if (showButton) showButton.setAttribute('aria-pressed', String(!!state.showApi));
}

async function loadRecordPageFieldMetadata() {
    if (appState.recordPage.fieldMetadata) return appState.recordPage.fieldMetadata;

    const objectApiName = appState.recordPage.context?.objectApiName;
    const recordId = appState.recordPage.context?.recordId;
    if (!objectApiName || !appState.org.instanceUrl || !appState.org.accessToken) return [];

    try {
        const headers = { Authorization: `Bearer ${appState.org.accessToken}` };
        const [describeResponse, layoutResponse] = await Promise.all([
            fetch(
                `${appState.org.instanceUrl}/services/data/v60.0/sobjects/${encodeURIComponent(objectApiName)}/describe`,
                { headers }
            ),
            recordId
                ? fetch(
                    `${appState.org.instanceUrl}/services/data/v60.0/ui-api/record-ui/${encodeURIComponent(recordId)}?layoutTypes=Full&modes=View`,
                    { headers }
                )
                : Promise.resolve(null)
        ]);

        const describe = describeResponse?.ok ? await describeResponse.json() : {};
        const layout = layoutResponse?.ok ? await layoutResponse.json() : {};
        const metadata = (describe.fields || [])
            .filter(field => field?.name && field?.label)
            .map(field => ({ apiName: field.name, label: field.label }));

        function collectLayoutFields(value, inheritedLabel = '') {
            if (Array.isArray(value)) {
                value.forEach(item => collectLayoutFields(item, inheritedLabel));
                return;
            }
            if (!value || typeof value !== 'object') return;

            const label = typeof value.label === 'string' && value.label.trim()
                ? value.label.trim()
                : inheritedLabel;
            if (value.componentType === 'Field' && value.apiName && label) {
                metadata.push({ apiName: value.apiName, label });
            }
            Object.values(value).forEach(item => collectLayoutFields(item, label));
        }

        collectLayoutFields(layout.layouts?.[objectApiName]);
        appState.recordPage.fieldMetadata = metadata;
        return appState.recordPage.fieldMetadata;
    } catch {
        return [];
    }
}

async function injectRecordApiContent(tabId) {
    await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['record-page-api.css']
    });
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['record-page-api-rules.js', 'record-page-api.js']
    });
}

async function deliverRecordApiMessage(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch {
        await injectRecordApiContent(tabId);
        return chrome.tabs.sendMessage(tabId, message);
    }
}

async function sendRecordApiMessage(type, options = {}) {
    const tabId = appState.recordPage.tabId;
    if (typeof tabId !== 'number') return null;

    try {
        const fields = type === 'record_api_get_state'
            ? []
            : await loadRecordPageFieldMetadata();
        const response = await deliverRecordApiMessage(tabId, { type, fields });
        renderRecordApiState(response);
        if (!options.silent && response?.fieldCount === 0) {
            showStatus('No field API metadata was found in the rendered record layout.', 'warn');
        }
        return response;
    } catch (error) {
        if (!options.silent) {
            showStatus('Unable to start API markers on this Salesforce page.', 'warn');
        }
        return null;
    }
}

async function configureRecordApiActions(tab, domRefs) {
    const startupContext = RecordPageApiRules.getStartupContext(tab?.url);
    const context = startupContext?.type === 'record'
        ? RecordPageApiRules.getRecordPageContext(tab.url) : null;
    appState.recordPage.tabId = typeof tab?.id === 'number' ? tab.id : null;
    appState.recordPage.context = context;
    appState.recordPage.startupObjectName = startupContext?.type === 'record' || startupContext?.type === 'list'
        ? startupContext.objectApiName : null;
    appState.recordPage.sourceUrl = context ? `${new URL(tab.url).origin}${new URL(tab.url).pathname}` : null;
    appState.recordPage.fieldMetadata = null;

    if (domRefs.recordApiActions) {
        domRefs.recordApiActions.style.display = context ? 'flex' : 'none';
    }
    renderRecordApiState();

    if (context) {
        await sendRecordApiMessage('record_api_get_state', { silent: true });
    }
}

function bindRecordApiActions(domRefs) {
    domRefs.btnShowRecordApi?.addEventListener('click', () => {
        void sendRecordApiMessage('record_api_toggle_show');
    });
    domRefs.showAllRecordData?.addEventListener('click', async event => {
        event.preventDefault();
        const context = appState.recordPage.context;
        if (!context || !appState.recordPage.sourceUrl) {
            showStatus('Open the extension from a Salesforce record page first.', 'warn');
            return;
        }
        try {
            const url = new URL(chrome.runtime.getURL('record-data.html'));
            url.searchParams.set('sourceUrl', appState.recordPage.sourceUrl);
            await openTabNextToActive(url.toString());
        } catch (error) {
            console.error('Unable to open record data:', error);
            showStatus(`Unable to open record data: ${error.message}`, 'error');
        }
    });
}

async function autoConnect(domRefs, sourceTab) {
  try {
        const tab = sourceTab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];

    if (!tab?.url) { showStatus('Open a Salesforce org tab first.', 'error'); return; }

                if (isSalesforceUrl(tab.url) && !(await hasSalesforceApiAccess(new URL(tab.url).hostname))) {
                        showSalesforceAccessRequest(domRefs, tab);
                        return;
                }

        await configureRecordApiActions(tab, domRefs);
        await initialize(domRefs, tab);
  } catch (err) {
    showStatus(`Auto-connect failed: ${err.message}`, 'error');
  }
}

async function getNewSessionToken(hostname) {
    const apiOrigin = getSalesforceApiOrigin(hostname);
    const apiDomain = new URL(apiOrigin).hostname;
    const apiUrl = `${apiOrigin}/`;
  const cookie = await chrome.cookies.get({ url: apiUrl, name: 'sid' });

  if (!cookie?.value) {
    throw new Error(`No sid cookie found on API host ${apiDomain}. Open the org on a *.my.salesforce.com page and refresh.`);
  }

  appState.org.accessToken = cookie.value;
    appState.org.instanceUrl = apiOrigin;

  console.log('Using sid from API host:', apiDomain);
}

async function initialize(domRefs, sourceTab) {
    let tab = sourceTab;
    if (!tab?.url) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = tabs && tabs[0];
    }

    const isSalesforce = isSalesforceUrl(tab?.url);

  setupFlowListeners();
  initOrgLimitsTab();
  initPermSetComparatorTab();

  if (!isSalesforce) {
    showStatus('Not on Salesforce: ' + (tab?.url || 'unknown'), 'warn');
    return;
  }

  const url = new URL(tab.url);
  console.log('Salesforce detected on:', url.hostname);

  try {
    await getNewSessionToken(url.hostname);

    if (!appState.org.accessToken || !appState.org.instanceUrl) {
      throw new Error('No Salesforce session could be established.');
    }

    domRefs.userBadge.style.display = 'flex';

    await fetchUserInfo(domRefs);

    await fetchAllObjects(domRefs);

    try {
      await fetchAllFlows();
    } catch (flowErr) {
      console.warn('Flows failed:', flowErr);
      showStatus('Connected, but flows could not be loaded.', 'warn');
    }

    if (typeof setupVRObjectSearch === 'function') {
      setupVRObjectSearch();
    }

        showStatus('', 'success');
  } catch (err) {
    console.error('Initialize failed:', err);
    domRefs.userBadge.style.display = 'none';
    showStatus('Init failed: ' + err.message, 'error');
  }
}

function getLightningBaseUrl() {
    return (appState.org.instanceUrl || '')
        .replace('.sandbox.my.salesforce.com', '.sandbox.lightning.force.com')
        .replace('.my.salesforce.com', '.lightning.force.com');
}

function getInspectorUrl(host, query) {
    const isEdge = /Edg\//.test(navigator.userAgent);
    const chromeId = "hpijlohoihegkfehhibggnkbjhoemldh";
    const edgeId = "noclfopoifgfgnflgkakofglfeeambpd";
    const protocol = isEdge ? "extension" : "chrome-extension";
    const extensionId = isEdge ? edgeId : chromeId;
    return `${protocol}://${extensionId}/data-export.html?host=${host}&query=${encodeURIComponent(query)}`;
}

async function openTabNextToActive(url, options = {}) {
    if (typeof url !== 'string' || !url) return;

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const createOptions = {
        url,
        active: options.active !== false
    };

    if (typeof activeTab?.index === 'number') {
        createOptions.index = activeTab.index + 1;
    }

    return chrome.tabs.create(createOptions);
}

async function fetchUserInfo(domRefs) {
  try {
        const [userRes, orgRes] = await Promise.all([
            fetch(`${appState.org.instanceUrl}/services/data/v60.0/chatter/users/me`, {
                headers: {
                    Authorization: `Bearer ${appState.org.accessToken}`
                }
            }),
            fetch(`${appState.org.instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent('SELECT Id, Name, InstanceName, OrganizationType FROM Organization LIMIT 1')}`, {
                headers: {
                    Authorization: `Bearer ${appState.org.accessToken}`
                }
            })
        ]);

        if (!userRes.ok) {
            throw new Error(`HTTP ${userRes.status}`);
        }

        const userData = await userRes.json();
        const orgData = orgRes.ok ? await orgRes.json() : null;
        const host = new URL(appState.org.instanceUrl).hostname.split('.')[0];
        const orgBadgeName = getOrgBadgeName(appState.org.instanceUrl) || host.toUpperCase();
        const userName = userData?.name || userData?.username || userData?.displayName || host.toUpperCase();
        const orgRecord = orgData?.records?.[0] || {};
        const orgName = orgRecord.Name || orgBadgeName;

        if (domRefs.userNameDisplay) domRefs.userNameDisplay.textContent = userName;
        if (domRefs.orgNameDisplay) domRefs.orgNameDisplay.textContent = orgBadgeName;
        setOrgMetaDisplay(domRefs, {
            orgId: orgRecord.Id,
            instance: orgRecord.InstanceName
        });

        appState.org.userName = userName;
        appState.org.orgName = orgName;
        appState.org.userId = userData?.id || userData?.Id || '';
    } catch (e) {
        const fallbackHost = new URL(appState.org.instanceUrl).hostname.split('.')[0];
        const fallbackBadgeName = getOrgBadgeName(appState.org.instanceUrl) || fallbackHost.toUpperCase();
        if (domRefs.userNameDisplay) domRefs.userNameDisplay.textContent = fallbackHost.toUpperCase();
        if (domRefs.orgNameDisplay) domRefs.orgNameDisplay.textContent = fallbackBadgeName;
        setOrgMetaDisplay(domRefs, {});
        appState.org.userName = fallbackHost.toUpperCase();
        appState.org.orgName = fallbackBadgeName;

        showStatus(`Connection failed: ${e.message}`, 'error');
        throw e;
    }
}

function getOrgBadgeName(instanceUrl) {
    try {
        const firstLabel = new URL(instanceUrl).hostname.split('.')[0] || '';
        const candidate = firstLabel.includes('--') ? firstLabel.split('--').pop() : firstLabel;
        return formatBadgeSegment(candidate);
    } catch {
        return '';
    }
}

function formatBadgeSegment(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function deriveOrgLocation(instanceName = '') {
    const value = String(instanceName || '').toUpperCase();
    if (value.startsWith('USA') || value.startsWith('NA') || value.startsWith('CS')) return 'NA';
    if (value.startsWith('EU') || value.startsWith('UK') || value.startsWith('DE') || value.startsWith('FR')) return 'EU';
    if (value.startsWith('AP') || value.startsWith('JP') || value.startsWith('IN')) return 'APAC';
    return 'NA';
}

function setOrgMetaDisplay(domRefs, meta = {}) {
    if (domRefs.orgMetaOrgId) domRefs.orgMetaOrgId.textContent = meta.orgId || '00DB000000061UK';
    if (domRefs.orgMetaInstance) domRefs.orgMetaInstance.textContent = meta.instance || 'USA794';
}

async function fetchAllQueryRecords(initialUrl) {
    const records = [];
    let nextUrl = initialUrl;

    while (nextUrl) {
        const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${appState.org.accessToken}`
      }
    });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        records.push(...(data.records || []));
        nextUrl = data.nextRecordsUrl ? `${appState.org.instanceUrl}${data.nextRecordsUrl}` : null;
  }

    return records;
}


const btnReconnect = document.getElementById('btnReconnect');
if (btnReconnect) {
  btnReconnect.onclick = async () => {
    document.getElementById('btnGlobalReset')?.click();
    btnReconnect.innerText = 'Resetting...';
        await initialize(initDomRefs());
    location.reload();
  };
}



// --- OBJECT MANAGER ---
const OBJECT_MANAGER_SECTIONS = [
    { key: 'Details', label: 'Details', route: 'Details', searchPlaceholder: 'Filter object details...', loader: loadObjectDetailsSection },
    { key: 'FieldsAndRelationships', label: 'Fields & Relationships', route: 'FieldsAndRelationships', searchPlaceholder: 'Filter fields and relationships...', loader: loadObjectFieldsSection },
    { key: 'PageLayouts', label: 'Page Layouts', route: 'PageLayouts', searchPlaceholder: 'Filter page layouts...', loader: loadObjectPageLayoutsSection },
    { key: 'LightningRecordPages', label: 'Lightning Record Pages', route: 'LightningPages', searchPlaceholder: 'Filter lightning record pages...', loader: loadObjectLightningPagesSection },
    { key: 'ButtonsLinksActions', label: 'Buttons, Links, and Actions', route: 'ButtonsLinksActions', searchPlaceholder: 'Filter buttons, links, and actions...', loader: loadObjectButtonsAndActionsSection },
    { key: 'CompactLayouts', label: 'Compact Layouts', route: 'CompactLayouts', searchPlaceholder: 'Filter compact layouts...', loader: loadObjectCompactLayoutsSection },
    { key: 'FieldSets', label: 'Field Sets', route: 'FieldSets', searchPlaceholder: 'Filter field sets...', loader: loadObjectFieldSetsSection },
    { key: 'ObjectLimits', label: 'Object Limits', route: 'Limits', searchPlaceholder: 'Filter object limits...', loader: loadObjectLimitsSection },
    { key: 'RecordTypes', label: 'Record Types', route: 'RecordTypes', searchPlaceholder: 'Filter record types...', loader: loadObjectRecordTypesSection },
    { key: 'RelatedLookupFilters', label: 'Related Lookup Filters', route: 'RelatedLookupFilters', searchPlaceholder: 'Filter related lookup filters...', loader: loadObjectRelatedLookupFiltersSection },
    { key: 'SearchLayouts', label: 'Search Layouts', route: 'SearchLayouts', searchPlaceholder: 'Filter search layouts...', loader: loadObjectSearchLayoutsSection },
    { key: 'ListViewButtonLayout', label: 'List View Button Layout', route: 'ListViewButtonLayout', searchPlaceholder: 'Filter list view button layouts...', loader: loadObjectListViewButtonLayoutSection },
    { key: 'ObjectAccess', label: 'Object & Field Access', route: 'ObjectAccess', searchPlaceholder: 'Filter object access items...', loader: loadObjectAccessSection },
    { key: 'Triggers', label: 'Triggers', route: 'Triggers', searchPlaceholder: 'Filter triggers...', loader: loadObjectTriggersSection },
    { key: 'FlowTriggers', label: 'Flow Triggers', route: 'FlowTriggers', searchPlaceholder: 'Filter flow triggers...', loader: loadObjectFlowTriggersSection },
    { key: 'ValidationRules', label: 'Validation Rules', route: 'ValidationRules', searchPlaceholder: 'Filter validation rules...', loader: loadObjectValidationRulesSection },
    { key: 'ConditionalFieldFormatting', label: 'Conditional Field Formatting', route: 'ConditionalFieldFormatting', searchPlaceholder: 'Filter conditional field formatting...', loader: loadObjectConditionalFieldFormattingSection }
];

function getObjectManagerSection(sectionKey) {
    return OBJECT_MANAGER_SECTIONS.find(section => section.key === sectionKey) || OBJECT_MANAGER_SECTIONS[0];
}

function escapeSoqlString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

async function fetchToolingQueryRecords(soql) {
    return fetchAllQueryRecords(
        `${appState.org.instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(soql)}`
    );
}

async function fetchQueryRecords(soql) {
    return fetchAllQueryRecords(
        `${appState.org.instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`
    );
}

async function fetchMergedQueryRecords(queries) {
    const merged = [];
    const seenIds = new Set();
    let successfulQueries = 0;
    let lastError = null;

    for (const soql of queries) {
        if (!soql) continue;

        try {
            const records = await fetchQueryRecords(soql);
            successfulQueries += 1;
            records.forEach(record => {
                const key = record?.Id || record?.DurableId || record?.QualifiedApiName || JSON.stringify(record);
                if (seenIds.has(key)) return;
                seenIds.add(key);
                merged.push(record);
            });
        } catch (error) {
            lastError = error;
        }
    }

    if (!successfulQueries && lastError) {
        throw lastError;
    }

    return merged;
}

async function fetchGlobalDescribeObjects() {
    const response = await fetch(`${appState.org.instanceUrl}/services/data/v60.0/sobjects`, {
        headers: {
            Authorization: `Bearer ${appState.org.accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data?.sobjects) ? data.sobjects : [];
}

async function resolveObjectEntityId(selectedObject) {
    if (!selectedObject || selectedObject.id) return selectedObject?.id || null;

    const safeName = escapeSoqlString(selectedObject.name);
    const queries = [
        `SELECT DurableId, Id, QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = '${safeName}' LIMIT 1`
    ];

    try {
        const toolingRecords = await fetchMergedToolingQueryRecords(queries);
        const toolingMatch = toolingRecords.find(record => record?.QualifiedApiName === selectedObject.name);
        if (toolingMatch?.DurableId || toolingMatch?.Id) {
            selectedObject.id = toolingMatch.DurableId || toolingMatch.Id;
            return selectedObject.id;
        }
    } catch (error) {
        console.warn(`EntityDefinition tooling lookup failed for ${selectedObject.name}.`, error);
    }

    try {
        const records = await fetchMergedQueryRecords(queries);
        const match = records.find(record => record?.QualifiedApiName === selectedObject.name);
        if (match?.DurableId || match?.Id) {
            selectedObject.id = match.DurableId || match.Id;
            return selectedObject.id;
        }
    } catch (error) {
        console.warn(`EntityDefinition query lookup failed for ${selectedObject.name}.`, error);
    }

    return null;
}

async function fetchMergedToolingQueryRecords(queries) {
    const merged = [];
    const seenIds = new Set();
    let successfulQueries = 0;
    let lastError = null;

    for (const soql of queries) {
        if (!soql) continue;

        try {
            const records = await fetchToolingQueryRecords(soql);
            successfulQueries += 1;
            records.forEach(record => {
                const key = record?.Id || JSON.stringify(record);
                if (seenIds.has(key)) return;
                seenIds.add(key);
                merged.push(record);
            });
        } catch (error) {
            lastError = error;
        }
    }

    if (!successfulQueries && lastError) {
        throw lastError;
    }

    return merged;
}

function buildObjectManagerSectionRootUrl(objectId, sectionKey) {
    const section = getObjectManagerSection(sectionKey);
    return ObjectManagerLinks.buildRootUrl(getSetupBaseUrl(), typeof objectId === 'object' ? objectId : { id: objectId }, section.route);
}

function buildObjectManagerSectionItemUrl(objectId, sectionKey, itemId) {
    return ObjectManagerLinks.buildItemUrl(getSetupBaseUrl(), typeof objectId === 'object' ? objectId : { id: objectId }, getObjectManagerSection(sectionKey).route, itemId);
}

function buildObjectManagerSectionRootUrlByApiName(objectApiName, routeName) {
    return ObjectManagerLinks.buildRootUrl(getSetupBaseUrl(), { name: objectApiName }, routeName);
}

function buildObjectManagerSectionItemUrlByApiName(objectApiName, routeName, itemId) {
    return ObjectManagerLinks.buildItemUrl(getSetupBaseUrl(), { name: objectApiName }, routeName, itemId);
}

function buildPageLayoutSetupUrl(selectedObject, layoutId) {
    return ObjectManagerLinks.buildItemUrl(getSetupBaseUrl(), selectedObject, 'PageLayouts', layoutId);
}

function buildFieldSetSetupUrl(selectedObject, fieldSetId) {
    return ObjectManagerLinks.buildItemUrl(getSetupBaseUrl(), selectedObject, 'FieldSets', fieldSetId);
}

function buildApexTriggerSetupUrl(triggerId) {
    return `${getSetupBaseUrl()}/lightning/setup/ApexTriggers/page?address=${encodeURIComponent('/' + triggerId)}`;
}

function buildLightningRecordPageUrl(pageId) {
    return `${getLightningBaseUrl()}/visualEditor/appBuilder.app?flexiPageId=${encodeURIComponent(pageId)}`;
}

function createSectionRootItem(selectedObject, section, overrides = {}) {
    return {
        label: overrides.label || `Open ${section.label} in Setup`,
        subLabel: overrides.subLabel || `${selectedObject.label} (${selectedObject.name})`,
        url: overrides.url || buildObjectManagerSectionRootUrl(selectedObject, section.key),
        badgeLabel: overrides.badgeLabel || 'Open'
    };
}

function createSectionNoticeItem(label, subLabel, url = '') {
    return {
        label,
        subLabel,
        url,
        badgeLabel: url ? 'Open' : ''
    };
}

function createSectionTableItem(label, rows) {
    return {
        label,
        tableRows: Array.isArray(rows) ? rows : []
    };
}

function formatBooleanLabel(value) {
    return value ? 'Yes' : 'No';
}

async function withSectionRoot(selectedObject, sectionKey, loader) {
    const section = getObjectManagerSection(sectionKey);
    const rootItem = createSectionRootItem(selectedObject, section);

    try {
        const items = await loader(rootItem);
        return [rootItem, ...(Array.isArray(items) ? items : [])];
    } catch (error) {
        console.warn(`Object Manager section ${sectionKey} failed:`, error);
        return [
            rootItem,
            createSectionNoticeItem(
                `${section.label} listing unavailable in the popup`,
                error?.message || 'Open the section directly in Salesforce Setup.',
                rootItem.url
            )
        ];
    }
}

function renderObjectManagerSummary() {
    const summary = document.getElementById('objectManagerSummary');
    const layout = document.querySelector('.object-manager-layout');
    if (!summary) return;

    const selectedObject = appState.objectManager.selectedObject;
    if (!selectedObject) {
        summary.style.display = 'none';
        if (layout) layout.style.display = 'none';
        renderObjectFavoritesWorkspace();
        renderObjectManagerSections();
        return;
    }

    summary.style.display = 'block';
    if (layout) layout.style.display = 'grid';
    renderObjectFavoritesWorkspace();
    
    const section = getObjectManagerSection(appState.objectManager.activeSection);
    const itemCount = Array.isArray(appState.objectManager.items) ? appState.objectManager.items.length : 0;

    summary.classList.remove('object-manager-summary-empty');
    summary.innerHTML = `
        <div class="object-manager-summary-row">
            <span class="object-manager-object-label">${escapeHtml(selectedObject.label)}</span>
            <span class="object-manager-object-api">${escapeHtml(selectedObject.name)}</span>
            <span class="object-manager-divider">•</span>
            <span class="object-manager-subtitle">${escapeHtml(section.label)}${itemCount ? ` • ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}</span>
        </div>
    `;
}

function renderObjectManagerSections() {
    const container = document.getElementById('objectManagerSections');
    const sidebar = container?.closest('.object-manager-sidebar');
    if (!container) return;

    const selectedObject = appState.objectManager.selectedObject;
    
    if (!selectedObject) {
        container.innerHTML = '';
        if (sidebar) sidebar.style.display = 'none';
        return;
    }

    if (sidebar) sidebar.style.display = 'block';
    
    container.innerHTML = OBJECT_MANAGER_SECTIONS.map(section => `
        <button
            type="button"
            class="object-manager-section-btn ${section.key === appState.objectManager.activeSection ? 'active' : ''}"
            data-section-key="${section.key}"
        >
            ${escapeHtml(section.label)}
        </button>
    `).join('');
}

function renderObjectManagerItems(items) {
    const results = document.getElementById('results');
    if (!results) return;

    if (!appState.objectManager.selectedObject) {
        results.innerHTML = '';
        return;
    }

    if (!items.length) {
        results.innerHTML = '<div class="empty-state"><p>No items match the current section filter.</p></div>';
        return;
    }

    renderNavCards(results, items);
}

function getFilteredObjectManagerItems() {
    const term = String(document.getElementById('fieldSearchInput')?.value || '').trim().toLowerCase();
    if (!term) return appState.objectManager.items || [];

    return (appState.objectManager.items || []).filter(item => {
        const haystack = `${item.label || ''} ${item.subLabel || ''}`.toLowerCase();
        return haystack.includes(term);
    });
}

function resetObjectManagerState(message = 'Search for an object to start browsing Object Manager sections.', options = {}) {
    const clearInput = options.clearInput !== false;
    lastFieldFinderObject = null;
    appState.selectedFields.clear();
    appState.fields = [];
    appState.objectManager = {
        selectedObject: null,
        activeSection: 'Details',
        items: [],
        cache: {}
    };

    const objInput = document.getElementById('objInput');
    const fieldActions = document.getElementById('fieldActions');
    const fieldSearchInput = document.getElementById('fieldSearchInput');
    const results = document.getElementById('results');
    if (objInput && clearInput) objInput.value = '';
    if (fieldSearchInput) {
        fieldSearchInput.value = '';
        fieldSearchInput.placeholder = 'Filter current section...';
    }
    if (fieldActions) fieldActions.style.display = 'none';
    if (results) {
        results.innerHTML = '';
    }

    renderObjectManagerSummary();
    renderObjectManagerSections();
    updateInspectorButtonVisibility();
}

async function selectObjectForManager(obj, options = {}) {
    if (!obj) return;

    const isSameObject = appState.objectManager.selectedObject?.name === obj.name;
    if (!isSameObject) {
        lastFieldFinderObject = obj.name;
        appState.selectedFields.clear();
        appState.fields = [];
        appState.objectManager = {
            selectedObject: obj,
            activeSection: 'Details',
            items: [],
            cache: {}
        };

        const fieldSearchInput = document.getElementById('fieldSearchInput');
        if (fieldSearchInput) fieldSearchInput.value = '';
    } else {
        appState.objectManager.selectedObject = obj;
    }

    const objInput = document.getElementById('objInput');
    if (objInput && options.syncInput !== false) {
        objInput.value = obj.label || obj.name;
    }

    renderObjectManagerSummary();
    renderObjectManagerSections();
    await loadObjectManagerSection(isSameObject ? appState.objectManager.activeSection : 'Details', { force: !isSameObject, restoreToken: options.restoreToken });
}

async function applyObjectManagerStartup(context, restoreToken) {
    if (!isRestoreActive(restoreToken)) return;
    switchToTab('tabFields');
    resetObjectManagerState();
    if (context.type !== 'record' && context.type !== 'list') return;
    if (!appState.org.accessToken) return;
    const object = appState.objects.find(item => item.name === context.objectApiName);
    if (!object) {
        showStatus(`The current object ${context.objectApiName} is not available in the object catalog. Check your connection and permissions.`, 'warn');
        return;
    }
    await selectObjectForManager(object, { restoreToken });
}

async function loadObjectManagerSection(sectionKey, options = {}) {
    const selectedObject = appState.objectManager.selectedObject;
    const results = document.getElementById('results');
    const fieldActions = document.getElementById('fieldActions');
    const fieldSearchInput = document.getElementById('fieldSearchInput');
    const restoreToken = options.restoreToken || 0;

    if (!selectedObject) {
        resetObjectManagerState();
        return;
    }

    await resolveObjectEntityId(selectedObject);
    if (restoreToken && !isRestoreActive(restoreToken)) return;

    const section = getObjectManagerSection(sectionKey);
    appState.objectManager.activeSection = section.key;
    renderObjectManagerSections();
    renderObjectManagerSummary();

    if (fieldActions) fieldActions.style.display = 'flex';
    if (fieldSearchInput) fieldSearchInput.placeholder = section.searchPlaceholder || 'Filter current section...';

    if (!options.force && Array.isArray(appState.objectManager.cache[section.key])) {
        appState.objectManager.items = appState.objectManager.cache[section.key];
        renderObjectManagerItems(getFilteredObjectManagerItems());
        renderObjectManagerSummary();
        saveState();
        return;
    }

    if (results) {
        results.innerHTML = `<div class="empty-state"><p>Loading ${escapeHtml(section.label)}...</p></div>`;
    }

    const items = await section.loader(selectedObject);
    if (restoreToken && !isRestoreActive(restoreToken)) {
        return;
    }

    if (appState.objectManager.selectedObject?.name !== selectedObject.name) {
        return;
    }

    appState.objectManager.cache[section.key] = Array.isArray(items) ? items : [];
    appState.objectManager.items = appState.objectManager.cache[section.key];
    renderObjectManagerItems(getFilteredObjectManagerItems());
    renderObjectManagerSummary();
    saveState();
}

async function loadObjectDetailsSection(selectedObject) {
    const safeName = escapeSoqlString(selectedObject.name);
    const records = await fetchToolingQueryRecords(
        `SELECT Description, QualifiedApiName, Label, PluralLabel, DeploymentStatus, HelpSettingPageName, IsActivityTrackable, IsFieldHistoryTracked, IsReportingEnabled FROM EntityDefinition WHERE QualifiedApiName = '${safeName}' LIMIT 1`
    );
    const details = records[0] || {};
    const isCustomObject = /__(c|mdt|e|b)$/i.test(selectedObject.name);

    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('Details'), {
            label: 'Open Details in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`
        }),
        createSectionTableItem('Object Details', [
            ['Description', details.Description || ''],
            ['API Name', details.QualifiedApiName || selectedObject.name],
            ['Custom', formatBooleanLabel(isCustomObject)],
            ['Singular Label', details.Label || selectedObject.label],
            ['Plural Label', details.PluralLabel || ''],
            ['Enable Reports', formatBooleanLabel(Boolean(details.IsReportingEnabled))],
            ['Track Activities', formatBooleanLabel(Boolean(details.IsActivityTrackable))],
            ['Track Field History', formatBooleanLabel(Boolean(details.IsFieldHistoryTracked))],
            ['Deployment Status', details.DeploymentStatus || ''],
            ['Help Settings', details.HelpSettingPageName || 'Standard salesforce.com Help Window']
        ])
    ];
}

async function loadObjectFieldsSection(selectedObject) {
    return withSectionRoot(selectedObject, 'FieldsAndRelationships', async () => {
        const safeName = escapeSoqlString(selectedObject.name);
        const records = await fetchToolingQueryRecords(
            `SELECT DurableId, QualifiedApiName, Label, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${safeName}' ORDER BY Label`
        );

        return records.map(field => {
            const fieldId = field.DurableId && field.DurableId.includes('.') ? field.DurableId.split('.')[1] : field.DurableId;
            return {
                label: field.Label || field.QualifiedApiName,
                subLabel: `${field.QualifiedApiName || 'Unknown'} • ${field.DataType || 'Field'}`,
                url: fieldId ? buildObjectManagerSectionItemUrl(selectedObject, 'FieldsAndRelationships', fieldId) : buildObjectManagerSectionRootUrl(selectedObject, 'FieldsAndRelationships'),
                badgeLabel: 'Open'
            };
        });
    });
}

async function loadObjectPageLayoutsSection(selectedObject) {
    return withSectionRoot(selectedObject, 'PageLayouts', async (rootItem) => {
        rootItem.url = buildObjectManagerSectionRootUrl(selectedObject, 'PageLayouts');
        const safeName = escapeSoqlString(selectedObject.name);
        const safeId = escapeSoqlString(selectedObject.id);
        const records = await fetchMergedToolingQueryRecords([
            `SELECT Id, Name, TableEnumOrId, NamespacePrefix FROM Layout WHERE TableEnumOrId = '${safeName}' ORDER BY Name`,
            `SELECT Id, Name, TableEnumOrId, NamespacePrefix FROM Layout WHERE TableEnumOrId = '${safeId}' ORDER BY Name`
        ]);

        return records
            .sort((left, right) => String(left.Name || '').localeCompare(String(right.Name || '')))
            .filter(layout => !/approval/i.test(String(layout.Name || '')))
            .map(layout => ({
            label: layout.Name || 'Unnamed Layout',
            subLabel: layout.NamespacePrefix ? `Namespace: ${layout.NamespacePrefix}` : selectedObject.name,
            url: buildPageLayoutSetupUrl(selectedObject, layout.Id),
            badgeLabel: 'Open'
        }));
    });
}

async function loadObjectLightningPagesSection(selectedObject) {
    return withSectionRoot(selectedObject, 'LightningRecordPages', async (rootItem) => {
        rootItem.url = buildObjectManagerSectionRootUrl(selectedObject, 'LightningRecordPages');
        const safeName = escapeSoqlString(selectedObject.name);
        const safeId = escapeSoqlString(selectedObject.id);
        const records = await fetchMergedToolingQueryRecords([
            `SELECT Id, DeveloperName, MasterLabel, Type FROM FlexiPage WHERE Type = 'RecordPage' AND SobjectType = '${safeName}' ORDER BY MasterLabel`,
            `SELECT Id, DeveloperName, MasterLabel, Type FROM FlexiPage WHERE Type = 'RecordPage' AND EntityDefinition.QualifiedApiName = '${safeName}' ORDER BY MasterLabel`,
            `SELECT Id, DeveloperName, MasterLabel, Type FROM FlexiPage WHERE Type = 'RecordPage' AND EntityDefinitionId = '${safeId}' ORDER BY MasterLabel`,
            `SELECT Id, DeveloperName, MasterLabel, Type FROM FlexiPage WHERE SobjectType = '${safeName}' ORDER BY MasterLabel`,
            `SELECT Id, DeveloperName, MasterLabel, Type FROM FlexiPage WHERE EntityDefinitionId = '${safeId}' ORDER BY MasterLabel`
        ]);

        return records
            .sort((left, right) => String(left.MasterLabel || left.DeveloperName || '').localeCompare(String(right.MasterLabel || right.DeveloperName || '')))
            .map(page => ({
            label: page.MasterLabel || page.DeveloperName || 'Lightning Record Page',
            subLabel: `${page.DeveloperName || 'Unknown'}${page.Type ? ` • ${page.Type}` : ''}`,
            url: buildObjectManagerSectionItemUrlByApiName(selectedObject.name, 'LightningPages', page.Id),
            badgeLabel: 'Open'
        }));
    });
}

async function loadObjectButtonsAndActionsSection(selectedObject) {
    return withSectionRoot(selectedObject, 'ButtonsLinksActions', async (rootItem) => {
        rootItem.url = buildObjectManagerSectionRootUrlByApiName(selectedObject.name, 'ButtonsLinksActions');
        const safeName = escapeSoqlString(selectedObject.name);
        const safeId = escapeSoqlString(selectedObject.id);
        const [webLinks, quickActions] = await Promise.all([
            fetchMergedToolingQueryRecords([
                `SELECT Id, Name, MasterLabel, DisplayType FROM WebLink WHERE EntityDefinition.QualifiedApiName = '${safeName}' ORDER BY MasterLabel`,
                `SELECT Id, Name, MasterLabel, DisplayType FROM WebLink WHERE EntityDefinitionId = '${safeId}' ORDER BY MasterLabel`
            ]),
            fetchMergedToolingQueryRecords([
                `SELECT Id, DeveloperName, MasterLabel, Type FROM QuickActionDefinition WHERE SobjectType = '${safeName}' ORDER BY MasterLabel`,
                `SELECT Id, DeveloperName, MasterLabel, Type FROM QuickActionDefinition WHERE EntityDefinitionId = '${safeId}' ORDER BY MasterLabel`
            ]).catch(() => [])
        ]);

        const records = [
            ...webLinks.map(item => ({
                id: item.Id,
                label: item.MasterLabel || item.Name || 'Button / Link',
                subLabel: item.Name
                    ? `${item.Name}${item.DisplayType ? ` • ${item.DisplayType}` : ''} • Button / Link`
                    : `${item.DisplayType || 'Button / Link'} • Button / Link`
            })),
            ...quickActions.map(item => ({
                id: item.Id,
                label: item.MasterLabel || item.DeveloperName || 'Quick Action',
                subLabel: `${item.DeveloperName || 'Unknown'}${item.Type ? ` • ${item.Type}` : ''} • Quick Action`
            }))
        ].sort((left, right) => String(left.label || '').localeCompare(String(right.label || '')));

        return records.map(item => ({
            label: item.label || 'Button / Link / Action',
            subLabel: item.subLabel || selectedObject.name,
            url: buildObjectManagerSectionItemUrlByApiName(selectedObject.name, 'ButtonsLinksActions', item.id),
            badgeLabel: 'Open'
        }));
    });
}

async function loadObjectCompactLayoutsSection(selectedObject) {
    return withSectionRoot(selectedObject, 'CompactLayouts', async () => {
        const safeName = escapeSoqlString(selectedObject.name);
        const records = await fetchToolingQueryRecords(
            `SELECT Id, DeveloperName, MasterLabel FROM CompactLayout WHERE SobjectType = '${safeName}' ORDER BY MasterLabel`
        );

        return records.map(layout => ({
            label: layout.MasterLabel || layout.DeveloperName || 'Compact Layout',
            subLabel: layout.DeveloperName || selectedObject.name,
            url: buildObjectManagerSectionItemUrl(selectedObject, 'CompactLayouts', layout.Id),
            badgeLabel: 'Open'
        }));
    });
}

async function loadObjectFieldSetsSection(selectedObject) {
    return withSectionRoot(selectedObject, 'FieldSets', async (rootItem) => {
        rootItem.url = buildObjectManagerSectionRootUrl(selectedObject, 'FieldSets');
        const safeName = escapeSoqlString(selectedObject.name);
        const safeId = escapeSoqlString(selectedObject.id);
        const records = await fetchMergedToolingQueryRecords([
            `SELECT Id, DeveloperName, MasterLabel FROM FieldSet WHERE EntityDefinition.QualifiedApiName = '${safeName}' ORDER BY MasterLabel`,
            `SELECT Id, DeveloperName, MasterLabel FROM FieldSet WHERE EntityDefinitionId = '${safeId}' ORDER BY MasterLabel`
        ]);

        return records
            .sort((left, right) => String(left.MasterLabel || left.DeveloperName || '').localeCompare(String(right.MasterLabel || right.DeveloperName || '')))
            .map(fieldSet => ({
            label: fieldSet.MasterLabel || fieldSet.DeveloperName || 'Field Set',
            subLabel: fieldSet.DeveloperName || selectedObject.name,
            url: buildFieldSetSetupUrl(selectedObject, fieldSet.Id),
            badgeLabel: 'Open'
        }));
    });
}

async function loadObjectLimitsSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('ObjectLimits'), {
            label: 'Open Object Limits in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`,
            url: buildObjectManagerSectionRootUrlByApiName(selectedObject.name, 'Limits')
        })
    ];
}

async function loadObjectRecordTypesSection(selectedObject) {
    return withSectionRoot(selectedObject, 'RecordTypes', async (rootItem) => {
        rootItem.url = buildObjectManagerSectionRootUrlByApiName(selectedObject.name, 'RecordTypes');
        const safeName = escapeSoqlString(selectedObject.name);
        const records = await fetchToolingQueryRecords(
            `SELECT Id, Name, IsActive FROM RecordType WHERE SobjectType = '${safeName}' ORDER BY Name`
        );

        return records
            .sort((left, right) => String(left.Name || '').localeCompare(String(right.Name || '')))
            .map(recordType => ({
            label: recordType.Name || 'Record Type',
            subLabel: `${selectedObject.name}${typeof recordType.IsActive === 'boolean' ? ` • Active: ${formatBooleanLabel(recordType.IsActive)}` : ''}`,
            url: buildObjectManagerSectionItemUrlByApiName(selectedObject.name, 'RecordTypes', recordType.Id),
            badgeLabel: 'Open'
        }));
    });
}

async function loadObjectRelatedLookupFiltersSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('RelatedLookupFilters'), {
            label: 'Open Related Lookup Filters in Setup',
            subLabel: `Use Salesforce Setup to review lookup filters for ${selectedObject.label}.`
        })
    ];
}

async function loadObjectSearchLayoutsSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('SearchLayouts'), {
            label: 'Open Search Layouts in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`,
            url: buildObjectManagerSectionRootUrlByApiName(selectedObject.name, 'MySearchLayouts')
        })
    ];
}

async function loadObjectListViewButtonLayoutSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('ListViewButtonLayout'), {
            label: 'Open List View Button Layout in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`,
            url: buildObjectManagerSectionRootUrlByApiName(selectedObject.name, 'AlohaSearchLayouts')
        })
    ];
}

async function loadObjectAccessSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('ObjectAccess'), {
            label: 'Open Object Access in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`
        }),
        createSectionNoticeItem(
            'Open Field Access in Setup',
            `Review field-level access for ${selectedObject.label}.`,
            buildObjectManagerSectionRootUrlByApiName(selectedObject.name, 'FieldAccess')
        )
    ];
}

async function loadObjectTriggersSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('Triggers'), {
            label: 'Open Triggers in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`,
            url: buildObjectManagerSectionRootUrlByApiName(selectedObject.name, 'ApexTriggers')
        })
    ];
}

async function loadObjectFlowTriggersSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('FlowTriggers'), {
            label: 'Open Flow Triggers in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`
        })
    ];
}

async function loadObjectValidationRulesSection(selectedObject) {
    return withSectionRoot(selectedObject, 'ValidationRules', async () => {
        const safeName = escapeSoqlString(selectedObject.name);
        const records = await fetchToolingQueryRecords(
            `SELECT Id, ValidationName, ErrorMessage FROM ValidationRule WHERE Active = true AND EntityDefinition.QualifiedApiName = '${safeName}' ORDER BY ValidationName`
        );

        return records.map(rule => ({
            label: rule.ValidationName || 'Validation Rule',
            subLabel: rule.ErrorMessage || selectedObject.name,
            url: buildObjectManagerSectionItemUrl(selectedObject, 'ValidationRules', rule.Id),
            badgeLabel: 'Open'
        }));
    });
}

async function loadObjectUrlSlugsSection(selectedObject) {
    return withSectionRoot(selectedObject, 'UrlSlugs', async (rootItem) => [
        createSectionNoticeItem('Open URL Slugs in Setup', `Review URL slug configuration for ${selectedObject.label}.`, rootItem.url)
    ]);
}

async function loadObjectConditionalFieldFormattingSection(selectedObject) {
    return [
        createSectionRootItem(selectedObject, getObjectManagerSection('ConditionalFieldFormatting'), {
            label: 'Open Conditional Field Formatting in Setup',
            subLabel: `${selectedObject.label} (${selectedObject.name})`
        })
    ];
}

async function fetchAllObjects(domRefs) {
    try {
        const records = await fetchGlobalDescribeObjects();
        const objects = records
            .filter(o => o?.name && o?.label && (o?.queryable !== false || o.name === appState.recordPage.startupObjectName))
            .map(o => ({
                name: o.name,
                label: o.label,
                id: null
            }));

        if (!objects.length) {
            showStatus('No objects found. Check permissions.', 'error');
            return;
        }

        appState.objects = objects
            .sort((a, b) => a.label.localeCompare(b.label));

        const list = domRefs.objectList;
        if (list) {
            list.innerHTML = '';
            appState.objects.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.name;
                opt.textContent = o.label;
                list.appendChild(opt);
            });
        }
    } catch (err) {
        showStatus('Objects failed: ' + err.message, 'error');
    }
}

const objInput = document.getElementById('objInput');
if (objInput) {
    objInput.oninput = async (e) => {
        const val = e.target.value;
        const obj = appState.objects.find(o => o.name === val || o.label === val);

        if (!obj) {
            resetObjectManagerState(
                val ? 'Select an object from the suggestions to browse setup sections.' : 'Search for an object to start browsing Object Manager sections.',
                { clearInput: false }
            );
            saveState();
            return;
        }

        await selectObjectForManager(obj, { syncInput: false });
    };
}

const fieldSearchInput = document.getElementById('fieldSearchInput');
if (fieldSearchInput) {
    fieldSearchInput.addEventListener('input', () => {
        renderObjectManagerItems(getFilteredObjectManagerItems());
        saveState();
    });
}

const objectManagerSections = document.getElementById('objectManagerSections');
if (objectManagerSections) {
    objectManagerSections.addEventListener('click', (event) => {
        const button = event.target.closest('[data-section-key]');
        if (!button || button.disabled) return;
        const sectionKey = button.dataset.sectionKey;
        loadObjectManagerSection(sectionKey);
    });
}

const objectFavoritesWorkspace = document.getElementById('objectFavoritesWorkspace');
if (objectFavoritesWorkspace) {
    objectFavoritesWorkspace.addEventListener('click', async (event) => {
        const unfavoriteButton = event.target.closest('[data-unfavorite-object]');
        if (unfavoriteButton) {
            const objectName = unfavoriteButton.getAttribute('data-unfavorite-object');
            toggleObjectFavorite(objectName);
            renderObjectFavoritesWorkspace();
            return;
        }

        const openButton = event.target.closest('[data-open-favorite]');
        if (!openButton) return;

        const objectName = openButton.getAttribute('data-open-favorite');
        const obj = appState.objects.find(item => item.name === objectName);
        if (!obj) {
            showStatus('Object metadata is still loading. Try again.', 'warn');
            return;
        }

        await selectObjectForManager(obj);
    });
}

function setupFlowListeners() {
    const flowSearchInput = document.getElementById('flowSearchInput');
    if (!flowSearchInput) return;

    if (flowSearchInput.dataset.flowListenersBound === 'true') return;
    flowSearchInput.dataset.flowListenersBound = 'true';

    const syncFlowSearchState = async (value, { fetchOnExactMatch = false } = {}) => {
        const flowResults = document.getElementById('flowResults');
        const term = String(value || '').trim();

        if (!flowResults) return;

        if (!term) {
            clearSelectedFlow();
            flowResults.innerHTML = '<div class="empty-state"><p>No results to display. Start by searching above.</p></div>';
            return;
        }

        if (!appState.flowsLoaded && !appState.flowsLoadPromise && appState.org.accessToken && appState.org.instanceUrl) {
            flowResults.innerHTML = '<div class="empty-state"><p>Loading flow list...</p></div>';
            try {
                await fetchAllFlows();
            } catch (error) {
                flowResults.innerHTML = `<div class="empty-state"><p>Error loading flows: ${escapeHtml(error.message || 'Unknown error')}</p></div>`;
                return;
            }
        }

        if (appState.flowsLoadPromise && !appState.flowsLoaded) {
            flowResults.innerHTML = '<div class="empty-state"><p>Loading flow list...</p></div>';
            return;
        }

        const matches = filterFlows(term);
        const exactMatch = matches.find(flow =>
            String(flow.DeveloperName || '').toLowerCase() === term.toLowerCase()
            || getFlowDisplayLabel(flow).toLowerCase() === term.toLowerCase()
        );

        if (fetchOnExactMatch && exactMatch?.DeveloperName) {
            setSelectedFlow(exactMatch);
            fetchFlowVersions(exactMatch.DeveloperName);
            saveState();
            return;
        }

        clearSelectedFlow();
        flowResults.innerHTML = matches.length
            ? '<div class="empty-state"><p>Select a flow from the list to view versions.</p></div>'
            : '<div class="empty-state"><p>No matching flows found.</p></div>';
    };

    flowSearchInput.addEventListener('focus', () => {
        if (flowSearchInput.value) {
            syncFlowSearchState(flowSearchInput.value, { fetchOnExactMatch: false });
        }
    });

    flowSearchInput.addEventListener('input', (e) => {
        syncFlowSearchState(e.target.value, { fetchOnExactMatch: false });
    });

    flowSearchInput.addEventListener('change', (e) => {
        syncFlowSearchState(e.target.value, { fetchOnExactMatch: true });
    });

    flowSearchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        syncFlowSearchState(e.target.value, { fetchOnExactMatch: true });
    });

    console.log('✅ Flow search ready');
}

async function fetchAllFlows() {
    if (appState.flowsLoadPromise) {
        await appState.flowsLoadPromise;
        return;
    }

    const query = 'SELECT Id, DeveloperName, MasterLabel, ActiveVersionId FROM FlowDefinition ORDER BY MasterLabel';
    appState.flowsLoadPromise = (async () => {
        let nextUrl = `${appState.org.instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(query)}`;
        const allFlows = [];

        while (nextUrl) {
            const res = await fetch(nextUrl, {
                headers: {
                    Authorization: `Bearer ${appState.org.accessToken}`
                }
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            allFlows.push(...(data.records || []));
            nextUrl = data.nextRecordsUrl ? `${appState.org.instanceUrl}${data.nextRecordsUrl}` : null;
        }

        appState.flows = allFlows;
        appState.flowsLoaded = true;

        const list = document.getElementById('flowList');
        if (list) {
            list.innerHTML = '';
            appState.flows.forEach(flow => {
                const opt = document.createElement('option');
                opt.value = getFlowDisplayLabel(flow) || flow.DeveloperName;
                opt.textContent = getFlowDisplayLabel(flow) || flow.DeveloperName;
                list.appendChild(opt);
            });
        }

        const flowTypeahead = typeaheadControllers.get('flowSearchInput');
        if (
            flowTypeahead
            && String(flowTypeahead.input?.value || '').trim()
            && document.activeElement === flowTypeahead.input
            && flowTypeahead.input.dataset.restoredTypeaheadValue !== 'true'
        ) {
            flowTypeahead.refresh();
        }
    })();

    try {
        await appState.flowsLoadPromise;
    } finally {
        appState.flowsLoadPromise = null;
    }
}

async function fetchRecentFlows(force = false) {
    const container = document.getElementById('recentFlowsList');
    if (!container) return;
    if (appState.recentFlowsLoaded && !force) {
        renderRecentFlows();
        return;
    }
    if (appState.recentFlowsLoadPromise) return appState.recentFlowsLoadPromise;
    if (!appState.org.userId) {
        container.innerHTML = '<div class="empty-state"><p>Current Salesforce user could not be identified.</p></div>';
        return;
    }

    container.innerHTML = '<div class="empty-state"><p>Loading recently updated flows...</p></div>';
    const query = `SELECT Id, DeveloperName, MasterLabel, ActiveVersionId, LatestVersionId, LastModifiedDate, LastModifiedById
                   FROM FlowDefinition
                   WHERE LastModifiedById = '${appState.org.userId}'
                   ORDER BY LastModifiedDate DESC`;

    appState.recentFlowsLoadPromise = (async () => {
        let nextUrl = `${appState.org.instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(query)}`;
        const records = [];
        while (nextUrl) {
            const response = await fetch(nextUrl, {
                headers: { Authorization: `Bearer ${appState.org.accessToken}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            records.push(...(data.records || []));
            nextUrl = data.nextRecordsUrl ? `${appState.org.instanceUrl}${data.nextRecordsUrl}` : null;
        }
        appState.recentFlows = records.sort((left, right) =>
            new Date(right.LastModifiedDate || 0) - new Date(left.LastModifiedDate || 0)
        );
        appState.recentFlowsLoaded = true;
        renderRecentFlows();
    })();

    try {
        await appState.recentFlowsLoadPromise;
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Could not load recently updated flows: ${escapeHtml(error.message)}</p></div>`;
    } finally {
        appState.recentFlowsLoadPromise = null;
    }
}

function renderRecentFlows() {
    const container = document.getElementById('recentFlowsList');
    if (!container) return;
    if (!appState.recentFlows.length) {
        container.innerHTML = '<div class="empty-state"><p>No flows modified by you were found.</p></div>';
        return;
    }

    container.innerHTML = appState.recentFlows.map(flow => {
        const label = getFlowDisplayLabel(flow) || flow.DeveloperName || 'Untitled Flow';
        const modified = flow.LastModifiedDate
            ? new Date(flow.LastModifiedDate).toLocaleString()
            : 'Unknown date';
        return `
            <button type="button" class="flow-recent-item" data-recent-flow="${escapeHtml(flow.DeveloperName || '')}">
              <span class="flow-recent-name">${escapeHtml(label)}</span>
              <span class="flow-recent-api">${escapeHtml(flow.DeveloperName || '')}</span>
              <span class="flow-recent-date">${escapeHtml(modified)}</span>
            </button>
        `;
    }).join('');
}


const indentSpace = '  ';
let plainTextForCopy = '';

const formulaInput = document.getElementById('formulaInput');
if (formulaInput) {
    formulaInput.oninput = (e) => {
        const raw = e.target.value;
        const out = document.getElementById('formulaOutput');
        const wrapper = document.getElementById('stylerOutputWrapper');
        const countDisplay = document.getElementById('charCount');

        if (!out || !wrapper) return;

        if (!raw.trim()) {
            wrapper.style.display = 'none';
            plainTextForCopy = '';
            return;
        }

        let clean = raw.replace(/\s+/g, ' ').trim();
        let indentLevel = 0;
        let htmlResult = '';
        let plainResult = '';
        let compactLevel = 0;

        const compactFunctions = [
            'MONTH', 'DAY', 'YEAR', 'TODAY', 'ADDMONTHS', 'DATE', 'ISPICKVAL',
            'TEXT', 'NOT', 'ISBLANK', 'ABS', 'ROUND', 'ISNULL', 'BEGIN',
            'BLANKVALUE', 'CONTAINS', 'DATETIMEVALUE', 'DATEVALUE', 'DAYOFYEAR',
            'FLOOR', 'FIND', 'HOUR', 'HYPERLINK', 'INCLUDES', 'ISNUMBER',
            'ISOWEEK', 'ISOYEAR', 'LEFT', 'LEN', 'LN', 'LOG', 'LPAD', 'MAX',
            'MID', 'MINUTE', 'NULLVALUE', 'REVERSE', 'RIGHT', 'RPAD', 'SECOND',
            'SIN', 'SQRT', 'SUBSTITUTE', 'TAN', 'TIMENOW', 'TIMEVALUE', 'TRIM',
            'TRUNC', 'UPPER', 'VALUE', 'WEEKDAY', 'NOW'
        ];

        const tokens = clean.split(/([(),=<>!&|+\-*/])/);

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i]?.trim();
            if (!token) continue;

            if (token === '(') {
                let funcName = '';
                for (let j = i - 1; j >= 0; j--) {
                    const prev = tokens[j]?.trim();
                    if (prev && !['+', '-', '*', '/', '(', ')', ','].includes(prev)) {
                        funcName = prev.toUpperCase();
                        break;
                    }
                }

                if (tokens[i + 1]?.trim() === ')') {
                    htmlResult += '()';
                    plainResult += '()';
                    i++;
                    continue;
                }

                if (compactFunctions.includes(funcName) || compactLevel > 0) {
                    compactLevel++;
                    htmlResult += '(';
                    plainResult += '(';
                } else {
                    indentLevel++;
                    htmlResult += `(<br>${indentSpace.repeat(indentLevel)}`;
                    plainResult += `(\n${indentSpace.repeat(indentLevel)}`;
                }
            } else if (token === ')') {
                if (compactLevel > 0) {
                    compactLevel--;
                    htmlResult += ')';
                    plainResult += ')';
                } else {
                    indentLevel = Math.max(0, indentLevel - 1);
                    htmlResult += `<br>${indentSpace.repeat(indentLevel)})`;
                    plainResult += `\n${indentSpace.repeat(indentLevel)})`;
                }
            } else if (token === ',') {
                if (compactLevel === 0) {
                    htmlResult += `, <br>${indentSpace.repeat(indentLevel)}`;
                    plainResult += `, \n${indentSpace.repeat(indentLevel)}`;
                } else {
                    htmlResult += ', ';
                    plainResult += ', ';
                }
            } else if (['+', '-', '*', '/'].includes(token)) {
                if (compactLevel === 0) {
                    htmlResult += ` ${token} <br>${indentSpace.repeat(indentLevel)}`;
                    plainResult += ` ${token} \n${indentSpace.repeat(indentLevel)}`;
                } else {
                    htmlResult += ` ${token} `;
                    plainResult += ` ${token} `;
                }
            } else {
                plainResult += token;
                if (compactFunctions.includes(token.toUpperCase()) || ['IF', 'AND', 'OR'].includes(token.toUpperCase())) {
                    htmlResult += `<span class="syntax-func">${escapeHtml(token)}</span>`;
                } else {
                    htmlResult += escapeHtml(token);
                }
            }
        }

        plainTextForCopy = plainResult;
        out.innerHTML = htmlResult.replace(/  /g, '&nbsp;&nbsp;');

        if (countDisplay) {
            const totalChars = plainTextForCopy.length;
            countDisplay.innerText = `${totalChars.toLocaleString()} / 15,000 characters`;
            countDisplay.style.color = totalChars > 15000 ? 'red' : '#666';
        }

        wrapper.style.display = 'block';
    };
}

function performCopy(text, buttonId) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    const textArea = document.createElement('textarea');
    textArea.value = text.replace(/[^\x20-\x7E\n]/g, '').replace(/\r\n/g, '\n').trim();
    document.body.appendChild(textArea);
    textArea.select();

    try {
        if (document.execCommand('copy')) {
            const originalText = btn.innerText;
            btn.innerText = 'Copied!';
            btn.classList.add('btn-success');

            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('btn-success');
            }, 2000);
        }
    } catch {
        btn.innerText = 'Error';
    }

    document.body.removeChild(textArea);
}

document.getElementById('btnCopyPretty')?.addEventListener('click', () => {
    performCopy(plainTextForCopy, 'btnCopyPretty');
});

document.getElementById('btnCopySafe')?.addEventListener('click', () => {
    performCopy(plainTextForCopy.replace(/^[ \t]+/gm, ''), 'btnCopySafe');
});

document.getElementById('btnClearFormula')?.addEventListener('click', () => {
    const input = document.getElementById('formulaInput');
    const wrapper = document.getElementById('stylerOutputWrapper');
    if (input) input.value = '';
    if (wrapper) wrapper.style.display = 'none';
    plainTextForCopy = '';
});

function activateFlowSubTab(targetId, resetResults = true) {
    document.querySelectorAll('#flowsView .flow-toolbar .sub-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.target === targetId);
    });

    document.querySelectorAll('.flow-sub-view').forEach(view => {
        view.style.display = view.id === targetId ? 'block' : 'none';
    });

    const flowResults = document.getElementById('flowResults');
    if (flowResults && resetResults) {
        flowResults.innerHTML = '<div class="empty-state"><p>No results to display.</p></div>';
    }

    if (targetId === 'recentFlowsContainer') {
        void fetchRecentFlows();
    }
}

document.querySelectorAll('#flowsView .flow-toolbar .sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const action = tab.dataset.action;
        if (action === 'open-flow-builder') {
            openTabNextToActive(`${getLightningBaseUrl()}/builder_platform_interaction/flowBuilder.app`);
            saveState();
            return;
        }

        if (action === 'open-flow-explorer') {
            openTabNextToActive(`${getLightningBaseUrl()}/interaction_explorer/flowExplorer.app`);
            saveState();
            return;
        }

        activateFlowSubTab(tab.dataset.target || 'flowSearchContainer');
    });
});

document.getElementById('btnRefreshRecentFlows')?.addEventListener('click', () => {
    void fetchRecentFlows(true);
});

document.getElementById('recentFlowsList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-recent-flow]');
    if (!button?.dataset.recentFlow) return;
    const flow = appState.recentFlows.find(item => item.DeveloperName === button.dataset.recentFlow);
    if (!flow) return;

    const searchInput = document.getElementById('flowSearchInput');
    if (searchInput) searchInput.value = getFlowDisplayLabel(flow) || flow.DeveloperName;
    setSelectedFlow(flow);
    activateFlowSubTab('flowSearchContainer', false);
    void fetchFlowVersions(flow.DeveloperName);
    saveState();
});

// ============================================================================
// FLOW VERSION DISPLAY (unchanged)
// ============================================================================

async function fetchFlowVersions(devName) {
    try {
        const query = `SELECT Id, VersionNumber, Status, LastModifiedDate 
                       FROM Flow 
                       WHERE Definition.DeveloperName = '${devName}' 
                       ORDER BY VersionNumber DESC`;
        
        const res = await fetch(
            appState.org.instanceUrl + "/services/data/v60.0/tooling/query?q=" + encodeURIComponent(query),
            { headers: { 'Authorization': `Bearer ${appState.org.accessToken}` } }
        );
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        const container = document.getElementById('flowResults');
        
        if (!container) return;
        container.innerHTML = "";
        
        if (!data.records || data.records.length === 0) {
            container.innerHTML = '<div class="empty-state">No versions found</div>';
            return;
        }

        if (appState.selectedFlow && String(appState.selectedFlow.DeveloperName || '').toLowerCase() === String(devName || '').toLowerCase()) {
            const selectedVersionId = appState.selectedFlow.ActiveVersionId || data.records[0]?.Id || '';
            const selectedFlow = {
                ...appState.selectedFlow,
                ActiveVersionId: selectedVersionId
            };
            setSelectedFlow(selectedFlow);
        }
        
        data.records.forEach(v => {
            const date = new Date(v.LastModifiedDate).toLocaleDateString();
            const div = document.createElement('div');
            div.className = "card flow-card";
            const flowUrl = `${getLightningBaseUrl()}/builder_platform_interaction/flowBuilder.app?flowId=${v.Id}`;
            div.dataset.flowId = v.Id;
            div.dataset.flowUrl = flowUrl;
            
            let statusColor = '#747474';
            let statusBg = '#f3f3f3';
            
            if (v.Status === 'Active') {
                statusColor = '#008a00';
                statusBg = '#dfeedd';
            } else if (v.Status === 'Obsolete') {
                statusColor = '#a06b00';
                statusBg = '#fff1d2';
            }

            div.innerHTML = `
                <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <a href="${escapeHtml(flowUrl)}" class="field-link" data-open-url="${escapeHtml(flowUrl)}" style="font-weight:bold; font-size:13px;">
                            Version ${v.VersionNumber}
                        </a>
                        <span style="font-size:10px; color:#666;">Modified: ${date}</span>
                    </div>
                    <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:4px; 
                                 background:${statusBg}; color:${statusColor}; border:1px solid ${statusColor};">
                        ${v.Status.toUpperCase()}
                    </span>
                </div>`;

            wireInteractiveContent(div);
            
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error('Error fetching flow versions:', error);
    }
}

document.getElementById('tabFields').onclick = () => switchTab('field');
document.getElementById('tabFormula').onclick = () => switchTab('formula');
document.getElementById('tabFlows').onclick = () => switchTab('flow');

// --- SALESFORCE INSPECTOR EXPORT FIX ---
var btnInspector = document.getElementById('btnInspector');
if (btnInspector) {
    btnInspector.onclick = function () {
        if (!appState || !appState.selectedFields || appState.selectedFields.size === 0) return;

        const urlsToOpen = [];

      
        var count = appState.selectedFields.size;
        if (count > 15) {
            var ok = confirm("Open " + count + " fields in new tabs?");
            if (!ok) return;
        }

        
        var setupBase = appState.org.instanceUrl.replace('.my.salesforce.com', '.my.salesforce-setup.com');

        
        appState.selectedFields.forEach(function (fieldName) {
          
            var field = null;
            for (var i = 0; i < (appState.fields || []).length; i++) {
                if (appState.fields[i] && appState.fields[i].name === fieldName) {
                    field = appState.fields[i];
                    break;
                }
            }
            if (!field) return;

            
            var fId = field.id && field.id.indexOf('.') >= 0 ? field.id.split('.')[1] : field.id;
            if (!fId || !field.objId) return;

            var url = setupBase +
                "/lightning/setup/ObjectManager/" + field.objId +
                "/FieldsAndRelationships/" + fId + "/view";

            urlsToOpen.push(url);
        });

        if (urlsToOpen.length) {
            chrome.runtime.sendMessage({ type: 'open_urls', urls: urlsToOpen });
        }
    };
}



// ===============================
// PROFILES + PERMISSION SETS (SAFE AUTH)
// Works whether your popup uses `vault` OR `appState.org`
// ===============================

// ---------- Auth resolver ----------
function getAuth() {

  const v = (typeof vault !== 'undefined') ? vault : null;
  const a = (typeof appState !== 'undefined' && appState && appState.org) ? appState.org : null;

 
  const auth = (v && (v.instanceUrl || v.accessToken)) ? v : a;

  return auth || { instanceUrl: '', accessToken: '' };
}

function hasAuth() {
  const auth = getAuth();
  return !!(auth.instanceUrl && auth.accessToken);
}

// ---------- Setup URL helpers ----------
function getSetupBaseUrl() {
  const auth = getAuth();
  if (!auth.instanceUrl) return '';

  return auth.instanceUrl
    .replace('.my.salesforce.com', '.my.salesforce-setup.com')
    .replace('.sandbox.my.salesforce.com', '.sandbox.my.salesforce-setup.com');
}

// Enhanced Profiles URL (matches your org URL format)
function buildEnhancedProfileUrl(profileId, sectionKey) {
    return ObjectManagerLinks.buildEnhancedProfileUrl(getSetupBaseUrl(), profileId, sectionKey);
}


function buildPermissionSetUrl(permSetId, sectionKey) {
    return ObjectManagerLinks.buildPermissionSetUrl(getSetupBaseUrl(), permSetId, sectionKey);
}

function renderNavCards(containerEl, items) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

    const leadingSpacerHtml = containerEl.id === 'results'
        ? ''
        : '<div style="width:24px;"></div>';

  items.forEach(i => {
    const div = document.createElement('div');
        div.className = 'card field-card';

        const tableHtml = Array.isArray(i.tableRows) && i.tableRows.length
            ? `
                <div class="nav-card-table-wrap">
                    <table class="nav-card-table">
                        <tbody>
                            ${i.tableRows.map(row => `
                                <tr>
                                    <th>${escapeHtml(row[0] || '')}</th>
                                    <td>${escapeHtml(row[1] || '')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `
            : '';

        const labelHtml = i.url
            ? `<a href="${escapeHtml(i.url)}" class="field-link" data-open-url="${escapeHtml(i.url)}">${escapeHtml(i.label)}</a>`
            : `<span class="field-link nav-card-static">${escapeHtml(i.label)}</span>`;
        const subLabelHtml = i.subLabel
            ? `<div class="nav-card-subtitle">${escapeHtml(i.subLabel)}</div>`
            : '';
        const badgeHtml = i.badgeLabel
            ? `<span class="custom-badge" style="flex-shrink:0;">${escapeHtml(i.badgeLabel)}</span>`
            : '';

    div.innerHTML = `
            ${leadingSpacerHtml}
      <div class="card-info"
           style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px; min-width:0;">
                <div class="nav-card-copy" style="flex:1; min-width:0;">
                    ${labelHtml}
                    ${subLabelHtml}
                                        ${tableHtml}
                </div>
                ${badgeHtml}
      </div>
    `;

        if (i.url) {
            div.querySelector('.field-link').onclick = (e) => {
                e.preventDefault();
                openTabNextToActive(i.url);
            };

            div.style.cursor = 'pointer';
            div.onclick = (e) => {
                if (e.target && e.target.closest && e.target.closest('a')) return;
                openTabNextToActive(i.url);
            };
        }

    containerEl.appendChild(div);
  });
}




// ---------- Tooling API helper ----------
async function toolingQuery(soql) {
  const auth = getAuth();
  if (!auth.instanceUrl || !auth.accessToken) throw new Error('No auth yet.');

  const endpoint =
    auth.instanceUrl +
    '/services/data/v60.0/tooling/query?q=' +
    encodeURIComponent(soql);

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + auth.accessToken }
  });

  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// ---------- UI helper ----------
function renderLinks(containerEl, items) {
 
  containerEl.innerHTML = items.map(i =>
    `<div style="margin:6px 0;">
             <a href="${escapeHtml(i.url)}" class="nav-link" data-url="${escapeHtml(i.url)}">${i.label}</a>
     </div>`
  ).join('');

  containerEl.querySelectorAll('a.nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
            openTabNextToActive(e.currentTarget.dataset.url);
    });
  });
}

// =====================
// PROFILES
// =====================
function setupProfilesUI() {
  const input = document.getElementById('profileSearchInput');
  const dl = document.getElementById('profileDatalist');
  const links = document.getElementById('profileLinks');
  if (!input || !dl || !links) return;

    const typeahead = setupInlineTypeahead('profileSearchInput', {
        minChars: 2,
        getItemValue: item => item.label,
        getPrimaryText: item => item.label,
        getSecondaryText: item => item.id
    });

  let matches = []; // [{id,label}]
  let timer = null;

  input.addEventListener('input', () => {
    const term = input.value || '';
    clearTimeout(timer);

    timer = setTimeout(async () => {
      if (term.trim().length < 2) {
        dl.innerHTML = '';
        links.innerHTML = '';
        matches = [];
                typeahead?.hide();
        return;
      }

      if (!hasAuth()) return;

      try {
        const safe = term.replace(/'/g, "\\'");
        const soql =
          "SELECT ProfileId, Profile.Name " +
          "FROM PermissionSet " +
          "WHERE IsOwnedByProfile = true " +
          "AND Profile.Name LIKE '%" + safe + "%' " +
          "ORDER BY Profile.Name " +
          "LIMIT 50";

        const data = await toolingQuery(soql);

        const rows = (data.records || [])
          .filter(r => r.ProfileId && r.Profile && r.Profile.Name)
          .map(r => ({ id: r.ProfileId, label: r.Profile.Name }));

        const seen = new Set();
        matches = rows.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));

        dl.innerHTML = matches.map(m => `<option value="${m.label}"></option>`).join('');
                typeahead?.render(matches);
      } catch (e) {
        console.error('Profile search failed:', e);
                typeahead?.hide();
      }
    }, 250);
  });

  input.addEventListener('change', () => {
    const match = matches.find(m => m.label === input.value);
    links.innerHTML = '';
    if (!match) return;
	
	dl.innerHTML = '';
    typeahead?.hide();
  input.blur();

    const sections = [
      ['AssignedApps', 'Assigned apps'],
      ['ConnectedApps', 'Assigned connected apps'],
      ['ObjectsAndTabs', 'Object settings'],
      ['AppPermissions', 'App permissions'],
      ['ClassAccess', 'Apex classes'],
      ['PageAccess', 'Visualforce page access'],
      ['ExternalDataSourceAccess', 'External Data source access'],
      ['NamedCredentialAccess', 'Named Credential access'],
      ['DataCategoryVisibility', 'Data category visibility'],
      ['FlowAccess', 'Flow access'],
      ['CustomPermissions', 'Custom permissions'],
      ['CustomMetadataTypes', 'Custom metadata types'],
      ['CustomSettings', 'Custom settings definitions'],
      ['SystemPermissions', 'System permissions'],
      ['LoginHours', 'Login hours'],
      ['LoginIpRanges', 'Login IP ranges'],
      ['ServiceProviders', 'Service providers'],
      ['SessionTimeout', 'Session settings'],
      ['PasswordPolicies', 'Password policies']
    ];

    const items = [
      { label: 'Open profile (base)', url: buildEnhancedProfileUrl(match.id, null) },
      ...sections.map(([key, label]) => ({ label, url: buildEnhancedProfileUrl(match.id, key) }))
    ];

    renderNavCards(links, items.map(x => ({
  label: x.label,
  subLabel: '',       
  url: x.url
})));

  });
}

// =====================
// PERMISSION SETS
// =====================
function setupPermSetsUI() {
  const input = document.getElementById('permSetSearchInput');
  const dl = document.getElementById('permSetDatalist');
  const links = document.getElementById('permSetLinks');

  if (!input || !dl || !links) {
    console.warn('Permission Set UI elements not found');
    return;
  }

  let matches = [];
  let timer = null;
    let suppressSearchOnce = false;

    const typeahead = setupInlineTypeahead('permSetSearchInput', {
        minChars: 2,
        getItemValue: item => item.label,
        getPrimaryText: item => item.label,
                getSecondaryText: item => item.id,
                onSelect: () => {
                    suppressSearchOnce = true;
                    clearTimeout(timer);
                    renderSelectedPermSetLinks();
                    input.blur();
                }
    });

  input.addEventListener('input', () => {
        if (suppressSearchOnce) {
            suppressSearchOnce = false;
            return;
        }

    const term = input.value.trim();
    clearTimeout(timer);

    if (term.length < 2) {
      dl.innerHTML = '';
      links.innerHTML = '';
      matches = [];
            typeahead?.hide();
      return;
    }

    timer = setTimeout(async () => {
      try {
        if (!hasAuth()) {
          links.innerHTML = '<div style="padding:8px;color:#ba0517;">Not connected to Salesforce yet.</div>';
          return;
        }

        const safe = term.replace(/'/g, "\\'");
        const soql = `
          SELECT Id, Label
          FROM PermissionSet
          WHERE IsOwnedByProfile = false
          AND Label LIKE '%${safe}%'
          ORDER BY Label
          LIMIT 50
        `;

        const data = await toolingQuery(soql);

        matches = (data.records || [])
          .filter(r => r.Id && r.Label)
          .map(r => ({ id: r.Id, label: r.Label }));

        dl.innerHTML = matches
          .map(m => `<option value="${m.label}"></option>`)
          .join('');
                typeahead?.render(matches);

        if (matches.length === 0) {
          links.innerHTML = '<div style="padding:8px;color:#666;">No permission sets found.</div>';
        }
      } catch (e) {
        console.error('Permission Set search failed:', e);
        links.innerHTML = `<div style="padding:8px;color:#ba0517;">Error: ${e.message}</div>`;
                typeahead?.hide();
      }
    }, 250);
  });

  input.addEventListener('change', renderSelectedPermSetLinks);
  input.addEventListener('blur', () => {
    setTimeout(renderSelectedPermSetLinks, 150);
  });

  function renderSelectedPermSetLinks() {
    const match = matches.find(m => m.label === input.value.trim());
    links.innerHTML = '';
        typeahead?.hide();

    if (!match) return;

    const sections = [
      ['EntityPermissions', 'Object settings'],
      ['FieldPermissions', 'Field permissions'],
      ['AppPermissions', 'App permissions'],
      ['ClassAccess', 'Apex classes'],
      ['PageAccess', 'Visualforce page access'],
      ['CustomPermissions', 'Custom permissions'],
      ['SystemPermissions', 'System permissions'],
      ['FlowAccess', 'Flow access']
    ];

    const items = [
      { label: 'Open permission set', url: buildPermissionSetUrl(match.id) },
      ...sections.map(([key, label]) => ({
        label,
        url: buildPermissionSetUrl(match.id, key)
      }))
    ];

    renderNavCards(links, items.map(x => ({
      label: x.label,
      subLabel: '',
      url: x.url
    })));
  }
}



function initProfilesAndPermSets() {
  setupProfilesUI();
  setupPermSetsUI();
}


document.addEventListener('DOMContentLoaded', async function() {
    // --- 1. INITIALIZE INSTANCE URL ---
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (isSalesforceUrl(tab?.url)) {
        globalInstanceUrl = new URL(tab.url).hostname;
    }

    // --- 2. TAB SWITCHING LOGIC ---
   // --- TAB SWITCHING LOGIC ---
const tabMap = {
  tabFields: 'fieldView',
  tabFormula: 'formulaView',
  tabFlows: 'flowsView',
  'validation-search-tab': 'validationView',
  btnOpenLVTab: 'listViewView',
  tabPermSets: 'permSetView',
    tabOrgLimits: 'orgLimitsView'
};
initProfilesAndPermSets();

Object.keys(tabMap).forEach(tabId => {
    const tabBtn = document.getElementById(tabId);
    if (tabBtn) {
       
        tabBtn.onclick = null; 

        tabBtn.addEventListener('click', function() {
         
            Object.keys(tabMap).forEach(id => {
                const t = document.getElementById(id);
                if (t) t.classList.remove('active');
            });

          
            document.querySelectorAll('.view').forEach(v => {
                v.style.display = 'none';
            });

            
            this.classList.add('active');
            const targetView = document.getElementById(tabMap[tabId]);
            if (targetView) {
  targetView.style.display = 'block';
  targetView.scrollTop = 0;
}

// Reset the container that typically scrolls in the popup
const content = document.getElementById('contentArea');
if (content) content.scrollTop = 0;

// Reset popup window scroll (covers cases where the popup itself is scrolling)
requestAnimationFrame(() => {
  window.scrollTo(0, 0);
  (document.scrollingElement || document.documentElement || document.body).scrollTop = 0;
});

        });
    } else {
        console.warn(`Tab element with ID "${tabId}" was not found in HTML.`);
    }
});

    // --- 3. VALIDATION RULE SEARCH LOGIC ---

    const btnSearchVR = document.getElementById('btn-execute-vr-search');
    if (btnSearchVR) {
        btnSearchVR.addEventListener('click', async () => {
            const loader = document.getElementById('vr-loader');
            const resultsDiv = document.getElementById('vr-results');
            
            
            if (!resultsDiv) {
                console.error("Error: Element 'vr-results' not found in HTML.");
                return;
            }

            const nameVal = document.getElementById('vr-name').value;
            const objVal = document.getElementById('vr-object').value;
            const msgVal = document.getElementById('vr-message').value;

            
            if (loader) loader.style.display = 'block';
            resultsDiv.innerHTML = ''; 

            
            let query = "SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, ErrorMessage FROM ValidationRule WHERE Active = true";
            // Escape single quotes so values like "don't" don't break the SOQL string literal
            if (nameVal) query += ` AND ValidationName LIKE '%${escapeSoqlString(nameVal)}%'`;
            if (objVal)  query += ` AND EntityDefinition.QualifiedApiName = '${escapeSoqlString(objVal)}'`;
            if (msgVal)  query += ` AND ErrorMessage LIKE '%${escapeSoqlString(msgVal)}%'`;

            try {
                const data = await callToolingApi(query);
                if (loader) loader.style.display = 'none';
                
                if (data.records && data.records.length > 0) {
                    renderVRResults(data.records);
                } else {
                    resultsDiv.innerHTML = '<p style="padding:10px; font-size:12px;">No active rules found matching those criteria.</p>';
                }
            } catch (err) {
                if (loader) loader.style.display = 'none';
                resultsDiv.innerHTML = `<p style="color:red; padding:10px;">Error: ${err.message}</p>`;
            }
        });
    }
	
	

});


function setupVRObjectSearch() {
    const vrInput = document.getElementById('vr-object');
    const vrResults = document.getElementById('vrObjResults');

    if (!vrInput || !vrResults) return;

    vrInput.oninput = () => {
        const term = vrInput.value.toLowerCase();
        if (!term) {
            vrResults.style.display = 'none';
            return;
        }

        
        const matches = appState.objects.filter(o => 
            o.label.toLowerCase().includes(term) || 
            o.name.toLowerCase().includes(term)
        ).slice(0, 10); 

        if (matches.length > 0) {
            vrResults.innerHTML = matches.map(o => `
                <div class="search-item" data-api="${o.name}" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; background: white;">
                    <div style="font-weight: bold; font-size: 12px;">${o.label}</div>
                    <div style="font-size: 10px; color: #666;">${o.name}</div>
                </div>
            `).join('');
            vrResults.style.display = 'block';
        } else {
            vrResults.style.display = 'none';
        }
    };

 
    vrResults.onclick = (e) => {
        const item = e.target.closest('.search-item');
        if (item) {
            vrInput.value = item.getAttribute('data-api');
            vrResults.style.display = 'none';
        }
    };

    
    document.addEventListener('click', (e) => {
        if (!vrInput.contains(e.target) && !vrResults.contains(e.target)) {
            vrResults.style.display = 'none';
        }
    });
}

// --- 4. RENDER RESULTS ---
function renderVRResults(records) {
  const container = document.getElementById('vr-results');

  const setupBase = appState.org.instanceUrl
    .replace('.my.salesforce.com', '.my.salesforce-setup.com')
    .replace('.sandbox.my.salesforce.com', '.sandbox.my.salesforce-setup.com');

  container.innerHTML = records.map(rule => `
    <div class="vr-result-card">
      <a href="${setupBase}/lightning/setup/ObjectManager/${rule.EntityDefinition.QualifiedApiName}/ValidationRules/${rule.Id}/view"
         target="_blank"
         rel="noopener noreferrer"
         class="vr-rule-name">
        ${rule.ValidationName}
      </a>
      <span class="vr-metadata-label">Object: ${rule.EntityDefinition.QualifiedApiName}</span>
      <div class="vr-error-msg">
        <strong>Error Message:</strong><br/>
        ${rule.ErrorMessage}
      </div>
    </div>
  `).join('');
  container.querySelectorAll('a.vr-rule-name').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
        openTabNextToActive(a.href);
  });
});

}


// --- 5. LIST VIEW EXPORT LOGIC ---
async function fetchListViews() {
    const inputVal = document.getElementById('lv-object-input').value;
    const resultsDiv = document.getElementById('lv-results');
    const exportContainer = document.getElementById('lv-export-container');

    const obj = appState.objects.find(o => o.label === inputVal || o.name === inputVal);
    const apiName = obj ? obj.name : inputVal;

    if (!apiName) return;

    resultsDiv.innerHTML = '<div style="padding:20px; text-align:center;">🔍 Searching List Views...</div>';
    exportContainer.style.display = 'none';

    try {
       
        const endpoint = `${appState.org.instanceUrl}/services/data/v60.0/sobjects/${apiName}/listviews`;
        
        const res = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${appState.org.accessToken}` }
        });
        const data = await res.json();

        if (data.listviews && data.listviews.length > 0) {
            resultsDiv.innerHTML = data.listviews.map(lv => `
                <div class="lv-row" style="padding:10px; border:1px solid #eee; margin-bottom:5px; border-radius:4px; display:flex; align-items:center; gap:10px; background:white;">
                    <input type="radio" name="selectedLV" value="${lv.id}" id="${lv.id}" class="lv-radio-select">
                    <label for="${lv.id}" style="flex:1; cursor:pointer;">
                        <div style="font-weight:bold; font-size:13px;">${lv.label}</div>
                        <code style="font-size:10px; color:#666;">${lv.developerName}</code>
                    </label>
                </div>
            `).join('');

           
            document.querySelectorAll('.lv-radio-select').forEach(radio => {
                radio.addEventListener('change', () => {
                    exportContainer.style.display = 'block'; 
                });
            });

        } else {
            resultsDiv.innerHTML = `<div style="padding:20px; color:#666;">No list views found for "${apiName}".</div>`;
        }
    } catch (err) {
        resultsDiv.innerHTML = `<div style="color:red; padding:10px;">API Error: This object may not support List View queries.</div>`;
    }
}



// A. Populate the Dropdown when Object is selected
function findObjectByLabelOrApi(value) {
    var list = appState.objects || [];
    for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o) continue;
        if (o.label === value || o.name === value) return o;
    }
    return null;
}

var lvObjectInput = document.getElementById('lv-object-input');
if (lvObjectInput) {
    lvObjectInput.oninput = function (e) {
        var inputVal = (e && e.target) ? e.target.value : '';
        var dropdown = document.getElementById('lv-dropdown');
        var container = document.getElementById('lv-dropdown-container');
        var footer = document.getElementById('lv-export-footer');
        var soqlContainer = document.getElementById('lv-soql-container');
        var soqlOutput = document.getElementById('lv-soql-output');

        if (!dropdown || !container) return;

        if (footer) footer.style.display = 'none';
        if (soqlContainer) soqlContainer.style.display = 'none';
        if (soqlOutput) soqlOutput.value = '';

        var obj = findObjectByLabelOrApi(inputVal);
        if (!obj || !obj.name) {
            container.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }

        dropdown.innerHTML = '<option value="">Loading list views...</option>';
        container.style.display = 'block';

        var url = appState.org.instanceUrl +
            '/services/data/v60.0/sobjects/' + encodeURIComponent(obj.name) + '/listviews';

        fetch(url, {
            headers: { 'Authorization': 'Bearer ' + appState.org.accessToken }
        })
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function (data) {
            dropdown.innerHTML = '<option value="">-- 2. Select a List View --</option>';
            var list = (data && data.listviews) ? data.listviews : [];
            for (var i = 0; i < list.length; i++) {
                var lv = list[i];
                var opt = document.createElement('option');
                opt.value = lv.id;
                opt.textContent = lv.label;
                dropdown.appendChild(opt);
            }
            container.style.display = 'block';
        })
        .catch(function (err) {
            console.error(err);
            dropdown.innerHTML = '<option value="">Error loading list views</option>';
        });
    };
}

async function fetchListViewSoqlQuery(apiName, lvId) {
    var url = appState.org.instanceUrl +
        '/services/data/v60.0/sobjects/' + encodeURIComponent(apiName) +
        '/listviews/' + lvId + '/describe';

    var res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + appState.org.accessToken }
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    var data = await res.json();
    if (!data.query) throw new Error('SOQL query not found for this view.');
    return data.query;
}

var lvDropdown = document.getElementById('lv-dropdown');
if (lvDropdown) {
    lvDropdown.onchange = function (e) {
        var footer = document.getElementById('lv-export-footer');
        var soqlContainer = document.getElementById('lv-soql-container');
        var soqlOutput = document.getElementById('lv-soql-output');

        if (footer) footer.style.display = e.target.value ? 'block' : 'none';
        if (soqlContainer) soqlContainer.style.display = 'none';
        if (soqlOutput) soqlOutput.value = '';
        saveState();
    };
}

var btnCopyLvSoql = document.getElementById('btnCopyLvSoql');
if (btnCopyLvSoql) {
    btnCopyLvSoql.addEventListener('click', async function() {
        var lvId = document.getElementById('lv-dropdown')?.value;
        var objInput = document.getElementById('lv-object-input')?.value;
        var soqlContainer = document.getElementById('lv-soql-container');
        var soqlOutput = document.getElementById('lv-soql-output');

        var obj = appState.objects.find(function(o) {
            return o && (o.label === objInput || o.name === objInput);
        });
        var apiName = (obj && obj.name) ? obj.name : objInput;

        if (!lvId) {
            alert('Please select a List View first.');
            return;
        }

        try {
            var query = await fetchListViewSoqlQuery(apiName, lvId);
            if (soqlOutput) soqlOutput.value = query;
            if (soqlContainer) soqlContainer.style.display = 'block';
            performCopy(query, 'btnCopyLvSoql');
            saveState();
        } catch (err) {
            alert('SOQL generation failed: ' + err.message);
        }
    });
}

// --- 4. GLOBAL CLICK LISTENER (Fixes the "null" and "not defined" errors) ---
document.addEventListener('click', async function(e) {
    if (e.target.id === 'btnInspectorExportLV') {
        document.getElementById('btnInspector').click();  // Trigger main Inspector
    }
});


async function callToolingApi(query) {
    // Reuse the session established at init (handles setup/visualforce/file.force.com host mapping);
    // re-deriving the cookie from the active tab here misses those host variants and sends a stale/wrong sid.
    if (!appState.org.accessToken || !appState.org.instanceUrl) {
        throw new Error("Session not found. Please log in to Salesforce.");
    }

    const endpoint = `${appState.org.instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(query)}`;

    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${appState.org.accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data[0]?.message || "API Request Failed");
    }
    return data;
}




const btnReset = document.getElementById('btnReconnect');
if (btnReset) {
    btnReset.onclick = async function () {
        console.log('🔄 Starting full reset...');
        
        // Show feedback
        btnReset.innerText = 'Resetting...';
        btnReset.disabled = true;
        
        try {
            clearTimeout(saveTimeout);
            saveTimeout = null;

            // 1. Clear AppState
            appState.selectedFields.clear();
            appState.fields = [];
            appState.flows = [];
            appState.flowsLoaded = false;
            appState.flowsLoadPromise = null;
            appState.objectManager = {
                selectedObject: null,
                activeSection: 'Details',
                items: [],
                cache: {}
            };
            lastFieldFinderObject = null;
            plainTextForCopy = '';
            
            // 2. Clear ALL text and search inputs
            const inputs = [
                'objInput', 'fieldSearchInput', 'formulaInput', 
                'flowSearchInput',
                'vr-name', 'vr-object', 'vr-message',
                'lv-object-input', 'lv-dropdown', 'lv-soql-output',
                'profileSearchInput', 'permSetSearchInput'
            ];
            
            inputs.forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            
            // 3. Clear ALL visible result lists and containers
            const containers = [
                'results',           // Field Finder results
                'formulaOutput',     // Formula Styler output
                'flowResults',       // Flow results
                'vr-results',        // Validation Rules results
                'profileLinks',      // Profile links
                'permSetLinks',      // Permission Set links
                'lv-soql-output',    // List View SOQL preview
                'turboList'          // Flow turbo list
            ];
            
            containers.forEach(function(id) {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = '';
                    // Hide output wrappers
                    if (id === 'formulaOutput') {
                        const wrapper = document.getElementById('stylerOutputWrapper');
                        if (wrapper) wrapper.style.display = 'none';
                    }
                }
            });

            const flowResults = document.getElementById('flowResults');
            if (flowResults) {
                flowResults.innerHTML = '<div class="empty-state"><p>No results to display. Start by searching above.</p></div>';
            }

            const flowList = document.getElementById('flowList');
            if (flowList) flowList.innerHTML = '';

            const flowTypeahead = typeaheadControllers.get('flowSearchInput');
            flowTypeahead?.hide?.();
            
            // 4. Reset ALL action bars and buttons
            const actionElements = [
                'fieldActions',
                'btnInspector', 
                'btnCopyFormula',
                'lv-dropdown-container',
                'lv-export-footer',
                'lv-soql-container'
            ];
            
            actionElements.forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            
            // 5. Uncheck all checkboxes
            const selectAll = document.getElementById('selectAll');
            if (selectAll) selectAll.checked = false;
            
            document.querySelectorAll('.field-checkbox').forEach(function(checkbox) {
                checkbox.checked = false;
            });
            
            // 6. ⭐ CLEAR CHROME STORAGE (State Persistence)
            await chrome.storage.local.remove(STATE_PERSISTENCE.storageKey);
            console.log('✅ Cleared saved state from storage');
            
            // 7. ⭐ CLEAR ANY OTHER CACHES
            if (typeof clearSavedState === 'function') {
                await clearSavedState();
            }
            
            // 8. Reset to first tab (Field Finder)
            document.querySelectorAll('.tab-btn').forEach(function(tab) {
                tab.classList.remove('active');
            });
            
            const firstTab = document.getElementById('tabFields');
            if (firstTab) firstTab.classList.add('active');
            
            document.querySelectorAll('.view').forEach(function(view) {
                view.style.display = 'none';
            });
            
            const fieldView = document.getElementById('fieldView');
            if (fieldView) fieldView.style.display = 'block';

            resetObjectManagerState();

            activateFlowSubTab('flowSearchContainer', false);
            
            console.log('✅ Full Reset Completed!');
            
            // Show success message briefly
            btnReset.innerText = 'Reset ✓';
            setTimeout(function() {
                btnReset.innerText = 'Reset';
                btnReset.disabled = false;
            }, 1000);
            
        } catch (error) {
            console.error('❌ Reset error:', error);
            btnReset.innerText = 'Reset Failed';
            setTimeout(function() {
                btnReset.innerText = 'Reset';
                btnReset.disabled = false;
            }, 2000);
        }
    };
}

// ============================================================================
// STATE PERSISTENCE - Keep Your Work When Switching Tabs!
// ============================================================================
// Drop this code into your popup.js to save/restore state automatically
// ============================================================================

// Configuration
const STATE_PERSISTENCE = {
    enabled: true,
    storageKey: 'sfMetadataNavState',
    saveDelay: 500,  // Debounce saves
    features: {
        fieldFinder: true,
        formulaStyler: true,
        flows: true,
        validationRules: true,
        listViews: true,
        profiles: true,
        permissionSets: true
    }
};

let saveTimeout = null;

// ============================================================================
// SAVE STATE TO CHROME STORAGE
// ============================================================================

function saveState() {
    if (!STATE_PERSISTENCE.enabled) return;
    
    // Debounce saves
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            const state = {
                timestamp: Date.now(),
                activeTab: getActiveTab(),
                fieldFinder: STATE_PERSISTENCE.features.fieldFinder ? getFieldFinderState() : null,
                formulaStyler: STATE_PERSISTENCE.features.formulaStyler ? getFormulaStylerState() : null,
                flows: STATE_PERSISTENCE.features.flows ? getFlowsState() : null,
                validationRules: STATE_PERSISTENCE.features.validationRules ? getValidationRulesState() : null,
                listViews: STATE_PERSISTENCE.features.listViews ? getListViewsState() : null,
                profiles: STATE_PERSISTENCE.features.profiles ? getProfilesState() : null,
                permissionSets: STATE_PERSISTENCE.features.permissionSets ? getPermissionSetsState() : null,
                favorites: Array.from(appState.favorites.objects)
            };
            
            await chrome.storage.local.set({ [STATE_PERSISTENCE.storageKey]: state });
            console.log('💾 State saved:', state.activeTab);
            
        } catch (err) {
            console.warn('Failed to save state:', err);
        }
    }, STATE_PERSISTENCE.saveDelay);
}

// ============================================================================
// RESTORE STATE FROM CHROME STORAGE
// ============================================================================

async function restoreState(restoreToken = restoreController.activeToken, options = {}) {
    if (!STATE_PERSISTENCE.enabled) return;
    if (!isRestoreActive(restoreToken)) return;
    
    try {
        const result = await chrome.storage.local.get(STATE_PERSISTENCE.storageKey);
        const state = result[STATE_PERSISTENCE.storageKey];
        if (!isRestoreActive(restoreToken)) return;
        
        if (!state) {
            console.log('No saved state found');
            renderObjectManagerSummary();
            return;
        }
        
        // Check if state is recent (within last 30 minutes)
        const age = Date.now() - state.timestamp;
        if (age > 30 * 60 * 1000) {
            console.log('Saved state is too old, ignoring');
            renderObjectManagerSummary();
            return;
        }
        
        console.log('🔄 Restoring state:', state.activeTab);
        
        // Restore active tab
        if (!options.skipObjectManager && state.activeTab && isRestoreActive(restoreToken)) {
            switchToTab(state.activeTab);
        }
        
        // Restore each feature's state
        if (!options.skipObjectManager && state.fieldFinder && isRestoreActive(restoreToken)) restoreFieldFinderState(state.fieldFinder, restoreToken);
        if (state.formulaStyler) restoreFormulaStylerState(state.formulaStyler);
        if (state.flows && isRestoreActive(restoreToken)) restoreFlowsState(state.flows);
        if (state.validationRules && isRestoreActive(restoreToken)) restoreValidationRulesState(state.validationRules);
        if (state.listViews && isRestoreActive(restoreToken)) restoreListViewsState(state.listViews);
        if (state.profiles && isRestoreActive(restoreToken)) restoreProfilesState(state.profiles);
        if (state.permissionSets && isRestoreActive(restoreToken)) restorePermissionSetsState(state.permissionSets);
        if (!isRestoreActive(restoreToken)) return;
        if (!appState.objectManager.selectedObject) {
            renderObjectManagerSummary();
        }
        hideAllTypeaheads();
        if (!options.skipObjectManager) cancelPendingRestore();
        
        console.log('✅ State restored successfully');
        
    } catch (err) {
        console.warn('Failed to restore state:', err);
    }
}

// ============================================================================
// GET STATE FOR EACH FEATURE
// ============================================================================

function getActiveTab() {
    const activeTab = document.querySelector('.tab-btn.active');
    return activeTab ? activeTab.id : null;
}

function getFieldFinderState() {
    const objInput = document.getElementById('objInput');
    const fieldSearchInput = document.getElementById('fieldSearchInput');
    const selectedObject = appState.objectManager.selectedObject;
    
    return {
        objectName: objInput?.value || '',
        sectionFilter: fieldSearchInput?.value || '',
        activeSection: appState.objectManager.activeSection || 'Details',
        selectedObject: selectedObject ? {
            id: selectedObject.id,
            name: selectedObject.name,
            label: selectedObject.label
        } : null
    };
}

function getFormulaStylerState() {
    const formulaInput = document.getElementById('formulaInput');
    const formulaOutput = document.getElementById('formulaOutput');
    
    return {
        formula: formulaInput?.value || '',
        hasOutput: formulaOutput && formulaOutput.innerHTML.trim().length > 0,
        outputHtml: formulaOutput?.innerHTML || ''
    };
}

function getFlowsState() {
    const flowSearchInput = document.getElementById('flowSearchInput');
    const flowResults = document.getElementById('flowResults');
    const flowSearch = flowSearchInput?.value || '';
    const hasSelectedFlow = Boolean(String(flowSearch).trim()) && Boolean(appState.selectedFlow?.DeveloperName);
    
    const activeSubTab = document.querySelector('#flowsView .flow-toolbar .sub-tab.active');
    const activeView = activeSubTab?.dataset.target || 'flowSearchContainer';
    
    return {
        flowSearch,
        activeView: activeView,
        hasResults: flowResults && flowResults.innerHTML.trim().length > 0,
        resultsHtml: flowResults?.innerHTML || '',
        selectedFlow: hasSelectedFlow ? { ...appState.selectedFlow } : null
    };
}

function getValidationRulesState() {
    const vrName = document.getElementById('vr-name');
    const vrObject = document.getElementById('vr-object');
    const vrMessage = document.getElementById('vr-message');
    const vrResults = document.getElementById('vr-results');
    
    return {
        name: vrName?.value || '',
        object: vrObject?.value || '',
        message: vrMessage?.value || '',
        hasResults: vrResults && vrResults.innerHTML.trim().length > 0,
        resultsHtml: vrResults?.innerHTML || ''
    };
}

function getListViewsState() {
    const lvObjectInput = document.getElementById('lv-object-input');
    const lvDropdown = document.getElementById('lv-dropdown');
    const lvSoqlOutput = document.getElementById('lv-soql-output');
    
    return {
        object: lvObjectInput?.value || '',
        selectedView: lvDropdown?.value || '',
        dropdownHtml: lvDropdown?.innerHTML || '',
        query: lvSoqlOutput?.value || ''
    };
}

function getProfilesState() {
    const profileSearchInput = document.getElementById('profileSearchInput');
    const profileLinks = document.getElementById('profileLinks');
    
    return {
        search: profileSearchInput?.value || '',
        hasResults: profileLinks && profileLinks.innerHTML.trim().length > 0,
        resultsHtml: profileLinks?.innerHTML || ''
    };
}

function getPermissionSetsState() {
    const permSetSearchInput = document.getElementById('permSetSearchInput');
    const permSetLinks = document.getElementById('permSetLinks');
    
    return {
        search: permSetSearchInput?.value || '',
        hasResults: permSetLinks && permSetLinks.innerHTML.trim().length > 0,
        resultsHtml: permSetLinks?.innerHTML || ''
    };
}

// ============================================================================
// RESTORE STATE FOR EACH FEATURE
// ============================================================================

function switchToTab(tabId) {
    const tab = document.getElementById(tabId);
    if (!tab) return;
    
    // Remove active from all tabs
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    
    // Add active to this tab
    tab.classList.add('active');
    
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    
    // Show corresponding view
    const viewMap = {
        'tabFields': 'fieldView',
        'tabFormula': 'formulaView',
        'tabFlows': 'flowsView',
        'validation-search-tab': 'validationView',
        'btnOpenLVTab': 'listViewView',
        'tabProfiles': 'profileView',
        'tabPermSets': 'permSetView',
        'tabOrgLimits': 'orgLimitsView'
    };
    
    const viewId = viewMap[tabId];
    if (viewId) {
        const view = document.getElementById(viewId);
        if (view) view.style.display = 'block';
    }
}

function restoreFieldFinderState(state, restoreToken = 0) {
    const objInput = document.getElementById('objInput');
    const fieldSearchInput = document.getElementById('fieldSearchInput');
    
    if (objInput) {
        objInput.value = state.objectName;
        if (String(state.objectName || '').trim()) {
            markRestoredTypeaheadValue(objInput);
        }
    }
    if (fieldSearchInput) fieldSearchInput.value = state.sectionFilter || '';
    appState.selectedFields.clear();
    appState.fields = [];
    lastFieldFinderObject = state.objectName || null;

    if (!state.objectName || !objInput || typeof objInput.oninput !== 'function' || (restoreToken && !isRestoreActive(restoreToken))) {
        resetObjectManagerState();
        return;
    }

    Promise.resolve(objInput.oninput({ target: objInput }))
        .then(() => {
            if (restoreToken && !isRestoreActive(restoreToken)) return;
            return loadObjectManagerSection(state.activeSection || 'Details', { force: true, restoreToken });
        })
        .then(() => {
            if (restoreToken && !isRestoreActive(restoreToken)) return;
            if (fieldSearchInput && state.sectionFilter) {
                fieldSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        })
        .catch((error) => {
            console.warn('Failed to restore Object Manager state:', error);
            resetObjectManagerState('Unable to restore the previous object selection. Search for an object to continue.');
        });
}

function wireInteractiveContent(container) {
    if (!container) return;

    container.querySelectorAll('a[data-open-url], a[data-url], a.vr-rule-name').forEach(anchor => {
        if (anchor.dataset.boundOpenLink === 'true') return;

        anchor.dataset.boundOpenLink = 'true';
        const openLinkedTarget = (event) => {
            const target = event.currentTarget;
            const targetUrl = target.dataset.openUrl || target.dataset.url || target.href;
            if (!targetUrl || targetUrl === '#') return;

            event.preventDefault();
            openTabNextToActive(targetUrl);
        };

        anchor.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            anchor.dataset.skipNextClickOpen = 'true';
            openLinkedTarget(event);
        });

        anchor.addEventListener('click', (event) => {
            if (anchor.dataset.skipNextClickOpen === 'true') {
                anchor.dataset.skipNextClickOpen = 'false';
                event.preventDefault();
                return;
            }
            openLinkedTarget(event);
        });
    });
}

function restoreFormulaStylerState(state) {
    const formulaInput = document.getElementById('formulaInput');
    const formulaOutput = document.getElementById('formulaOutput');
    const stylerOutputWrapper = document.getElementById('stylerOutputWrapper');
    
    if (formulaInput) formulaInput.value = state.formula;
    
    if (state.hasOutput && formulaOutput && stylerOutputWrapper) {
        formulaOutput.innerHTML = state.outputHtml;
        stylerOutputWrapper.style.display = 'block';
    }
}

function restoreFlowsState(state) {
    const flowSearchInput = document.getElementById('flowSearchInput');
    const flowResults = document.getElementById('flowResults');
    const restoredFlowSearch = String(state.flowSearch || '').trim();
    
    if (flowSearchInput) {
        flowSearchInput.value = state.flowSearch;
        if (restoredFlowSearch) {
            markRestoredTypeaheadValue(flowSearchInput);
        }
    }

    activateFlowSubTab(state.activeView === 'flowSearchContainer' ? 'flowSearchContainer' : 'flowSearchContainer', false);

    if (restoredFlowSearch && state.selectedFlow) {
        setSelectedFlow(state.selectedFlow);
    } else {
        clearSelectedFlow();
    }
    
    if (state.hasResults && flowResults) {
        flowResults.innerHTML = state.resultsHtml;
        wireInteractiveContent(flowResults);
        
        // Re-attach click handlers to flow cards
        flowResults.querySelectorAll('.flow-card, [onclick]').forEach(card => {
            card.onclick = function() {
                const flowId = this.dataset.flowId || this.getAttribute('data-flow-id');
                if (flowId) {
                    const url = `${getLightningBaseUrl()}/builder_platform_interaction/flowBuilder.app?flowId=${flowId}`;
                    openTabNextToActive(url);
                }
            };
        });
    }
}

const footerIssueLink = document.getElementById('footerIssueLink');
if (footerIssueLink) {
    footerIssueLink.addEventListener('click', (event) => {
        event.preventDefault();
        openTabNextToActive(footerIssueLink.href);
    });
}

const footerVersion = document.getElementById('footerVersion');
if (footerVersion && chrome?.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    footerVersion.textContent = `v${manifest.version || ''}`;
}

function restoreValidationRulesState(state) {
    const vrName = document.getElementById('vr-name');
    const vrObject = document.getElementById('vr-object');
    const vrMessage = document.getElementById('vr-message');
    const vrResults = document.getElementById('vr-results');
    
    if (vrName) vrName.value = state.name;
    if (vrObject) {
        vrObject.value = state.object;
        if (String(state.object || '').trim()) {
            markRestoredTypeaheadValue(vrObject);
        }
    }
    if (vrMessage) vrMessage.value = state.message;
    
    if (state.hasResults && vrResults) {
        vrResults.innerHTML = state.resultsHtml;
        wireInteractiveContent(vrResults);
    }
}

function restoreListViewsState(state) {
    const lvObjectInput = document.getElementById('lv-object-input');
    const lvDropdown = document.getElementById('lv-dropdown');
    const lvDropdownContainer = document.getElementById('lv-dropdown-container');
    const lvExportFooter = document.getElementById('lv-export-footer');
    const lvSoqlContainer = document.getElementById('lv-soql-container');
    const lvSoqlOutput = document.getElementById('lv-soql-output');
    
    if (lvObjectInput) {
        lvObjectInput.value = state.object;
        if (String(state.object || '').trim()) {
            markRestoredTypeaheadValue(lvObjectInput);
        }
    }
    
    if (state.dropdownHtml && lvDropdown) {
        lvDropdown.innerHTML = state.dropdownHtml;
        lvDropdown.value = state.selectedView;
        if (lvDropdownContainer) lvDropdownContainer.style.display = 'block';
    }

    if (lvExportFooter) lvExportFooter.style.display = state.selectedView ? 'block' : 'none';
    if (lvSoqlOutput) lvSoqlOutput.value = state.query || '';
    if (lvSoqlContainer) lvSoqlContainer.style.display = state.query ? 'block' : 'none';
}

function restoreProfilesState(state) {
    const profileSearchInput = document.getElementById('profileSearchInput');
    const profileLinks = document.getElementById('profileLinks');
    
    if (profileSearchInput) {
        profileSearchInput.value = state.search;
        if (String(state.search || '').trim()) {
            markRestoredTypeaheadValue(profileSearchInput);
        }
    }
    
    if (state.hasResults && profileLinks) {
        profileLinks.innerHTML = state.resultsHtml;
        wireInteractiveContent(profileLinks);
    }
}

function restorePermissionSetsState(state) {
    const permSetSearchInput = document.getElementById('permSetSearchInput');
    const permSetLinks = document.getElementById('permSetLinks');
    
    if (permSetSearchInput) {
        permSetSearchInput.value = state.search;
        if (String(state.search || '').trim()) {
            markRestoredTypeaheadValue(permSetSearchInput);
        }
    }
    
    if (state.hasResults && permSetLinks) {
        permSetLinks.innerHTML = state.resultsHtml;
        wireInteractiveContent(permSetLinks);
    }
}

// ============================================================================
// HELPER FUNCTION - Update Inspector Button
// ============================================================================

function updateInspectorButtonVisibility() {
    const inspectorBtn = document.getElementById('btnInspector');
    if (!inspectorBtn) return;
    
    const count = appState.selectedFields.size;
    if (count > 0) {
        inspectorBtn.style.display = 'block';
        inspectorBtn.textContent = `Open ${count} field${count > 1 ? 's' : ''} in Setup`;
    } else {
        inspectorBtn.style.display = 'none';
    }
}

// ============================================================================
// AUTO-SAVE ON CHANGES
// ============================================================================

function setupAutoSave() {
    // Save state whenever user interacts with inputs
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.addEventListener('input', saveState);
        input.addEventListener('change', saveState);
    });
    
    // Save when tabs are clicked
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', saveState);
    });
    
    // Save when sub-tabs are clicked
    const subTabs = document.querySelectorAll('#flowsView .flow-toolbar .sub-tab');
    subTabs.forEach(tab => {
        tab.addEventListener('click', saveState);
    });
    
    console.log('✅ Auto-save enabled');
}

// ============================================================================
// CLEAR SAVED STATE
// ============================================================================

async function clearSavedState() {
    await chrome.storage.local.remove(STATE_PERSISTENCE.storageKey);
    console.log('🗑️ Saved state cleared');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Add to your existing window.onload or initialization code:
/*

window.onload = async () => {
    // Your existing initialization code...
    
    // NEW: Restore previous state
    await restoreState();
    
    // NEW: Enable auto-save
    setupAutoSave();
};

// NEW: Save state before popup closes
window.addEventListener('beforeunload', () => {
    saveState();
});

*/

console.log('✅ State Persistence module loaded');
console.log('💾 Your work will be preserved when opening links!');
// ============================================================================
// ORG LIMITS DASHBOARD
// ============================================================================

function getOrgLimitPriorityGroups() {
    return [
        {
            name: 'API Usage',
            limits: [
                'DailyApiRequests',
                'DailyAsyncApexExecutions',
                'DailyBulkApiRequests',
                'DailyDurableStreamingApiEvents',
                'DailyGenericStreamingApiEvents'
            ]
        },
        {
            name: 'Storage',
            limits: [
                'DataStorageMB',
                'FileStorageMB'
            ]
        },
        {
            name: 'Metadata & Setup',
            limits: [
                'DailyWorkflowEmails',
                'SingleEmail',
                'MassEmail',
                'PermissionSets',
                'ActiveScratchOrgs',
                'DailyScratchOrgs'
            ]
        }
    ];
}

// Initialize Org Limits Tab
function initOrgLimitsTab() {
    const tab = document.getElementById('tabOrgLimits');
    if (!tab) return;
    
    tab.addEventListener('click', async () => {
        // Switch to org limits view
        switchToView('orgLimitsView');
        
        // Load limits if not already loaded
        if (!orgLimitsData) {
            await loadOrgLimits();
        }
    });
    
    // Refresh button
    const btnRefresh = document.getElementById('btnRefreshLimits');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            await loadOrgLimits();
        });
    }

    const searchInput = document.getElementById('limitsSearchInput');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener('input', () => {
            if (orgLimitsData) displayOrgLimits(orgLimitsData);
        });
        searchInput.dataset.bound = 'true';
    }

    const severityFilter = document.getElementById('limitsSeverityFilter');
    if (severityFilter && !severityFilter.dataset.bound) {
        severityFilter.addEventListener('change', () => {
            if (orgLimitsData) displayOrgLimits(orgLimitsData);
        });
        severityFilter.dataset.bound = 'true';
    }
    
    console.log('✅ Org Limits tab initialized');
}

// Load Org Limits from Salesforce
async function loadOrgLimits() {
    const loading = document.getElementById('limitsLoading');
    const results = document.getElementById('limitsResults');
    const lastUpdated = document.getElementById('limitsLastUpdated');
    
    if (!loading || !results) return;
    
    try {
        // Show loading
        loading.style.display = 'block';
        results.innerHTML = '';
        
        console.log('📊 Fetching org limits...');
        
        // Fetch limits from Salesforce REST API
        const response = await fetch(
            `${appState.org.instanceUrl}/services/data/v60.0/limits`,
            {
                headers: {
                    'Authorization': `Bearer ${appState.org.accessToken}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        orgLimitsData = await response.json();
        
        console.log('✅ Org limits loaded:', orgLimitsData);
        
        // Hide loading
        loading.style.display = 'none';
        
        // Update timestamp
        if (lastUpdated) {
            lastUpdated.innerText = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
        
        // Display limits
        displayOrgLimits(orgLimitsData);
        
    } catch (error) {
        console.error('❌ Error loading org limits:', error);
        loading.style.display = 'none';
        results.innerHTML = `
            <div class="empty-state" style="padding:20px; text-align:center;">
                <p style="color:#d32f2f; font-size:12px;">Error loading limits: ${error.message}</p>
            </div>
        `;
    }
}

// Display Org Limits
function displayOrgLimits(limits) {
    const results = document.getElementById('limitsResults');
    const summary = document.getElementById('limitsSummary');
    const searchTerm = (document.getElementById('limitsSearchInput')?.value || '').trim().toLowerCase();
    const severityFilter = document.getElementById('limitsSeverityFilter')?.value || 'all';
    if (!results) return;

    const entries = Object.entries(limits || {})
        .filter(([, limit]) => limit && typeof limit.Max === 'number' && typeof limit.Remaining === 'number')
        .map(([key, limit]) => {
            const max = limit.Max;
            const remaining = limit.Remaining;
            const used = Math.max(0, max - remaining);
            const percentage = max > 0 ? Math.round((used / max) * 100) : 0;
            const severity = getLimitSeverity(percentage);
            const displayName = formatLimitName(key);
            return { key, displayName, max, remaining, used, percentage, severity };
        });

    renderOrgLimitsSummary(summary, entries);

    const filteredEntries = entries.filter(entry => {
        const matchesSearch = !searchTerm || `${entry.key} ${entry.displayName}`.toLowerCase().includes(searchTerm);
        const matchesSeverity = severityFilter === 'all' || entry.severity === severityFilter;
        return matchesSearch && matchesSeverity;
    });

    const categories = buildOrgLimitCategories(filteredEntries);
    
    let html = '';
    
    categories.forEach(category => {
        if (!category.limits.length) return;
        html += `<div class="limit-category" style="margin-bottom:20px;">`;
        html += `<h4 style="font-size:12px; color:#0176d3; margin:0 0 8px 0; padding-bottom:4px; border-bottom:2px solid #0176d3;">${category.name}</h4>`;
        
        category.limits.forEach(limit => {
            const colors = getLimitColors(limit.severity);
            html += renderLimitItem(limit.displayName, limit.used, limit.remaining, limit.max, limit.percentage, colors.barColor, colors.textColor);
        });
        
        html += `</div>`;
    });

    if (!html) {
        html = `
            <div class="empty-state" style="padding:20px; text-align:center; background:#fff; border:1px solid #dddbda; border-radius:4px;">
                <p style="font-size:12px; color:#666; margin:0;">No limits match the current filter.</p>
            </div>
        `;
    }
    
    results.innerHTML = html;
}

function renderOrgLimitsSummary(container, entries) {
    if (!container) return;

    const critical = entries.filter(entry => entry.severity === 'critical').length;
    const warning = entries.filter(entry => entry.severity === 'warning').length;
    const healthy = entries.filter(entry => entry.severity === 'healthy').length;
    const highest = entries.reduce((top, entry) => Math.max(top, entry.percentage), 0);

    const cards = [
        { label: 'Critical', value: critical, bg: '#fef0f0', color: '#ba0517' },
        { label: 'Warning', value: warning, bg: '#fff7e6', color: '#a15c00' },
        { label: 'Healthy', value: healthy, bg: '#edf9f1', color: '#2e844a' },
        { label: 'Highest Usage', value: `${highest}%`, bg: '#eef4ff', color: '#0b5cab' }
    ];

    container.innerHTML = cards.map(card => `
        <div style="background:${card.bg}; border:1px solid #dddbda; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:700; color:${card.color}; line-height:1;">${card.value}</div>
            <div style="font-size:10px; color:#666; margin-top:4px; text-transform:uppercase; letter-spacing:0.04em;">${card.label}</div>
        </div>
    `).join('');
}

function buildOrgLimitCategories(entries) {
    const grouped = [];
    const usedKeys = new Set();

    getOrgLimitPriorityGroups().forEach(group => {
        const groupEntries = group.limits
            .map(key => entries.find(entry => entry.key === key))
            .filter(Boolean)
            .sort(sortOrgLimitsByRisk);

        group.limits.forEach(key => usedKeys.add(key));
        grouped.push({ name: group.name, limits: groupEntries });
    });

    const remaining = entries
        .filter(entry => !usedKeys.has(entry.key))
        .sort(sortOrgLimitsByRisk);

    if (remaining.length) {
        grouped.push({ name: 'Additional Limits', limits: remaining });
    }

    return grouped;
}

function sortOrgLimitsByRisk(a, b) {
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    return a.displayName.localeCompare(b.displayName);
}

function getLimitSeverity(percentage) {
    if (percentage >= 80) return 'critical';
    if (percentage >= 60) return 'warning';
    return 'healthy';
}

function getLimitColors(severity) {
    if (severity === 'critical') return { barColor: '#d32f2f', textColor: '#d32f2f' };
    if (severity === 'warning') return { barColor: '#ff9800', textColor: '#ff9800' };
    return { barColor: '#2e844a', textColor: '#2e844a' };
}

function formatLimitName(name) {
    return String(name || '').replace(/([A-Z])/g, ' $1').trim();
}

// Render Individual Limit Item
function renderLimitItem(name, used, remaining, max, percentage, barColor, textColor) {
    // Format large numbers
    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    };
    
    // Clean up limit name (remove camelCase, add spaces)
    const displayName = name.replace(/([A-Z])/g, ' $1').trim();
    
    return `
        <div class="limit-item" style="margin-bottom:12px; padding:10px; background:#fff; border:1px solid #dddbda; border-radius:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:11px; font-weight:bold; color:#3e3e3c;">${displayName}</span>
                <span style="font-size:11px; color:${textColor}; font-weight:bold;">${percentage}%</span>
            </div>
            
            <!-- Progress Bar -->
            <div style="width:100%; background:#f3f3f3; height:8px; border-radius:4px; overflow:hidden; margin-bottom:6px;">
                <div style="width:${percentage}%; height:100%; background:${barColor}; transition:width 0.3s ease;"></div>
            </div>
            
            <!-- Usage Details -->
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#666;">
                <span>Used: <b style="color:#3e3e3c;">${formatNumber(used)}</b></span>
                <span>Remaining: <b style="color:#3e3e3c;">${formatNumber(remaining)}</b></span>
                <span>Max: <b style="color:#3e3e3c;">${formatNumber(max)}</b></span>
            </div>
        </div>
    `;
}

// ============================================================================
// PERMISSION SET COMPARATOR
// ============================================================================

// Initialize Permission Set Comparator Tab
function initPermSetComparatorTab() {
    const button = document.getElementById('btnOpenPermSetManagerInline');
    if (!button) return;
    
    button.addEventListener('click', (event) => {
        event.preventDefault();
        chrome.runtime.sendMessage({ type: 'open_permset_manager' });
    });

    console.log('✅ Permission Set Manager launcher initialized');
}

// Helper: Switch to View
function switchToView(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    
    // Remove active from all tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected view
    const view = document.getElementById(viewId);
    if (view) {
        view.style.display = 'block';
    }
    
    // Map view to tab
    const viewToTab = {
        'orgLimitsView': 'tabOrgLimits',
        'fieldView': 'tabFields',
        'formulaView': 'tabFormula',
        'flowsView': 'tabFlows',
        'validationView': 'validation-search-tab',
        'listViewView': 'btnOpenLVTab',
        'profileView': 'tabProfiles',
        'permSetView': 'tabPermSets'
    };
    
    const tabId = viewToTab[viewId];
    if (tabId) {
        const tab = document.getElementById(tabId);
        if (tab) tab.classList.add('active');
    }
}

function switchTab(tabName) {
  const map = {
    field: 'tabFields',
    formula: 'tabFormula',
    flow: 'tabFlows'
  };
  const tabId = map[tabName];
  if (tabId) {
    const tab = document.getElementById(tabId);
    if (tab) tab.click();
  }
}

console.log('✅ Org Limits and Permission Set Comparator modules loaded');
