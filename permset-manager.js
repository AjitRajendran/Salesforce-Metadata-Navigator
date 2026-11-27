(() => {
  /* ─────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────── */
  const state = {
    auth: null,
    permissionSets: [],   // all PS from org
    selected: [],         // PS objects with .details loaded
    comparison: null,
    systemPermissionMetadata: [],
    comparePresets: [],
    pendingChanges: [],
    editMode: false,
    collapsedFieldObjects: new Set(),
    directory: {
      loaded: { groups: false, queues: false },
      loadPromises: { groups: null, queues: null },
      mode: 'groups',
      groups: [],
      queues: [],
      selectedId: null,
      candidates: [],
      queueableObjects: [],
      queueableObjectsLoaded: false,
      searchTimer: null
    },
    catalogs: {
      objects: [],
      objectMap: new Map(),
      fieldMaps: new Map(),
      fieldPermissionLoadPromise: null,
      fieldPermissionObjectLoadPromises: new Map(),
      fieldPermissionObjectsLoaded: new Set(),
      fieldLoadPromise: null,
      access: {
        apexClassRows: [],
        visualforceRows: [],
        customPermissionRows: [],
        flowAccessRows: [],
        assignedAppRows: [],
        connectedAppRows: [],
        setupAccessRows: []
      },
      accessMaps: {
        apexClassRows: new Map(),
        visualforceRows: new Map(),
        customPermissionRows: new Map(),
        flowAccessRows: new Map(),
        assignedAppRows: new Map(),
        connectedAppRows: new Map(),
        setupAccessRows: new Map()
      },
      loaded: false
    }
  };

  const refs = {};
  const COMPARE_PRESETS_STORAGE_KEY = 'permset_manager_compare_presets';

  const OBJECT_PERMS = [
    'PermissionsRead',
    'PermissionsCreate',
    'PermissionsEdit',
    'PermissionsDelete',
    'PermissionsViewAllRecords',
    'PermissionsModifyAllRecords'
  ];

  const OBJECT_PERM_LABELS = {
    PermissionsRead: 'Read',
    PermissionsCreate: 'Create',
    PermissionsEdit: 'Edit',
    PermissionsDelete: 'Delete',
    PermissionsViewAllRecords: 'View All',
    PermissionsModifyAllRecords: 'Modify All'
  };

  const OBJECT_PERM_SHORT_LABELS = ['R', 'C', 'E', 'D', 'VA', 'MA'];

  const APP_PERMISSION_NAMES = new Set([
    'PermissionsAccessConversationEntries',
    'PermissionsAuthorApex',
    'PermissionsApiEnabled',
    'PermissionsCustomizeApplication',
    'PermissionsEditBillingInfo',
    'PermissionsEditCaseComments',
    'PermissionsEditPublicFilters',
    'PermissionsFreezeUsers',
    'PermissionsImportSolutions',
    'PermissionsManageAuthProviders',
    'PermissionsManageBusinessHoursHolidays',
    'PermissionsManageCallCenters',
    'PermissionsManageCases',
    'PermissionsManageCategories',
    'PermissionsManageCertificates',
    'PermissionsManageConnectedApps',
    'PermissionsManageCustomPermissions',
    'PermissionsManageCustomerUsers',
    'PermissionsManageDataCategories',
    'PermissionsManageDashboards',
    'PermissionsManageDynamicDashboards',
    'PermissionsManageExternalConnections',
    'PermissionsManageExternalUsers',
    'PermissionsManageInternalUsers',
    'PermissionsManageLoginAccessPolicies',
    'PermissionsManageMacrosUsersCantUndo',
    'PermissionsManageNamedCredentials',
    'PermissionsManageNetworks',
    'PermissionsManageProfilesPermissionsets',
    'PermissionsManagePublishedSolutions',
    'PermissionsManageReports',
    'PermissionsManageRoles',
    'PermissionsManageSandboxes',
    'PermissionsManageSharing',
    'PermissionsModifyAllData',
    'PermissionsResetPasswords',
    'PermissionsRunMacrosOnMultipleRecords',
    'PermissionsTransferCases',
    'PermissionsViewAllData',
    'PermissionsViewSetup'
  ]);

  const APP_PERMISSION_LABELS = new Set([
    'Access Conversation Entries',
    'Access Orchestration Objects',
    'Access to view Data Assessment',
    'Access Contact Intelligence View in Partner Sites',
    'Access Lead Intelligence View in Partner Sites',
    'Author Apex',
    'API Enabled',
    'Agentforce Service Agent User',
    'Agent Initiated Outbound Messaging',
    'Activate Contracts',
    'Activate Orders',
    'Allow View Knowledge',
    'Archive Articles',
    'Article Translation - Edit',
    'Article Translation - Publish',
    'Article Translation - Submit for Translation',
    'Automated Deal Tracking',
    'Campaign Influence',
    'Customize Application',
    'Convert Leads',
    'Delete Activated Contracts',
    'Delete Salesforce Files',
    'Download Malicious Files',
    'Edit Billing Information',
    'Edit Case Comments',
    'Edit Activated Orders',
    'Edit Public Filters',
    'Enable System Mode Flow Activation',
    'End Messaging Session',
    'Enhanced Chat Rep',
    'Freeze Users',
    'Import Solutions',
    'Import Leads',
    'Import Personal Contacts',
    'Initiate Messaging Sessions',
    'Inbox Scheduling Proxy User',
    'IP Restrict Requests',
    'Knowledge One',
    'Manage Auth Providers',
    'Manage Agentforce Service Agents',
    'Manage Business Hours Holidays',
    'Manage Call Centers',
    'Manage Cases',
    'Manage Categories',
    'Manage Certificates',
    'Manage Connected Apps',
    'Manage Content Permissions',
    'Manage Content Properties',
    'Manage record types and layouts for Files',
    'Manage Custom Permissions',
    'Manage Customer Users',
    'Manage Data Categories',
    'Manage Dashboards',
    'Manage Dynamic Dashboards',
    'Manage External Connections',
    'Manage External Users',
    'Manage External Users (Limited)',
    'Manage Flow',
    'Manage Internal Users',
    'Manage Knowledge Article Import/Export',
    'Manage Salesforce Knowledge',
    'Manage Salesforce CRM Content',
    'Manage Content Taxonomy',
    'Manage Login Access Policies',
    'Manage Macros Users Can\'t Undo',
    'Manage Named Credentials',
    'Manage Networks',
    'Manage Orchestration Runs',
    'Manage Orchestration Runs and Work Items',
    'Manage Profiles and Permission Sets',
    'Manage Profiles Permissionsets',
    'Manage Published Solutions',
    'Manage Reports',
    'Manage Roles',
    'Manage Sandboxes',
    'Manage Sharing',
    'Manage Articles',
    'Modify All Data',
    'Message on Mobile',
    'Partner EAC User',
    'Partner Relationship Management',
    'PRM Enhanced Portal User',
    'Publish Articles',
    'Query All Files',
    'Query Non Vetoed Files',
    'Reassign Orchestration Work Items',
    'Reset User Passwords and Unlock',
    'Reset Passwords',
    'Run Macros on Multiple Records',
    'Run Flows',
    'Sales Console',
    'Send Initial SMS Message to Individual',
    'Send Stay-in-Touch Requests',
    'Set Up Partner Connect for a Partner Org',
    'Manage Channel Marketing Eligibility',
    'Share internal Knowledge articles externally',
    'Start Messaging Sessions',
    'Transfer Cases',
    'Transfer Leads',
    'Translate Enhanced Conversations',
    'View All Data',
    'View All Activities',
    'View Archived Articles',
    'View Archived Files',
    'View Channel Management Console',
    'View Channel Marketing Eligibility',
    'View Content in Portals',
    'View Content Taxonomy',
    'View Draft Articles',
    'View Flow Usage and Flow Event Data',
    'View Orchestrations in Automation App',
    'View Setup and Configuration',
    'View Setup',
    'View and Edit Converted Leads',
    'Use Einstein Activity Capture',
    'Use Einstein Activity Capture Standard',
    'Use Inbox',
    'Use Team Reassignment Wizards',
    'Write with AI',
    'Allows the Cloud Integration User to perform SalesforceIQ internal operations',
    'Access Conversation Entries',
    'Access to view Data Assessment',
    'Campaign Influence',
    'Delete Activated Contracts',
    'Delete Salesforce Files',
    'Partner EAC User',
    'View All Activities',
    'View and Edit Converted Leads',
    'Allow users to access Sales Console',
    'Access to view Data Assessment',
    'Delete Activated Contracts',
    'Delete Salesforce Files',
    'Query All Files',
    'View and send translated messages in enhanced Messaging channels'
  ]);
  const permsetApi = window.PermsetApi;
  const fieldPermissionRules = window.PermsetFieldPermissionRules;

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindRefs();
    bindEvents();
    showLoading('Connecting to Salesforce…');

    try {
      if (!permsetApi) {
        throw new Error('Permission set API module failed to load.');
      }
      state.auth = await getPermsetAuth();
      const currentUser = await getCurrentUserContext();
      refs.userContext.textContent = currentUser?.displayName || currentUser?.username || '';
      refs.orgContext.textContent = state.auth.hostname;
      setStatus('Loading permission sets…', 'info');

      await loadPermissionSets();
      await loadComparePresets();
      setStatus(`Ready — ${getPermissionSourceSummary()} loaded. Select 1 to edit or 2 to 4 to compare.`, 'success');
    } catch (e) {
      refs.orgContext.textContent = 'Connection failed';
      setStatus('Could not connect: ' + e.message, 'error');
      console.error('Init failed:', e);
    } finally {
      hideLoading();
    }
  }

  /* ─────────────────────────────────────────────
     AUTH / FETCH
  ───────────────────────────────────────────── */
  async function getPermsetAuth(forceRefresh = false) {
    return permsetApi.getAuth(forceRefresh);
  }

  async function getCurrentUserContext() {
    return permsetApi.getCurrentUserContext();
  }

  async function getSupportedApiVersion(preferLatest = false) {
    if (typeof permsetApi.getSupportedApiVersion === 'function') {
      return permsetApi.getSupportedApiVersion(preferLatest);
    }
    return 'v60.0';
  }

  /* ─────────────────────────────────────────────
     PERMISSION SET DATA
  ───────────────────────────────────────────── */
  async function loadPermissionSets() {
    const { records } = await permsetApi.loadPermissionSets();
    state.permissionSets = records || [];
    refs.permSetOptionsList.innerHTML = state.permissionSets
      .map(ps => `<option value="${escapeHtml(getSelectionValue(ps))}"></option>`)
      .join('');
  }

  function getSelectionValue(record) {
    return String(record?.selectionLabel || record?.Label || record?.Name || '').trim();
  }

  function getSourceType(record) {
    return record?.sourceType || (record?.IsOwnedByProfile ? 'Profile' : 'Permission Set');
  }

  function getPermissionSourceSummary() {
    const profileCount = state.permissionSets.filter(record => getSourceType(record) === 'Profile').length;
    const permissionSetCount = state.permissionSets.length - profileCount;
    return `${profileCount} profiles and ${permissionSetCount} permission sets`;
  }

  function getSourceTypeSlug(record) {
    return getSourceType(record).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function getSourceTypeRank(record) {
    return getSourceType(record) === 'Profile' ? 0 : 1;
  }

  function getDisplayLabel(record) {
    return String(record?.displayLabel || record?.Label || record?.Name || '').trim();
  }

  function getDisplayLabelWithType(record) {
    const label = getDisplayLabel(record);
    const sourceType = getSourceType(record);
    return label ? `${label} (${sourceType})` : sourceType;
  }

  function sortSelectedRecords(records) {
    return [...records].sort((left, right) => {
      const rankDiff = getSourceTypeRank(left) - getSourceTypeRank(right);
      if (rankDiff !== 0) return rankDiff;
      return getDisplayLabel(left).localeCompare(getDisplayLabel(right));
    });
  }

  async function readComparePresets() {
    if (!chrome?.storage?.local) return [];
    const stored = await chrome.storage.local.get(COMPARE_PRESETS_STORAGE_KEY);
    return Array.isArray(stored?.[COMPARE_PRESETS_STORAGE_KEY]) ? stored[COMPARE_PRESETS_STORAGE_KEY] : [];
  }

  async function writeComparePresets(presets) {
    if (!chrome?.storage?.local) return;
    await chrome.storage.local.set({ [COMPARE_PRESETS_STORAGE_KEY]: presets });
  }

  async function loadComparePresets() {
    state.comparePresets = await readComparePresets();
    renderPresetOptions();
  }

  function renderPresetOptions() {
    if (!refs.presetSelect) return;
    refs.presetSelect.innerHTML = [
      '<option value="">Saved compare presets…</option>',
      ...state.comparePresets
        .slice()
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
        .map(preset => `<option value="${escapeHtml(preset.name)}">${escapeHtml(preset.name)} (${(preset.labels || []).length})</option>`)
    ].join('');
    updatePresetControls();
  }

  function updatePresetControls() {
    const presetName = String(refs.presetName?.value || '').trim();
    const selectedPresetName = String(refs.presetSelect?.value || '').trim();
    const selectedLabels = getSelectedLabels();
    if (refs.btnApplyPreset) refs.btnApplyPreset.disabled = !selectedPresetName;
    if (refs.btnDeletePreset) refs.btnDeletePreset.disabled = !selectedPresetName;
    if (refs.btnSavePreset) refs.btnSavePreset.disabled = !presetName || selectedLabels.length < 1;
  }

  async function applySelectedPreset() {
    const presetName = String(refs.presetSelect?.value || '').trim();
    const preset = state.comparePresets.find(item => item.name === presetName);
    if (!preset) return;
    ['permSet1', 'permSet2', 'permSet3', 'permSet4'].forEach((id, index) => {
      if (refs[id]) refs[id].value = preset.labels?.[index] || '';
    });
    updatePickerState();
    setStatus(`Applied preset ${preset.name}.`, 'info');
  }

  async function saveCurrentPreset() {
    const presetName = String(refs.presetName?.value || '').trim();
    const labels = getSelectedLabels();
    if (!presetName || !labels.length) return;
    state.comparePresets = [
      ...state.comparePresets.filter(item => item.name !== presetName),
      { name: presetName, labels }
    ];
    await writeComparePresets(state.comparePresets);
    if (refs.presetName) refs.presetName.value = '';
    renderPresetOptions();
    setStatus(`Saved preset ${presetName}.`, 'success');
  }

  async function deleteSelectedPreset() {
    const presetName = String(refs.presetSelect?.value || '').trim();
    if (!presetName) return;
    state.comparePresets = state.comparePresets.filter(item => item.name !== presetName);
    await writeComparePresets(state.comparePresets);
    renderPresetOptions();
    setStatus(`Deleted preset ${presetName}.`, 'info');
  }

  async function getPermissionSetPermissionFields() {
    return permsetApi.getPermissionSetPermissionFields();
  }

  async function getPermissionSetPermissionMetadata() {
    return permsetApi.getPermissionSetPermissionMetadata();
  }

  function applySystemPermissionMetadataToComparison() {
    if (!state.comparison) return;

    const metadata = Array.isArray(state.systemPermissionMetadata) ? state.systemPermissionMetadata : [];
    if (!metadata.length) return;

    const allPermissionRows = metadata.map(field => ({
      key: field.name,
      label: field.label || field.name,
      description: field.description || '',
      queryable: field.queryable !== false,
      values: state.selected.map(ps => !!ps?.details?.userPermissions?.[field.name])
    }));
    state.comparison.appPermissionRows = allPermissionRows.filter(row => isAppPermissionName(row.key, row.label));
    state.comparison.systemRows = allPermissionRows.filter(row => !isAppPermissionName(row.key, row.label));
  }

  function normalizePermissionLabel(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function isAppPermissionName(name, label) {
    if (APP_PERMISSION_NAMES.has(String(name || ''))) return true;
    const normalizedLabel = normalizePermissionLabel(label);
    return Array.from(APP_PERMISSION_LABELS).some(appLabel => normalizePermissionLabel(appLabel) === normalizedLabel);
  }

  async function fetchPermissionSetDetails(permSetId, options) {
    return permsetApi.fetchPermissionSetDetails(permSetId, options);
  }

  async function fetchPermissionSetFieldPermissionsForObject(permSetId, objectApiName, options) {
    return permsetApi.fetchPermissionSetFieldPermissionsForObject(permSetId, objectApiName, options);
  }

  async function loadObjectCatalog() {
    return permsetApi.loadObjectCatalog();
  }

  async function loadAccessCatalogs() {
    return permsetApi.loadAccessCatalogs();
  }

  async function loadFieldCatalog(objectApiNames) {
    return permsetApi.loadFieldCatalog(objectApiNames);
  }

  /* ─────────────────────────────────────────────
     PATCH / CREATE
  ───────────────────────────────────────────── */
  async function patchRecord(sobjectName, recordId, body) {
    return permsetApi.patchRecord(sobjectName, recordId, body);
  }

  async function createRecord(sobjectName, body) {
    return permsetApi.createRecord(sobjectName, body);
  }

  async function compositeBatch(batchRequests, haltOnError = false) {
    return permsetApi.compositeBatch(batchRequests, haltOnError);
  }

  async function deleteRecord(sobjectName, recordId) {
    return permsetApi.deleteRecord(sobjectName, recordId);
  }

  async function loadGroupQueueDirectory(mode = state.directory.mode, force = false) {
    const key = mode === 'queues' ? 'queues' : 'groups';
    if (state.directory.loaded[key] && !force) {
      setStatus(`Showing ${state.directory[key].length} ${key === 'queues' ? 'cached queues' : 'cached public groups'}.`, 'info');
      return;
    }
    if (state.directory.loadPromises[key]) return state.directory.loadPromises[key];

    const label = key === 'queues' ? 'queues' : 'public groups';
    showLoading(`Loading ${label}...`);
    setStatus(`Loading ${label}...`, 'info');
    state.directory.loadPromises[key] = (async () => {
      const items = await permsetApi.loadGroupQueueDirectory(key);
      state.directory[key] = items || [];
      state.directory.loaded[key] = true;
      if (state.directory.selectedId && !state.directory[key].some(item => item.Id === state.directory.selectedId)) {
        state.directory.selectedId = null;
      }
      renderDirectoryList();
      renderDirectoryEditor();
      if (state.directory.mode === key) {
        setStatus(`Loaded ${state.directory[key].length} ${key === 'queues' ? 'queues' : 'public groups'}.`, 'success');
      }
    })();

    try {
      await state.directory.loadPromises[key];
    } catch (error) {
      if (state.directory.mode === key) {
        setStatus(`Could not load ${key === 'queues' ? 'queues' : 'public groups'}: ${error.message}`, 'error');
      }
    } finally {
      state.directory.loadPromises[key] = null;
      if (!state.directory.loadPromises.groups && !state.directory.loadPromises.queues) hideLoading();
    }
  }

  function getVisibleDirectoryItems() {
    return state.directory[state.directory.mode] || [];
  }

  function getSelectedDirectoryItem() {
    return getVisibleDirectoryItems().find(item => item.Id === state.directory.selectedId) || null;
  }

  function switchWorkspace(mode) {
    const isCompare = mode === 'compare';
    const isDependencies = mode === 'dependencies';
    state.directory.mode = mode === 'queues' ? 'queues' : 'groups';

    refs.btnWorkspaceCompare?.classList.toggle('active', isCompare);
    refs.btnWorkspaceGroups?.classList.toggle('active', mode === 'groups');
    refs.btnWorkspaceQueues?.classList.toggle('active', mode === 'queues');
    refs.btnWorkspaceDependencies?.classList.toggle('active', isDependencies);
    refs.dependenciesPanel?.classList.toggle('psm-hidden', !isDependencies);
    refs.directoryPanel?.classList.toggle('psm-hidden', isCompare || isDependencies);

    if (isCompare) {
      refs.pickerPanel?.classList.toggle('psm-hidden', !!state.comparison);
      refs.summaryBar?.classList.toggle('psm-hidden', !state.comparison);
      refs.compareContext?.classList.toggle('psm-hidden', !state.comparison);
      refs.tabsBar?.classList.toggle('psm-hidden', !state.comparison);
      refs.comparisonPanel?.classList.toggle('psm-hidden', !state.comparison);
      setStatus(`${getPermissionSourceSummary()} available. Select 1 to edit or 2 to 4 to compare.`, 'info');
      return;
    }

    [refs.pickerPanel, refs.summaryBar, refs.compareContext, refs.tabsBar, refs.comparisonPanel]
      .forEach(element => element?.classList.add('psm-hidden'));
    if (isDependencies) {
      void loadDependencyObjects();
      return;
    }
    state.directory.selectedId = null;
    if (refs.directoryFilter) refs.directoryFilter.value = '';
    renderDirectory();
    void loadGroupQueueDirectory(state.directory.mode);
  }

  let dependencyObjectsLoaded = false;
  let dependencyRequest = 0;
  let dependencyRows = [];
  let activeDependencyType = 'all';

  function renderDependencyResults() {
    const objectName = refs.dependencyObject.value;
    const fieldName = refs.dependencyField.value;
    const types = [...new Set(dependencyRows.map(row => row.MetadataComponentType || 'Unknown'))];
    const selectedType = activeDependencyType === 'all' || types.includes(activeDependencyType) ? activeDependencyType : 'all';
    const visibleRows = selectedType === 'all' ? dependencyRows : dependencyRows.filter(row => (row.MetadataComponentType || 'Unknown') === selectedType);
    const typeLabels = { ApexClass: 'Apex Classes', ApexPage: 'Visualforce Pages', ApexTrigger: 'Apex Triggers', Flow: 'Flows', Layout: 'Page Layouts', ValidationRule: 'Validation Rules' };
    refs.dependencyTabs.innerHTML = [{ type: 'all', label: 'All', count: dependencyRows.length }, ...types.map(type => ({
      type, label: typeLabels[type] || type, count: dependencyRows.filter(row => (row.MetadataComponentType || 'Unknown') === type).length
    }))].map(tab => `<button type="button" aria-pressed="${tab.type === selectedType}" class="psm-dependency-tab${tab.type === selectedType ? ' active' : ''}" data-dependency-type="${escapeHtml(tab.type)}">${escapeHtml(tab.label)} <span>${tab.count}</span></button>`).join('');
    refs.dependencyResults.innerHTML = `<p>${dependencyRows.length} reported component${dependencyRows.length === 1 ? '' : 's'} reference ${escapeHtml(objectName)}.${escapeHtml(fieldName)}.</p>` +
      (dependencyRows.length
        ? `<div class="psm-table-wrap"><table><thead><tr><th>Component type</th><th>Component name</th><th>Metadata ID</th></tr></thead><tbody>${visibleRows.map(row =>
            `<tr><td>${escapeHtml(row.MetadataComponentType || 'Unknown')}</td><td>${escapeHtml(row.MetadataComponentName || '')}</td><td>${escapeHtml(row.MetadataComponentId || '')}</td></tr>`
          ).join('')}</tbody></table></div>`
        : '<p>No references reported. This does not mean the field is safe to delete.</p>');
  }

  function exportFieldDependencies() {
    if (!dependencyRows.length || !refs.dependencyField.value) return;
    const csvCell = value => {
      const text = String(value ?? '');
      const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const objectName = refs.dependencyObject.value;
    const fieldName = refs.dependencyField.value;
    const rows = [
      ['Object API Name', 'Field API Name', 'Component Type', 'Component Name', 'Metadata ID'],
      ...dependencyRows.map(row => [objectName, fieldName, row.MetadataComponentType || '', row.MetadataComponentName || '', row.MetadataComponentId || ''])
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `field-dependencies-${objectName}-${fieldName}.csv`.replace(/[^a-zA-Z0-9._-]/g, '_');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function loadDependencyObjects() {
    if (dependencyObjectsLoaded) return;
    refs.dependencyResults.textContent = 'Loading objects...';
    try {
      const objects = await permsetApi.loadObjectCatalog();
      refs.dependencyObject.innerHTML = '<option value="">Select an object</option>' + objects
        .map(object => `<option value="${escapeHtml(object.key)}">${escapeHtml(object.label)} (${escapeHtml(object.key)})</option>`).join('');
      dependencyObjectsLoaded = true;
      refs.dependencyResults.textContent = 'Select an object and field to inspect references.';
    } catch (error) {
      refs.dependencyResults.textContent = `Could not load objects: ${error.message}`;
    }
  }

  async function loadDependencyFields() {
    const objectName = refs.dependencyObject.value;
    const request = ++dependencyRequest;
    dependencyRows = [];
    refs.dependencyTabs.innerHTML = '';
    refs.btnExportDependencies.disabled = true;
    refs.dependencyField.disabled = true;
    refs.dependencyField.innerHTML = '<option value="">Select a field</option>';
    refs.dependencyResults.textContent = objectName ? 'Loading fields...' : 'Select an object and field to inspect references.';
    if (!objectName) return;

    try {
      const catalog = await permsetApi.loadFieldCatalog([objectName]);
      if (request !== dependencyRequest) return;
      const fields = (catalog.get(objectName) || []).filter(field => field.custom);
      refs.dependencyField.innerHTML += fields.map(field =>
        `<option value="${escapeHtml(field.fieldApiName)}">${escapeHtml(field.label)} (${escapeHtml(field.fieldApiName)})</option>`
      ).join('');
      refs.dependencyField.disabled = !fields.length;
      refs.dependencyResults.textContent = fields.length ? 'Select a custom field to inspect references.' : 'No custom fields found for this object.';
    } catch (error) {
      if (request === dependencyRequest) refs.dependencyResults.textContent = `Could not load fields: ${error.message}`;
    }
  }

  async function loadSelectedFieldDependencies() {
    const objectName = refs.dependencyObject.value;
    const fieldName = refs.dependencyField.value;
    const request = ++dependencyRequest;
    dependencyRows = [];
    refs.dependencyTabs.innerHTML = '';
    refs.btnExportDependencies.disabled = true;
    refs.dependencyResults.textContent = fieldName ? 'Loading reported references...' : 'Select a custom field to inspect references.';
    if (!fieldName) return;

    try {
      const rows = await permsetApi.loadFieldDependencies(objectName, fieldName);
      if (request !== dependencyRequest) return;
      const unique = [...new Map(rows.map(row => [
        `${row.MetadataComponentType}:${row.MetadataComponentId || row.MetadataComponentName}`,
        row
      ])).values()].sort((left, right) =>
        String(left.MetadataComponentType || '').localeCompare(String(right.MetadataComponentType || '')) ||
        String(left.MetadataComponentName || '').localeCompare(String(right.MetadataComponentName || ''))
      );
      dependencyRows = unique;
      activeDependencyType = 'all';
      refs.btnExportDependencies.disabled = !unique.length;
      renderDependencyResults();
    } catch (error) {
      if (request === dependencyRequest) refs.dependencyResults.textContent = `Could not load dependencies: ${error.message}`;
    }
  }

  function renderDirectory() {
    const isQueue = state.directory.mode === 'queues';
    if (refs.directoryEyebrow) refs.directoryEyebrow.textContent = isQueue ? 'Record ownership' : 'Org access';
    if (refs.directoryTitle) refs.directoryTitle.textContent = isQueue ? 'Queues' : 'Public Groups';
    if (refs.directoryFilter) refs.directoryFilter.placeholder = isQueue ? 'Filter queues...' : 'Filter groups...';
    renderDirectoryList();
    renderDirectoryEditor();
  }

  function renderDirectoryList() {
    if (!refs.directoryList) return;
    const filter = String(refs.directoryFilter?.value || '').trim().toLowerCase();
    const items = getVisibleDirectoryItems().filter(item =>
      [item.Name, item.DeveloperName].some(value => String(value || '').toLowerCase().includes(filter))
    );

    refs.directoryList.innerHTML = items.length
      ? items.map(item => `
          <button type="button" class="psm-directory-item${item.Id === state.directory.selectedId ? ' active' : ''}" data-directory-id="${escapeHtml(item.Id)}">
            <strong>${escapeHtml(item.Name)}</strong>
            <span>${item.detailsLoaded
              ? `${item.members.length} member${item.members.length === 1 ? '' : 's'}${item.Type === 'Queue' ? ` · ${item.queueObjects.length} object${item.queueObjects.length === 1 ? '' : 's'}` : ''}`
              : item.Type === 'Queue' ? 'Open to view members and objects' : 'Open to view members'}</span>
          </button>
        `).join('')
      : '<div class="psm-empty"><div class="psm-empty-text">No matching items.</div></div>';

    refs.directoryList.querySelectorAll('[data-directory-id]').forEach(button => {
      button.addEventListener('click', () => {
        void selectDirectoryItem(button.dataset.directoryId);
      });
    });
  }

  function renderDirectoryEditor() {
    const item = getSelectedDirectoryItem();
    refs.directoryEmpty?.classList.toggle('psm-hidden', !!item);
    refs.directoryEditor?.classList.toggle('psm-hidden', !item);
    if (!item) return;

    refs.directoryTypeBadge.textContent = item.Type === 'Queue' ? 'Queue' : 'Public Group';
    refs.directoryItemName.textContent = item.Name;
    refs.directoryItemApiName.textContent = item.DeveloperName || '';
    const setupBase = String(state.auth?.instanceUrl || '')
      .replace('.sandbox.my.salesforce.com', '.sandbox.my.salesforce-setup.com')
      .replace('.my.salesforce.com', '.my.salesforce-setup.com');
    const setupPage = item.Type === 'Queue' ? 'Queues' : 'PublicGroups';
    const setupAddress = item.Type === 'Queue'
      ? `/p/own/Queue/d?id=${item.Id}`
      : `/setup/own/groupdetail.jsp?id=${item.Id}`;
    refs.directorySetupLink.href = `${setupBase}/lightning/setup/${setupPage}/page?address=${encodeURIComponent(setupAddress)}`;
    refs.directoryMemberCount.textContent = item.detailsLoaded
      ? `${item.members.length} member${item.members.length === 1 ? '' : 's'}`
      : item.detailsLoading ? 'Loading details...' : 'Details not loaded';
    refs.queueObjectsSection?.classList.toggle('psm-hidden', item.Type !== 'Queue');

    refs.directoryMembersBody.innerHTML = !item.detailsLoaded
      ? '<tr><td colspan="3">Select this item to load its members.</td></tr>'
      : item.members.length
      ? item.members.map(member => `
          <tr>
            <td>${formatPrimarySecondaryCell(member.label, member.UserOrGroupId)}</td>
            <td>${escapeHtml(member.memberType)}</td>
            <td><button type="button" class="psm-btn psm-btn-ghost psm-directory-remove" data-member-id="${escapeHtml(member.Id)}">Remove</button></td>
          </tr>
        `).join('')
      : emptyTableHtml('No members in this item.');

    const queueableObjects = state.directory.queueableObjects;
    refs.queueObjectOptions.innerHTML = queueableObjects
      .filter(candidate => !item.queueObjects.some(existing => existing.SobjectType === candidate.apiName))
      .map(candidate => `<option value="${escapeHtml(candidate.apiName)}">${escapeHtml(candidate.label)}</option>`)
      .join('');
    refs.queueObjectsList.innerHTML = item.queueObjects.length
      ? item.queueObjects.map(queueObject => `
          <span class="psm-directory-tag">
            ${escapeHtml(queueObject.SobjectType)}
            <button type="button" data-queue-object-id="${escapeHtml(queueObject.Id)}" aria-label="Remove ${escapeHtml(queueObject.SobjectType)}">×</button>
          </span>
        `).join('')
      : '<span class="psm-cell-secondary">No supported objects assigned.</span>';
    updateDirectoryAddControls();
  }

  async function selectDirectoryItem(itemId) {
    state.directory.selectedId = itemId;
    state.directory.candidates = [];
    if (refs.directoryMemberSearch) refs.directoryMemberSearch.value = '';
    if (refs.queueObjectSearch) refs.queueObjectSearch.value = '';
    const item = getSelectedDirectoryItem();
    if (!item) return;

    renderDirectory();
    if (item.detailsLoaded || item.detailsLoading) return;

    item.detailsLoading = true;
    renderDirectoryEditor();
    try {
      const details = await permsetApi.loadGroupQueueDetails(item.Id, item.Type === 'Queue');
      item.members = details.members || [];
      item.queueObjects = details.queueObjects || [];
      item.detailsLoaded = true;
      let queueCatalogError = null;
      if (item.Type === 'Queue' && !state.directory.queueableObjectsLoaded) {
        try {
          state.directory.queueableObjects = await permsetApi.loadQueueableObjects();
          state.directory.queueableObjectsLoaded = true;
        } catch (error) {
          queueCatalogError = error;
        }
      }
      if (getSelectedDirectoryItem()?.Id === item.Id) {
        if (queueCatalogError) {
          setStatus(`Loaded queue details, but available object types could not be loaded: ${queueCatalogError.message}`, 'warn');
        } else if (item.Type === 'Queue' && !state.directory.queueableObjects.length) {
          setStatus(`Loaded queue details for ${item.Name}, but Salesforce returned no queueable object types.`, 'warn');
        } else {
          setStatus(`Loaded ${item.Type === 'Queue' ? 'queue' : 'public group'} details: ${item.Name}.`, 'info');
        }
      }
    } catch (error) {
      if (getSelectedDirectoryItem()?.Id === item.Id) {
        setStatus(`Could not load ${item.Type === 'Queue' ? 'queue' : 'group'} details: ${error.message}`, 'error');
      }
    } finally {
      item.detailsLoading = false;
      if (getSelectedDirectoryItem()?.Id === item.Id) {
        renderDirectoryList();
        renderDirectoryEditor();
      }
    }
  }

  function getDirectoryCandidateValue(candidate) {
    return `${candidate.label} (${candidate.type}) - ${candidate.id}`;
  }

  function handleDirectoryMemberSearch() {
    window.clearTimeout(state.directory.searchTimer);
    const term = String(refs.directoryMemberSearch?.value || '').trim();
    const exactCandidate = state.directory.candidates.find(candidate => getDirectoryCandidateValue(candidate) === term);
    if (exactCandidate) {
      updateDirectoryAddControls();
      return;
    }

    state.directory.candidates = [];
    if (refs.directoryMemberOptions) refs.directoryMemberOptions.innerHTML = '';
    updateDirectoryAddControls();
    if (term.length < 2) return;

    state.directory.searchTimer = window.setTimeout(async () => {
      try {
        const item = getSelectedDirectoryItem();
        state.directory.candidates = await permsetApi.searchGroupQueueCandidates(term, item?.Id || '');
        refs.directoryMemberOptions.innerHTML = state.directory.candidates
          .map(candidate => `<option value="${escapeHtml(getDirectoryCandidateValue(candidate))}"></option>`)
          .join('');
        updateDirectoryAddControls();
      } catch (error) {
        setStatus(`Could not search members: ${error.message}`, 'error');
      }
    }, 300);
  }

  function updateDirectoryAddControls() {
    const item = getSelectedDirectoryItem();
    const candidateValue = String(refs.directoryMemberSearch?.value || '');
    const candidate = state.directory.candidates.find(entry => getDirectoryCandidateValue(entry) === candidateValue);
    const alreadyMember = !!candidate && !!item?.members.some(member => member.UserOrGroupId === candidate.id);
    if (refs.btnAddDirectoryMember) refs.btnAddDirectoryMember.disabled = !item || !candidate || alreadyMember;

    const objectApiName = String(refs.queueObjectSearch?.value || '').trim();
    const queueableObjects = state.directory.queueableObjects;
    const validObject = queueableObjects.some(candidateObject => candidateObject.apiName === objectApiName);
    const alreadySupported = !!item?.queueObjects.some(queueObject => queueObject.SobjectType === objectApiName);
    if (refs.btnAddQueueObject) refs.btnAddQueueObject.disabled = item?.Type !== 'Queue' || !validObject || alreadySupported;
  }

  async function addDirectoryMember() {
    const item = getSelectedDirectoryItem();
    const value = String(refs.directoryMemberSearch?.value || '');
    const candidate = state.directory.candidates.find(entry => getDirectoryCandidateValue(entry) === value);
    if (!item || !candidate) return;

    try {
      refs.btnAddDirectoryMember.disabled = true;
      const result = await createRecord('GroupMember', { GroupId: item.Id, UserOrGroupId: candidate.id });
      item.members.push({
        Id: result.id,
        GroupId: item.Id,
        UserOrGroupId: candidate.id,
        label: candidate.label,
        memberType: candidate.type
      });
      refs.directoryMemberSearch.value = '';
      state.directory.candidates = [];
      renderDirectory();
      setStatus(`${candidate.label} was added to ${item.Name}.`, 'success');
    } catch (error) {
      setStatus(`Could not add member: ${error.message}`, 'error');
      updateDirectoryAddControls();
    }
  }

  async function removeDirectoryMember(memberId) {
    const item = getSelectedDirectoryItem();
    const member = item?.members.find(entry => entry.Id === memberId);
    if (!item || !member || !window.confirm(`Remove ${member.label} from ${item.Name}?`)) return;

    try {
      await deleteRecord('GroupMember', memberId);
      item.members = item.members.filter(entry => entry.Id !== memberId);
      renderDirectory();
      setStatus(`${member.label} was removed from ${item.Name}.`, 'success');
    } catch (error) {
      setStatus(`Could not remove member: ${error.message}`, 'error');
    }
  }

  async function addQueueObject() {
    const item = getSelectedDirectoryItem();
    const objectApiName = String(refs.queueObjectSearch?.value || '').trim();
    if (!item || item.Type !== 'Queue' || !objectApiName) return;

    try {
      refs.btnAddQueueObject.disabled = true;
      const result = await createRecord('QueueSobject', { QueueId: item.Id, SobjectType: objectApiName });
      item.queueObjects.push({ Id: result.id, QueueId: item.Id, SobjectType: objectApiName });
      refs.queueObjectSearch.value = '';
      renderDirectory();
      setStatus(`${objectApiName} was added to ${item.Name}.`, 'success');
    } catch (error) {
      setStatus(`Could not add queue object: ${error.message}`, 'error');
      updateDirectoryAddControls();
    }
  }

  async function removeQueueObject(queueObjectId) {
    const item = getSelectedDirectoryItem();
    const queueObject = item?.queueObjects.find(entry => entry.Id === queueObjectId);
    if (!item || !queueObject || !window.confirm(`Remove ${queueObject.SobjectType} from ${item.Name}?`)) return;

    try {
      await deleteRecord('QueueSobject', queueObjectId);
      item.queueObjects = item.queueObjects.filter(entry => entry.Id !== queueObjectId);
      renderDirectory();
      setStatus(`${queueObject.SobjectType} was removed from ${item.Name}.`, 'success');
    } catch (error) {
      setStatus(`Could not remove queue object: ${error.message}`, 'error');
    }
  }

  /* ─────────────────────────────────────────────
     DOM BINDINGS
  ───────────────────────────────────────────── */
  function bindRefs() {
    const ids = [
      'userContext', 'orgContext', 'loadingOverlay', 'loadingLabel', 'statusBanner', 'psgRestrictionNotice', 'saveSummaryModal', 'saveSummaryPanel', 'btnCloseSaveSummary',
      'savePreviewModal', 'savePreviewPanel', 'btnCloseSavePreview', 'btnCancelSavePreview', 'btnConfirmSavePreview',
        'btnCompare', 'btnExportCsv', 'btnEditMode', 'btnApplyChanges', 'btnCancelEdit', 'btnClearPending', 'btnResetCompare',
      'btnOpenInline',
      'btnCompareInline',
      'btnWorkspaceCompare', 'btnWorkspaceGroups', 'btnWorkspaceQueues', 'btnWorkspaceDependencies',
      'dependenciesPanel', 'dependencyObject', 'dependencyField', 'dependencyTabs', 'dependencyResults', 'btnExportDependencies',
      'directoryPanel', 'directoryEyebrow', 'directoryTitle', 'btnRefreshDirectory', 'directoryFilter', 'directoryList',
      'directoryEmpty', 'directoryEditor', 'directoryTypeBadge', 'directoryItemName', 'directoryItemApiName', 'directoryMemberCount',
      'directorySetupLink',
      'directoryMemberSearch', 'directoryMemberOptions', 'btnAddDirectoryMember', 'directoryMembersBody',
      'queueObjectsSection', 'queueObjectSearch', 'queueObjectOptions', 'btnAddQueueObject', 'queueObjectsList',
      'presetSelect', 'presetName', 'btnApplyPreset', 'btnDeletePreset', 'btnSavePreset',
      'btnCollapseFields',
      'permSet1', 'permSet2', 'permSet3', 'permSet4', 'permSetOptionsList',
      'permSet1Link', 'permSet2Link', 'permSet3Link', 'permSet4Link',
      'objectAddRow', 'objectAddSearch', 'btnAddObject', 'objectCatalogList',
      'fieldObjectAddRow', 'fieldObjectAddSearch', 'btnAddFieldObject',
      'apexAddRow', 'apexAddSearch', 'btnAddApex', 'apexOptionsList',
      'vfAddRow', 'vfAddSearch', 'btnAddVf', 'vfOptionsList',
      'custPermAddRow', 'custPermAddSearch', 'btnAddCustPerm', 'custPermOptionsList',
      'assignedAppsAddRow', 'assignedAppsAddSearch', 'btnAddAssignedApp', 'assignedAppsOptionsList',
      'connectedAppsAddRow', 'connectedAppsAddSearch', 'btnAddConnectedApp', 'connectedAppsOptionsList',
      'setupAddRow', 'setupAddSearch', 'btnAddSetup', 'setupOptionsList',
      'pickerPanel', 'summaryBar', 'compareContext', 'tabsBar', 'comparisonPanel',
      'objectTable', 'fieldTable', 'appPermissionsTable', 'systemTable',
      'apexClassTable', 'visualforceTable', 'customPermissionTable', 'assignedAppsTable', 'connectedAppsTable', 'setupAccessTable', 'flowAccessTable',
      'changesTable',
      'objectFilter', 'fieldFilter', 'appPermissionsFilter', 'systemFilter', 'changesFilter',
      'apexFilter', 'vfFilter', 'custPermFilter', 'assignedAppsFilter', 'connectedAppsFilter', 'setupFilter', 'flowFilter',
      'objectDiffOnly', 'fieldDiffOnly', 'appPermissionsDiffOnly', 'systemDiffOnly', 'apexDiffOnly', 'vfDiffOnly', 'custPermDiffOnly', 'connectedAppsDiffOnly', 'flowDiffOnly', 'assignedAppsDiffOnly', 'setupDiffOnly',
      'cnt-object', 'cnt-field', 'cnt-apppermissions', 'cnt-system', 'cnt-apex', 'cnt-vf', 'cnt-custperm', 'cnt-apps', 'cnt-connectedapps', 'cnt-setup', 'cnt-changes', 'cnt-flow', 'cnt-assignedapps', 'cnt-setupaccess'
    ];
    ids.forEach(id => { refs[id] = document.getElementById(id); });
  }

  function bindEvents() {
    refs.btnCompare?.addEventListener('click', compareSelected);
    refs.btnOpenInline?.addEventListener('click', compareSelected);
    refs.btnCompareInline?.addEventListener('click', compareSelected);
    refs.btnWorkspaceCompare?.addEventListener('click', () => switchWorkspace('compare'));
    refs.btnWorkspaceGroups?.addEventListener('click', () => switchWorkspace('groups'));
    refs.btnWorkspaceQueues?.addEventListener('click', () => switchWorkspace('queues'));
    refs.btnWorkspaceDependencies?.addEventListener('click', () => switchWorkspace('dependencies'));
    refs.dependencyObject?.addEventListener('change', loadDependencyFields);
    refs.dependencyField?.addEventListener('change', loadSelectedFieldDependencies);
    refs.dependencyTabs?.addEventListener('click', event => {
      const tab = event.target.closest('[data-dependency-type]');
      if (!tab) return;
      activeDependencyType = tab.dataset.dependencyType;
      renderDependencyResults();
      refs.dependencyTabs.querySelector('.active')?.focus();
    });
    refs.btnExportDependencies?.addEventListener('click', exportFieldDependencies);
    refs.btnRefreshDirectory?.addEventListener('click', () => loadGroupQueueDirectory(state.directory.mode, true));
    refs.directoryFilter?.addEventListener('input', renderDirectoryList);
    refs.directoryMemberSearch?.addEventListener('input', handleDirectoryMemberSearch);
    refs.directoryMemberSearch?.addEventListener('change', updateDirectoryAddControls);
    refs.btnAddDirectoryMember?.addEventListener('click', addDirectoryMember);
    refs.directoryMembersBody?.addEventListener('click', event => {
      const button = event.target.closest('[data-member-id]');
      if (button) void removeDirectoryMember(button.dataset.memberId);
    });
    refs.queueObjectSearch?.addEventListener('input', updateDirectoryAddControls);
    refs.queueObjectSearch?.addEventListener('change', updateDirectoryAddControls);
    refs.btnAddQueueObject?.addEventListener('click', addQueueObject);
    refs.queueObjectsList?.addEventListener('click', event => {
      const button = event.target.closest('[data-queue-object-id]');
      if (button) void removeQueueObject(button.dataset.queueObjectId);
    });
    refs.btnCollapseFields?.addEventListener('click', toggleCollapseAllFields);
    refs.btnExportCsv?.addEventListener('click', exportCsv);
    refs.btnEditMode?.addEventListener('click', enterEditMode);
    refs.btnApplyChanges?.addEventListener('click', applyChanges);
    refs.btnCloseSavePreview?.addEventListener('click', clearSavePreview);
    refs.btnCancelSavePreview?.addEventListener('click', clearSavePreview);
    refs.btnConfirmSavePreview?.addEventListener('click', confirmApplyChanges);
    refs.btnCancelEdit?.addEventListener('click', cancelEditMode);
    refs.btnClearPending?.addEventListener('click', clearPendingChanges);
    refs.btnResetCompare?.addEventListener('click', resetComparison);
    refs.btnCloseSaveSummary?.addEventListener('click', clearSaveSummary);
    refs.saveSummaryModal?.addEventListener('click', event => {
      if (event.target === refs.saveSummaryModal) clearSaveSummary();
    });
    refs.savePreviewModal?.addEventListener('click', event => {
      if (event.target === refs.savePreviewModal) clearSavePreview();
    });

    refs.objectFilter?.addEventListener('input', renderObjectTable);
    refs.fieldFilter?.addEventListener('input', () => {
      void handleFieldFilterInput();
    });
    refs.systemFilter?.addEventListener('input', renderSystemTable);
    refs.changesFilter?.addEventListener('input', renderChangesTable);
    refs.objectDiffOnly?.addEventListener('change', renderObjectTable);
    refs.fieldDiffOnly?.addEventListener('change', renderFieldTable);
    refs.appPermissionsFilter?.addEventListener('input', renderAppPermissionsTable);
    refs.appPermissionsDiffOnly?.addEventListener('change', renderAppPermissionsTable);
    refs.systemDiffOnly?.addEventListener('change', renderSystemTable);
    refs.apexDiffOnly?.addEventListener('change', () => renderAccessTable('apexClassRows', 'apexClassTable', 'apexFilter'));
    refs.vfDiffOnly?.addEventListener('change', () => renderAccessTable('visualforceRows', 'visualforceTable', 'vfFilter'));
    refs.custPermDiffOnly?.addEventListener('change', () => renderAccessTable('customPermissionRows', 'customPermissionTable', 'custPermFilter'));
    refs.connectedAppsDiffOnly?.addEventListener('change', () => renderAccessTable('connectedAppRows', 'connectedAppsTable', 'connectedAppsFilter'));
    refs.flowDiffOnly?.addEventListener('change', () => renderAccessTable('flowAccessRows', 'flowAccessTable', 'flowFilter'));
    refs.assignedAppsDiffOnly?.addEventListener('change', () => renderAccessTable('assignedAppRows', 'assignedAppsTable', 'assignedAppsFilter'));
    refs.setupDiffOnly?.addEventListener('change', () => renderAccessTable('setupAccessRows', 'setupAccessTable', 'setupFilter'));
    refs.apexFilter?.addEventListener('input', () => renderAccessTable('apexClassRows', 'apexClassTable', 'apexFilter'));
    refs.vfFilter?.addEventListener('input', () => renderAccessTable('visualforceRows', 'visualforceTable', 'vfFilter'));
    refs.custPermFilter?.addEventListener('input', () => renderAccessTable('customPermissionRows', 'customPermissionTable', 'custPermFilter'));
    refs.assignedAppsFilter?.addEventListener('input', () => renderAccessTable('assignedAppRows', 'assignedAppsTable', 'assignedAppsFilter'));
    refs.flowFilter?.addEventListener('input', () => renderAccessTable('flowAccessRows', 'flowAccessTable', 'flowFilter'));
    refs.connectedAppsFilter?.addEventListener('input', () => renderAccessTable('connectedAppRows', 'connectedAppsTable', 'connectedAppsFilter'));
    refs.setupFilter?.addEventListener('input', () => renderAccessTable('setupAccessRows', 'setupAccessTable', 'setupFilter'));

    document.querySelectorAll('.psm-tab').forEach(tab => {
      tab.addEventListener('click', () => activateTab(tab.dataset.target));
    });

    ['permSet1', 'permSet2', 'permSet3', 'permSet4'].forEach(id => {
      refs[id]?.addEventListener('input', updatePickerState);
      refs[id]?.addEventListener('change', updatePickerState);
    });
    refs.presetSelect?.addEventListener('change', updatePresetControls);
    refs.presetName?.addEventListener('input', updatePresetControls);
    refs.btnApplyPreset?.addEventListener('click', applySelectedPreset);
    refs.btnDeletePreset?.addEventListener('click', deleteSelectedPreset);
    refs.btnSavePreset?.addEventListener('click', saveCurrentPreset);

    ['permSet1Link', 'permSet2Link', 'permSet3Link', 'permSet4Link'].forEach(id => {
      refs[id]?.addEventListener('click', event => {
        event.preventDefault();
        const url = event.currentTarget?.dataset?.setupUrl;
        const label = event.currentTarget?.dataset?.label;
        if (!url) return;
        chrome.runtime.sendMessage({ type: 'open_inspector', url });
        if (label) setStatus(`Opened ${label} in Setup.`, 'success');
      });
    });

    bindAddControl('objectAddSearch', 'btnAddObject', addObjectFromCatalog);
    bindAddControl('fieldObjectAddSearch', 'btnAddFieldObject', () => { void loadFieldObjectFromCatalog(); });
    bindAddControl('apexAddSearch', 'btnAddApex', () => addAccessFromCatalog('apexClassRows', 'apexAddSearch'));
    bindAddControl('vfAddSearch', 'btnAddVf', () => addAccessFromCatalog('visualforceRows', 'vfAddSearch'));
    bindAddControl('custPermAddSearch', 'btnAddCustPerm', () => addAccessFromCatalog('customPermissionRows', 'custPermAddSearch'));
    bindAddControl('assignedAppsAddSearch', 'btnAddAssignedApp', () => addAccessFromCatalog('assignedAppRows', 'assignedAppsAddSearch'));
    bindAddControl('connectedAppsAddSearch', 'btnAddConnectedApp', () => addAccessFromCatalog('connectedAppRows', 'connectedAppsAddSearch'));
    bindAddControl('setupAddSearch', 'btnAddSetup', () => addAccessFromCatalog('assignedAppRows', 'setupAddSearch'));

    updatePickerState();
    updatePresetControls();
  }

  function bindAddControl(inputId, buttonId, onAdd) {
    refs[inputId]?.addEventListener('input', updateAddControlState);
    refs[inputId]?.addEventListener('change', updateAddControlState);
    refs[buttonId]?.addEventListener('click', onAdd);
  }

  async function handleFieldFilterInput() {
    if (!state.comparison) return;

    const filterValue = String(refs.fieldFilter?.value || '').trim();
    const objectEntry = resolveFieldObjectEntry(filterValue);
    if (objectEntry && !state.catalogs.fieldMaps.has(objectEntry.key)) {
      await ensureFieldPermissionsLoadedForObject(objectEntry.key, { showOverlay: false });
    } else if (filterValue) {
      await ensureVisibleFieldMetadataLoaded();
    }

    renderFieldTable();
  }

  function getSelectedLabels() {
    return [refs.permSet1.value, refs.permSet2.value, refs.permSet3.value, refs.permSet4.value]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  }

  function updatePickerState() {
    const values = [refs.permSet1?.value, refs.permSet2?.value, refs.permSet3?.value, refs.permSet4?.value]
      .map(value => String(value || '').trim());

    const inputs = [refs.permSet1, refs.permSet2, refs.permSet3, refs.permSet4];
    const placeholders = [
      'Type to search…',
      'Enable by selecting item 1',
      'Enable by selecting item 2',
      'Enable by selecting item 3'
    ];

    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      if (!input) continue;

      const enabled = index === 0 || !!values[index - 1];
      input.disabled = !enabled;
      input.placeholder = enabled ? 'Type to search…' : placeholders[index];

      if (!enabled && input.value) {
        input.value = '';
        values[index] = '';
      }
    }

    const selectedCount = getSelectedLabels().length;
    const hasCmp = !!state.comparison;
    if (refs.btnOpenInline) refs.btnOpenInline.disabled = hasCmp || selectedCount < 1;
    if (refs.btnCompareInline) refs.btnCompareInline.disabled = hasCmp || selectedCount < 2;
    refs.btnOpenInline?.classList.toggle('psm-hidden', selectedCount >= 2 || hasCmp);
    refs.btnCompareInline?.classList.toggle('psm-hidden', selectedCount < 2 || hasCmp);
    updatePermissionSetLinks(values);
    updatePresetControls();
  }

  function findPermissionSetByLabel(label) {
    const search = String(label || '').trim();
    if (!search) return null;
    const exactSelectionMatch = state.permissionSets.find(ps => getSelectionValue(ps) === search);
    if (exactSelectionMatch) return exactSelectionMatch;

    const labelMatches = state.permissionSets.filter(ps => getDisplayLabel(ps) === search);
    return labelMatches.length === 1 ? labelMatches[0] : null;
  }

  function buildPermissionSetSetupUrl(permSetId) {
    const match = state.permissionSets.find(ps => ps.Id === permSetId);
    const setupBase = String(state.auth?.instanceUrl || '')
      .replace('.sandbox.my.salesforce.com', '.sandbox.my.salesforce-setup.com')
      .replace('.my.salesforce.com', '.my.salesforce-setup.com');
    const setupTargetId = match?.setupTargetId || permSetId;
    if (getSourceType(match) === 'Profile') {
      const address = encodeURIComponent(`/${setupTargetId}`);
      return `${setupBase}/lightning/setup/EnhancedProfiles/page?address=${address}`;
    }
    const address = encodeURIComponent(`/${setupTargetId}`);
    return `${setupBase}/lightning/setup/PermSets/page?address=${address}`;
  }

  function updatePermissionSetLinks(values) {
    const linkIds = ['permSet1Link', 'permSet2Link', 'permSet3Link', 'permSet4Link'];

    linkIds.forEach((linkId, index) => {
      const link = refs[linkId];
      if (!link) return;

      const match = findPermissionSetByLabel(values[index]);
      if (!match) {
        link.removeAttribute('href');
        delete link.dataset.setupUrl;
        delete link.dataset.label;
        link.classList.add('psm-hidden');
        return;
      }

      const url = buildPermissionSetSetupUrl(match.Id);
      if (!url) {
        link.removeAttribute('href');
        delete link.dataset.setupUrl;
        delete link.dataset.label;
        link.classList.add('psm-hidden');
        return;
      }
      link.href = url;
      link.dataset.setupUrl = url;
      link.dataset.label = getDisplayLabel(match);
      link.classList.remove('psm-hidden');
    });
  }

  /* ─────────────────────────────────────────────
     COMPARE
  ───────────────────────────────────────────── */
  async function compareSelected() {
    const labels = getSelectedLabels();

    if (labels.length < 1) {
      setStatus('Please select at least 1 profile or permission set to continue.', 'error');
      return;
    }

    showLoading('Fetching selected metadata…');
    try {
      clearSaveSummary();
      setStatus('Loading selected details…', 'info');

      const selectedDefs = sortSelectedRecords(labels.map(label => {
        const match = findPermissionSetByLabel(label);
        if (!match) throw new Error(`Permission set not found: "${label}". Make sure it loaded correctly.`);
        return match;
      }));

      state.selected = await Promise.all(
        selectedDefs.map(async (ps, i) => {
          setLoadingLabel(`Loading ${getDisplayLabelWithType(ps)} (${i + 1} of ${selectedDefs.length})…`);
          return { ...ps, details: await fetchPermissionSetDetails(ps.Id, { includeFieldPermissions: false }) };
        })
      );

      state.comparison = window.PermsetDiff.buildComparison(state.selected);
      state.catalogs.fieldPermissionObjectsLoaded = new Set();
      state.catalogs.fieldPermissionObjectLoadPromises = new Map();
      state.collapsedFieldObjects = new Set(getReadableObjectApiNames());
      state.systemPermissionMetadata = await getPermissionSetPermissionMetadata();
      applySystemPermissionMetadataToComparison();
      await ensureCatalogsLoaded();
      applyCatalogLabelsToComparison();
      state.pendingChanges = [];
      state.editMode = false;
        updateRestrictionNotice();

      refs.pickerPanel.classList.add('psm-hidden');
      refs.summaryBar.classList.remove('psm-hidden');
      refs.compareContext?.classList.remove('psm-hidden');
      refs.comparisonPanel.classList.remove('psm-hidden');

      activateTab('objectTab');
      renderAll();
      updateModeUI();
      const profileCount = state.selected.filter(ps => getSourceType(ps) === 'Profile').length;
      const permissionSetCount = state.selected.length - profileCount;
      setStatus(
        state.selected.length === 1
          ? `Loaded ${getDisplayLabelWithType(state.selected[0])} for comparison.`
          : `Comparing ${profileCount} profile(s) and ${permissionSetCount} permission set(s).`,
        'success'
      );
    } catch (e) {
      setStatus(e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  function resetComparison() {
    state.selected = [];
    state.comparison = null;
    state.pendingChanges = [];
    state.editMode = false;
    state.catalogs.fieldPermissionObjectsLoaded = new Set();
    state.catalogs.fieldPermissionObjectLoadPromises = new Map();
    state.collapsedFieldObjects = new Set();

    ['permSet1', 'permSet2', 'permSet3', 'permSet4'].forEach(id => {
      if (refs[id]) refs[id].value = '';
    });

    refs.pickerPanel.classList.remove('psm-hidden');
    refs.summaryBar.classList.add('psm-hidden');
    refs.compareContext?.classList.add('psm-hidden');
    refs.tabsBar.classList.add('psm-hidden');
    refs.comparisonPanel.classList.add('psm-hidden');
    refs.psgRestrictionNotice?.classList.add('psm-hidden');
    clearSaveSummary();
    clearSavePreview();

    activateTab('objectTab');
    updatePickerState();
    updateModeUI();
    setStatus(`${getPermissionSourceSummary()} available. Select 1 to edit or 2 to 4 to compare.`, 'info');
  }

  /* ─────────────────────────────────────────────
     EDIT MODE
  ───────────────────────────────────────────── */
  async function enterEditMode() {
    try {
      showLoading('Loading searchable permissions…');
      await ensureCatalogsLoaded();
      applyCatalogLabelsToComparison();
    } catch (e) {
      console.warn('Searchable permission catalogs failed to load', e);
    } finally {
      hideLoading();
    }

    state.editMode = true;
    updateModeUI();
    updateRestrictionNotice();
    renderAll();
    const restrictedLabels = state.selected
      .filter(ps => ps?.details?.isInPermissionSetGroup)
      .map(ps => getDisplayLabelWithType(ps));
    if (restrictedLabels.length) setStatus(`Edit mode — ${restrictedLabels.join(', ')} is part of a permission set group. Comparison is available, but edits are disabled. If you still want to edit this permission set, remove it from the group, make the update, then add it back to avoid group policy update errors.`, 'warn');
    else setStatus('Edit mode — toggle permissions then click Save.', 'info');
  }

  function cancelEditMode() {
    state.editMode = false;
    state.pendingChanges = [];
    state.comparison = window.PermsetDiff.buildComparison(state.selected);
    applySystemPermissionMetadataToComparison();
    reapplyCachedFieldCatalogToComparison();
    clearSavePreview();
    updateModeUI();
    renderAll();
    setStatus('Edit cancelled. No changes were saved.', 'info');
  }

  function clearPendingChanges() {
    if (!state.pendingChanges.length) return;

    state.pendingChanges = [];
    clearSavePreview();
    updateModeUI();
    renderAll();
    setStatus('Pending changes cleared.', 'info');
  }

  function clearSavePreview() {
    if (refs.savePreviewPanel) refs.savePreviewPanel.innerHTML = '';
    refs.savePreviewModal?.classList.add('psm-hidden');
  }

  function buildSavePreviewData() {
    const changes = [...state.pendingChanges];
    const counts = {
      object: changes.filter(change => change.changeType === 'object').length,
      field: changes.filter(change => change.changeType === 'field').length,
      system: changes.filter(change => change.changeType === 'system').length,
      access: changes.filter(change => change.changeType === 'access').length
    };
    const warnings = [];
    const restrictedCount = changes.filter(change => isPermissionSetIdGroupRestricted(change.permissionSetId)).length;
    const managedCount = changes.filter(change => isPermissionSetIdManaged(change.permissionSetId)).length;
    const recordTypeCount = changes.filter(change => change.setupEntityType === 'RecordType' || String(change.key || '').startsWith('RecordType::')).length;

    if (restrictedCount) warnings.push(`${restrictedCount} change(s) target permission sets that are part of a permission set group and will be skipped.`);
    if (managedCount) warnings.push(`${managedCount} change(s) target managed permission sets and may be skipped.`);
    if (recordTypeCount) warnings.push(`${recordTypeCount} record type visibility change(s) cannot be saved from this screen.`);

    const byPermissionSet = new Map();
    changes.forEach(change => {
      const list = byPermissionSet.get(change.permissionSetLabel) || [];
      list.push(change);
      byPermissionSet.set(change.permissionSetLabel, list);
    });

    return { changes, counts, warnings, byPermissionSet };
  }

  function renderSavePreview() {
    if (!refs.savePreviewPanel || !refs.savePreviewModal || !state.pendingChanges.length) return;
    const preview = buildSavePreviewData();
    refs.savePreviewPanel.innerHTML = `
      <div class="psm-save-preview-summary">
        <div class="psm-save-preview-count">${preview.changes.length} pending change(s)</div>
        <div class="psm-save-preview-breakdown">
          <span>Objects: ${preview.counts.object}</span>
          <span>Fields: ${preview.counts.field}</span>
          <span>System: ${preview.counts.system}</span>
          <span>Access: ${preview.counts.access}</span>
        </div>
      </div>
      ${preview.warnings.length ? `<div class="psm-save-preview-warnings">${preview.warnings.map(warning => `<div class="psm-save-preview-warning">${escapeHtml(warning)}</div>`).join('')}</div>` : ''}
      <div class="psm-save-preview-groups">
        ${Array.from(preview.byPermissionSet.entries()).map(([label, groupChanges]) => `
          <div class="psm-save-preview-group">
            <div class="psm-save-preview-group-title">${escapeHtml(label)} <span class="psm-save-summary-count">(${groupChanges.length})</span></div>
            <ul class="psm-save-summary-list">
              ${groupChanges.slice(0, 12).map(change => `<li>${escapeHtml(formatSavedChange(change))}</li>`).join('')}
              ${groupChanges.length > 12 ? `<li>...and ${groupChanges.length - 12} more</li>` : ''}
            </ul>
          </div>
        `).join('')}
      </div>
    `;
    refs.savePreviewModal.classList.remove('psm-hidden');
  }

  function confirmApplyChanges() {
    clearSavePreview();
    void executeApplyChanges();
  }

  function updateModeUI() {
    const hasCmp = !!state.comparison;
    const allSelectedRestricted = !!state.selected.length && state.selected.every(ps => ps?.details?.isInPermissionSetGroup);
    const allSelectedObjectScopeLocked = !!state.selected.length && state.selected.every((ps, index) => isPermissionSetEditLocked(index, 'object'));
    if (refs.btnCompare) refs.btnCompare.disabled = hasCmp;
    refs.btnExportCsv.disabled     = !hasCmp;
    refs.btnEditMode.disabled      = !hasCmp || state.editMode;
    refs.btnApplyChanges.disabled  = !state.editMode || state.pendingChanges.length === 0;
    refs.btnCancelEdit.disabled    = !state.editMode;
    refs.btnClearPending.disabled  = !hasCmp || state.pendingChanges.length === 0;
    refs.btnResetCompare.disabled  = !hasCmp && !state.selected.length;
    document.body.classList.toggle('psm-editing', state.editMode);
    refs.objectAddRow?.classList.toggle('psm-hidden', !state.editMode || !hasCmp || allSelectedObjectScopeLocked);
    refs.fieldObjectAddRow?.classList.toggle('psm-hidden', !hasCmp);
    ['apexAddRow', 'vfAddRow', 'custPermAddRow', 'connectedAppsAddRow'].forEach(id => {
      refs[id]?.classList.toggle('psm-hidden', !state.editMode || !hasCmp || allSelectedRestricted);
    });
    updatePickerState();
    updateAddControlState();
  }

  async function ensureCatalogsLoaded() {
    if (state.catalogs.loaded) return;

    const [objects, access] = await Promise.all([loadObjectCatalog(), loadAccessCatalogs()]);
    state.catalogs.objects = objects || [];
    state.catalogs.objectMap = new Map(state.catalogs.objects.map(item => [item.key, item]));
    state.catalogs.access = access || state.catalogs.access;
    state.catalogs.accessMaps = {
      apexClassRows: new Map((state.catalogs.access.apexClassRows || []).map(item => [item.key, item])),
      visualforceRows: new Map((state.catalogs.access.visualforceRows || []).map(item => [item.key, item])),
      customPermissionRows: new Map((state.catalogs.access.customPermissionRows || []).map(item => [item.key, item])),
      flowAccessRows: new Map((state.catalogs.access.flowAccessRows || []).map(item => [item.key, item])),
      assignedAppRows: new Map((state.catalogs.access.assignedAppRows || []).flatMap(item => [[item.key, item], [item.entityId, item]])),
      connectedAppRows: new Map((state.catalogs.access.connectedAppRows || []).flatMap(item => [[item.key, item], [item.entityId, item]])),
      setupAccessRows: new Map((state.catalogs.access.setupAccessRows || []).flatMap(item => [[item.key, item], [item.entityId, item]]))
    };

    renderCatalogDatalist(refs.objectCatalogList, state.catalogs.objects, buildObjectCatalogValue);
    renderCatalogDatalist(refs.apexOptionsList, state.catalogs.access.apexClassRows, buildAccessCatalogValue);
    renderCatalogDatalist(refs.vfOptionsList, state.catalogs.access.visualforceRows, buildAccessCatalogValue);
    renderCatalogDatalist(refs.custPermOptionsList, state.catalogs.access.customPermissionRows, buildAccessCatalogValue);
    renderCatalogDatalist(refs.flowOptionsList, state.catalogs.access.flowAccessRows, buildAccessCatalogValue);
    renderCatalogDatalist(refs.assignedAppsOptionsList, state.catalogs.access.assignedAppRows, buildAccessCatalogValue);
    renderCatalogDatalist(refs.connectedAppsOptionsList, state.catalogs.access.connectedAppRows, buildAccessCatalogValue);
    renderCatalogDatalist(refs.setupOptionsList, state.catalogs.access.assignedAppRows, buildAccessCatalogValue);
    state.catalogs.loaded = true;
  }

  // Merge assigned-app entries discovered from the loaded permission-set details into the catalog.
  // This guarantees the Assigned Apps search shows entries even if the standalone CustomApplication/AppMenuItem
  // queries returned nothing in this org.
  function mergeAssignedAppsFromSelectedDetails() {
    if (!state.selected?.length) return;

    const existing = state.catalogs.access.assignedAppRows || [];
    const map = state.catalogs.accessMaps?.assignedAppRows || new Map();
    const seenEntityIds = new Set(existing.map(item => item.entityId));
    let added = false;

    state.selected.forEach(ps => {
      const apps = ps?.details?.assignedApps || [];
      apps.forEach(row => {
        const entityId = String(row?.SetupEntityId || '').trim();
        if (!entityId || entityId === '000000000000000AAA' || seenEntityIds.has(entityId)) return;
        const setupType = row?.setupType || row?.SetupEntityType || 'AssignedApp';
        const label = row?.label || entityId;
        const item = {
          key: `${setupType}::${entityId}`,
          entityId,
          label,
          secondary: entityId,
          setupType
        };
        existing.push(item);
        map.set(item.key, item);
        map.set(item.entityId, item);
        seenEntityIds.add(entityId);
        added = true;
      });
    });

    if (added) {
      existing.sort((a, b) => String(a.label).localeCompare(String(b.label)));
      renderCatalogDatalist(refs.assignedAppsOptionsList, existing, buildAccessCatalogValue);
      renderCatalogDatalist(refs.setupOptionsList, existing, buildAccessCatalogValue);
    }
  }

  async function refreshFieldAvailability() {
    if (!state.comparison) return;

    showLoading('Refreshing field permissions list…');
    try {
      const objectApiNames = getFieldObjectApiNames();
      if (!objectApiNames.length) {
        setStatus('No objects are currently available to load fields for.', 'info');
        return;
      }

      await ensureFieldCatalogForObjects(objectApiNames);
      renderSummaryBar();
      renderFieldTable();
      updateTabCounts();
      setStatus(`Loaded field metadata for ${objectApiNames.length} object(s).`, 'success');
    } catch (e) {
      setStatus(`Field refresh failed: ${e.message}`, 'error');
    } finally {
      hideLoading();
    }
  }

  async function ensureFieldCatalogForObjects(objectApiNames) {
    const targets = [...new Set((objectApiNames || []).filter(Boolean))];
    if (targets.length) {
      const cachedCatalog = new Map(
        targets
          .filter(name => state.catalogs.fieldMaps.has(name))
          .map(name => [name, state.catalogs.fieldMaps.get(name) || []])
      );
      mergeFieldCatalogIntoComparison(cachedCatalog);
    }

    const missing = targets.filter(name => !state.catalogs.fieldMaps.has(name));
    if (!missing.length) return;

    const fieldCatalog = await loadFieldCatalog(missing);
    mergeFieldCatalogIntoComparison(fieldCatalog);
  }

  async function ensureVisibleFieldMetadataLoaded({ showOverlay = false } = {}) {
    const objectApiNames = getFieldObjectApiNames();
    const missing = [...new Set(objectApiNames.filter(Boolean))]
      .filter(name => !state.catalogs.fieldMaps.has(name));

    if (!missing.length) return;

    if (state.catalogs.fieldLoadPromise) {
      await state.catalogs.fieldLoadPromise;
      return;
    }

    state.catalogs.fieldLoadPromise = (async () => {
      try {
        if (showOverlay) showLoading('Loading field metadata…');
        await ensureFieldCatalogForObjects(objectApiNames);
        renderFieldTable();
        updateTabCounts();
      } catch (e) {
        console.warn('Field metadata load failed', e);
        setStatus(`Field metadata load failed: ${e.message}`, 'warn');
      } finally {
        state.catalogs.fieldLoadPromise = null;
        if (showOverlay) hideLoading();
      }
    })();

    await state.catalogs.fieldLoadPromise;
  }

  async function ensureSelectedFieldPermissionsLoaded({ showOverlay = false } = {}) {
    const missingPermissionSets = (state.selected || []).filter(ps => !ps?.details?.fieldPermissionsLoaded);
    if (!missingPermissionSets.length) return;

    if (state.catalogs.fieldPermissionLoadPromise) {
      await state.catalogs.fieldPermissionLoadPromise;
      return;
    }

    state.catalogs.fieldPermissionLoadPromise = (async () => {
      try {
        if (showOverlay) showLoading('Loading field permissions…');

        const loadedDetails = await Promise.all(
          missingPermissionSets.map(ps => fetchPermissionSetDetails(ps.Id, { includeFieldPermissions: true }))
        );

        const detailById = new Map(loadedDetails.map((details, index) => [missingPermissionSets[index].Id, details]));
        state.selected = state.selected.map(ps => (
          detailById.has(ps.Id)
            ? { ...ps, details: detailById.get(ps.Id) }
            : ps
        ));

        state.comparison.fieldRows = window.PermsetDiff.buildComparison(state.selected).fieldRows;
        renderFieldTable();
        renderSummaryBar();
        updateTabCounts();
      } catch (e) {
        console.warn('Field permissions load failed', e);
        setStatus(`Field permissions load failed: ${e.message}`, 'warn');
      } finally {
        state.catalogs.fieldPermissionLoadPromise = null;
        if (showOverlay) hideLoading();
      }
    })();

    await state.catalogs.fieldPermissionLoadPromise;
  }

  function getReadableObjectApiNames() {
    return [...new Set(
      (state.comparison?.objectRows || [])
        .filter(row => row.values.some(value => !!(value && value.PermissionsRead)))
        .map(row => resolveObjectApiName(row, row.key))
        .filter(name => name && !looksLikeSalesforceId(name))
    )];
  }

  function getFieldObjectApiNames() {
    return [...new Set([
      ...getReadableObjectApiNames(),
      ...(state.comparison?.fieldRows || [])
        .map(row => String(row.key || '').split('.')[0])
        .filter(Boolean),
      ...Array.from(state.catalogs.fieldMaps.keys())
    ].filter(name => name && !looksLikeSalesforceId(name)))];
  }

  async function ensureFieldPermissionsLoadedForObject(objectApiName, { showOverlay = false } = {}) {
    if (!objectApiName || state.catalogs.fieldPermissionObjectsLoaded.has(objectApiName)) return;

    const existingPromise = state.catalogs.fieldPermissionObjectLoadPromises.get(objectApiName);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const loadPromise = (async () => {
      try {
        if (showOverlay) showLoading(`Loading field permissions for ${objectApiName}…`);

        const perPermissionSetRows = await Promise.all(
          state.selected.map(ps => fetchPermissionSetFieldPermissionsForObject(ps.Id, objectApiName))
        );

        state.selected = state.selected.map((ps, index) => {
          const existingRows = ps?.details?.fieldPermissions || [];
          const rowsForObject = perPermissionSetRows[index] || [];
          const mergedRows = [
            ...existingRows.filter(row => String(row?.SobjectType || '') !== objectApiName),
            ...rowsForObject
          ];

          return {
            ...ps,
            details: {
              ...ps.details,
              fieldPermissions: mergedRows
            }
          };
        });

        await ensureFieldCatalogForObjects([objectApiName]);
        state.comparison.fieldRows = window.PermsetDiff.buildComparison(state.selected).fieldRows;
        reapplyCachedFieldCatalogToComparison();
        state.catalogs.fieldPermissionObjectsLoaded.add(objectApiName);
        renderFieldTable();
        updateTabCounts();
      } catch (e) {
        console.warn('Object field permissions load failed', e);
        setStatus(`Field permissions load failed for ${objectApiName}: ${e.message}`, 'warn');
      } finally {
        state.catalogs.fieldPermissionObjectLoadPromises.delete(objectApiName);
        if (showOverlay) hideLoading();
      }
    })();

    state.catalogs.fieldPermissionObjectLoadPromises.set(objectApiName, loadPromise);
    await loadPromise;
  }

  function mergeFieldCatalogIntoComparison(fieldCatalog) {
    if (!state.comparison || !(fieldCatalog instanceof Map)) return;

    const existingRows = new Map((state.comparison.fieldRows || []).map(row => [row.key, row]));
    fieldCatalog.forEach((fields, objectApiName) => {
      state.catalogs.fieldMaps.set(objectApiName, fields || []);
      (fields || []).forEach(field => {
        const key = `${objectApiName}.${field.fieldApiName}`;
        if (!existingRows.has(key)) {
          existingRows.set(key, {
            key,
            label: field.label || field.fieldApiName,
            catalogDisplay: field,
            values: Array(state.selected.length).fill(null)
          });
        } else {
          existingRows.get(key).catalogDisplay = field;
        }
      });
    });

    state.comparison.fieldRows = Array.from(existingRows.values())
      .sort((left, right) => String(left.key).localeCompare(String(right.key)));
  }

  function reapplyCachedFieldCatalogToComparison(objectApiNames = null) {
    if (!state.comparison) return;

    const targetNames = objectApiNames
      ? [...new Set((objectApiNames || []).filter(Boolean))]
      : Array.from(state.catalogs.fieldMaps.keys());

    if (!targetNames.length) return;

    const cachedCatalog = new Map(
      targetNames
        .filter(name => state.catalogs.fieldMaps.has(name))
        .map(name => [name, state.catalogs.fieldMaps.get(name) || []])
    );

    if (cachedCatalog.size) {
      mergeFieldCatalogIntoComparison(cachedCatalog);
    }
  }

  function syncSelectedDetailsFromComparison() {
    if (!state.comparison || !Array.isArray(state.selected) || !state.selected.length) return;

    const detailSectionMap = [
      ['objectRows', 'objectPermissions'],
      ['fieldRows', 'fieldPermissions'],
      ['apexClassRows', 'apexClassAccess'],
      ['visualforceRows', 'visualforceAccess'],
      ['customPermissionRows', 'customPermissions'],
      ['flowAccessRows', 'flowAccess'],
      ['assignedAppRows', 'assignedApps'],
      ['connectedAppRows', 'connectedAppAccess'],
      ['setupAccessRows', 'setupAccess']
    ];

    state.selected = state.selected.map((ps, setIndex) => {
      const details = { ...(ps.details || {}) };

      detailSectionMap.forEach(([comparisonKey, detailKey]) => {
        details[detailKey] = (state.comparison?.[comparisonKey] || [])
          .map(row => row?.values?.[setIndex] ? { ...row.values[setIndex] } : null)
          .filter(Boolean);
      });

      const userPermissions = { ...(details.userPermissions || {}) };
      [
        ...(state.comparison?.systemRows || []),
        ...(state.comparison?.appPermissionRows || [])
      ].forEach(row => {
        userPermissions[row.key] = !!row?.values?.[setIndex];
      });
      details.userPermissions = userPermissions;

      return {
        ...ps,
        details
      };
    });
  }

  function renderCatalogDatalist(listEl, items, valueFn) {
    if (!listEl) return;
    listEl.innerHTML = (items || []).map(item => `<option value="${escapeHtml(valueFn(item))}"></option>`).join('');
  }

  function buildObjectCatalogValue(item) {
    return item?.label && item.label !== item.key ? `${item.label} (${item.key})` : (item?.key || '');
  }

  function buildAccessCatalogValue(item) {
    const secondary = item?.secondary && item.secondary !== item.label ? item.secondary : item?.entityId;
    return secondary && secondary !== item?.label ? `${item.label} (${secondary})` : (item?.label || '');
  }

  function updateAddControlState() {
    const hasObjectEditableSelection = state.selected.some((ps, index) => !isPermissionSetEditLocked(index, 'object'));
    if (refs.btnAddObject) refs.btnAddObject.disabled = !state.editMode || !hasObjectEditableSelection || !resolveObjectCatalogEntry(refs.objectAddSearch?.value);
    if (refs.btnAddFieldObject) refs.btnAddFieldObject.disabled = !state.comparison || !resolveFieldObjectEntry(refs.fieldObjectAddSearch?.value);
    if (refs.btnAddApex) refs.btnAddApex.disabled = !state.editMode || !resolveAccessCatalogEntry('apexClassRows', refs.apexAddSearch?.value);
    if (refs.btnAddVf) refs.btnAddVf.disabled = !state.editMode || !resolveAccessCatalogEntry('visualforceRows', refs.vfAddSearch?.value);
    if (refs.btnAddCustPerm) refs.btnAddCustPerm.disabled = !state.editMode || !resolveAccessCatalogEntry('customPermissionRows', refs.custPermAddSearch?.value);
    if (refs.btnAddAssignedApp) refs.btnAddAssignedApp.disabled = !state.editMode || !resolveAccessCatalogEntry('assignedAppRows', refs.assignedAppsAddSearch?.value);
    if (refs.btnAddConnectedApp) refs.btnAddConnectedApp.disabled = !state.editMode || !resolveAccessCatalogEntry('connectedAppRows', refs.connectedAppsAddSearch?.value);
    if (refs.btnAddSetup) refs.btnAddSetup.disabled = !state.editMode || !resolveAccessCatalogEntry('assignedAppRows', refs.setupAddSearch?.value);
  }

  function applyCatalogLabelsToComparison() {
    if (!state.comparison) return;

    state.comparison.objectRows.forEach(row => {
      const catalog = state.catalogs.objectMap.get(row.key);
      if (catalog) row.catalogDisplay = catalog;
      const normalizedKey = resolveObjectApiName(row, row.key);
      if (normalizedKey && normalizedKey !== row.key) {
        row.key = normalizedKey;
      }
      row.values?.forEach(value => {
        if (value) value.SobjectType = resolveObjectApiName(row, row.key);
      });
    });

    ['apexClassRows', 'visualforceRows', 'customPermissionRows', 'flowAccessRows', 'assignedAppRows', 'connectedAppRows', 'setupAccessRows'].forEach(section => {
      state.comparison[section]?.forEach(row => {
        const entityId = extractEntityId(row.key);
        const catalog = state.catalogs.accessMaps[section]?.get(row.key) || state.catalogs.accessMaps[section]?.get(entityId) || null;
        if (catalog) row.catalogDisplay = catalog;
      });
    });
  }

  /* ─────────────────────────────────────────────
     APPLY CHANGES
  ───────────────────────────────────────────── */
  function applyChanges() {
    if (!state.pendingChanges.length) return;
    renderSavePreview();
  }

  async function executeApplyChanges() {
    if (!state.pendingChanges.length) return;
    const COMPOSITE_BATCH_SIZE = 20;
    const apiVersion = await getSupportedApiVersion(true);

    async function safePatchOrCreate(sobjectName, recordId, body) {
      if (recordId) {
        try {
          await patchRecord(sobjectName, recordId, body);
          return { action: 'patched', id: recordId };
        } catch (e) {
          if (e.code === 'CANNOT_MODIFY_MANAGED_OBJECT') throw e;
          const msg = String(e?.message || '');
          const isNotFound = msg.includes('HTTP 404') || msg.includes('NOT_FOUND') || msg.includes('does not exist');
          if (!isNotFound) throw e;
        }
      }
      const created = await createRecord(sobjectName, body);
      return { action: 'created', id: created?.id || null };
    }

    function buildCompositeSobjectRequest(method, sobjectName, body, recordId = null) {
      const suffix = recordId ? `/${recordId}` : '';
      return {
        method,
        url: `/services/data/${apiVersion}/sobjects/${sobjectName}${suffix}`,
        richInput: body
      };
    }

    function extractCompositeErrors(result) {
      const payload = result?.result;
      if (Array.isArray(payload)) return payload;
      if (payload?.errors && Array.isArray(payload.errors)) return payload.errors;
      if (payload?.[0]?.errorCode) return payload;
      return [];
    }

    function isManagedCompositeError(result) {
      return extractCompositeErrors(result).some(error => error?.errorCode === 'CANNOT_MODIFY_MANAGED_OBJECT');
    }

    function isNotFoundCompositeError(result) {
      if (Number(result?.statusCode) === 404) return true;
      return extractCompositeErrors(result).some(error => /NOT_FOUND|ENTITY_IS_DELETED/i.test(String(error?.errorCode || '')));
    }

    function formatCompositeError(result, fallbackMessage) {
      const errors = extractCompositeErrors(result);
      if (errors.length) {
        return errors
          .map(error => [error?.errorCode, error?.message].filter(Boolean).join(': '))
          .join('; ');
      }

      return fallbackMessage || `HTTP ${result?.statusCode || 'unknown'}`;
    }

    function isObjectPermissionDependencyError(message) {
      return /FIELD_INTEGRITY_EXCEPTION/i.test(String(message || ''))
        && /depends on permission\(s\):/i.test(String(message || ''));
    }

    async function processCompositeOperations(label, operations) {
      if (!operations.length) return;

      const totalBatches = Math.ceil(operations.length / COMPOSITE_BATCH_SIZE);
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const start = batchIndex * COMPOSITE_BATCH_SIZE;
        const batch = operations.slice(start, start + COMPOSITE_BATCH_SIZE);
        setLoadingLabel(`Saving ${label} batch ${batchIndex + 1} of ${totalBatches}…`);

        const results = await compositeBatch(batch.map(operation => operation.request));
        for (let index = 0; index < batch.length; index += 1) {
          const operation = batch[index];
          const result = results[index] || null;

          if (result && Number(result.statusCode) >= 200 && Number(result.statusCode) < 300) {
            operation.onSuccess?.(result);
            continue;
          }

          if (result && isManagedCompositeError(result)) {
            operation.onManaged?.(formatCompositeError(result));
            continue;
          }

          if (result && isNotFoundCompositeError(result) && operation.onNotFoundFallback) {
            try {
              await operation.onNotFoundFallback();
              continue;
            } catch (error) {
              operation.onError?.(error?.message || String(error));
              continue;
            }
          }

          operation.onError?.(formatCompositeError(result, `${label} save failed`));
        }
      }
    }

    async function processObjectOperations(label, operations) {
      if (!operations.length) return;

      const queue = [...operations];
      let stalledCount = 0;
      let completedCount = 0;

      while (queue.length) {
        const operation = queue.shift();
        setLoadingLabel(`Saving ${label} ${completedCount + 1} of ${operations.length}…`);

        const result = (await compositeBatch([operation.request]))?.[0] || null;

        if (result && Number(result.statusCode) >= 200 && Number(result.statusCode) < 300) {
          operation.onSuccess?.(result);
          completedCount += 1;
          stalledCount = 0;
          continue;
        }

        if (result && isManagedCompositeError(result)) {
          operation.onManaged?.(formatCompositeError(result));
          completedCount += 1;
          stalledCount = 0;
          continue;
        }

        if (result && isNotFoundCompositeError(result) && operation.onNotFoundFallback) {
          try {
            await operation.onNotFoundFallback();
            completedCount += 1;
            stalledCount = 0;
            continue;
          } catch (error) {
            operation.onError?.(error?.message || String(error));
            completedCount += 1;
            stalledCount = 0;
            continue;
          }
        }

        const errorMessage = formatCompositeError(result, `${label} save failed`);
        if (isObjectPermissionDependencyError(errorMessage) && stalledCount < queue.length) {
          queue.push(operation);
          stalledCount += 1;
          continue;
        }

        operation.onError?.(errorMessage);
        completedCount += 1;
        stalledCount = 0;
      }
    }

    showLoading('Saving changes…');
    try {
      setStatus('Applying changes…', 'info');
      const attemptedChanges = [...state.pendingChanges];

      const restrictedSkippedChanges = attemptedChanges.filter(change =>
        isPermissionSetIdManaged(change.permissionSetId) ||
        isPermissionSetIdGroupRestricted(change.permissionSetId)
      );

      const changesToProcess = attemptedChanges.filter(change => !restrictedSkippedChanges.includes(change));

      const fieldChanges  = changesToProcess.filter(c => c.changeType === 'field');
      const objectChanges = changesToProcess.filter(c => c.changeType === 'object');
      const systemChanges = changesToProcess.filter(c => c.changeType === 'system');
      const accessChanges = changesToProcess.filter(c => c.changeType === 'access');
      const managedSkips = [], saveErrors = [];
      const unresolvedChanges = [];

      const fieldChangeGroups = new Map();
      for (const change of fieldChanges) {
        const groupKey = `${change.permissionSetId}::${change.key}`;
        const group = fieldChangeGroups.get(groupKey) || {
          permissionSetId: change.permissionSetId,
          permissionSetLabel: change.permissionSetLabel,
          key: change.key,
          changes: []
        };
        group.changes.push(change);
        fieldChangeGroups.set(groupKey, group);
      }

      const fieldOperations = [];
      for (const group of fieldChangeGroups.values()) {
        const row = state.comparison.fieldRows.find(r => r.key === group.key);
        const setIndex = state.selected.findIndex(ps => ps.Id === group.permissionSetId);
        const value = row?.values?.[setIndex];
        const objectApiName = String(value?.SobjectType || group.key || '').split('.')[0];
        const fullFieldName = buildFullFieldPermissionName(objectApiName, value?.Field || group.key);
        const effectiveRead = !!value?.PermissionsRead || !!value?.PermissionsEdit;
        const effectiveEdit = !!value?.PermissionsEdit;

        if (value) {
          value.SobjectType = objectApiName;
          value.Field = fullFieldName.slice(`${objectApiName}.`.length);
          value.PermissionsRead = effectiveRead;
          value.PermissionsEdit = effectiveEdit;
        }

        const body = {
          ParentId: group.permissionSetId,
          SobjectType: objectApiName,
          Field: fullFieldName,
          PermissionsRead: effectiveRead,
          PermissionsEdit: effectiveEdit
        };

        const recordId = group.changes.find(change => change.recordId)?.recordId || value?.Id || null;

        fieldOperations.push({
          request: buildCompositeSobjectRequest(recordId ? 'PATCH' : 'POST', 'FieldPermissions', body, recordId),
          onSuccess: result => {
            const newId = result?.result?.id || result?.result?.Id || recordId || null;
            if (value && newId) value.Id = newId;
          },
          onManaged: () => {
            managedSkips.push(group.key);
            unresolvedChanges.push(...group.changes);
          },
          onNotFoundFallback: async () => {
            const fallback = await safePatchOrCreate('FieldPermissions', null, body);
            if (value && fallback.id) value.Id = fallback.id;
          },
          onError: message => {
            saveErrors.push(`${group.key}: ${message}`);
            unresolvedChanges.push(...group.changes);
          }
        });
      }

      await processCompositeOperations('field permissions', fieldOperations);

      const objectChangeGroups = new Map();
      for (const change of objectChanges) {
        const groupKey = `${change.permissionSetId}::${change.key}`;
        const group = objectChangeGroups.get(groupKey) || {
          permissionSetId: change.permissionSetId,
          permissionSetLabel: change.permissionSetLabel,
          key: change.key,
          changes: []
        };
        group.changes.push(change);
        objectChangeGroups.set(groupKey, group);
      }

      const objectOperations = [];
      for (const group of objectChangeGroups.values()) {
        const row = state.comparison.objectRows.find(r => r.key === group.key);
        const setIndex = state.selected.findIndex(ps => ps.Id === group.permissionSetId);
        const value = row?.values?.[setIndex];
        const sobjectType = !looksLikeSalesforceId(group.key)
          ? group.key
          : resolveObjectApiName(row, group.key || value?.SobjectType);

        if (!isSupportedObjectPermissionTarget(sobjectType)) {
          saveErrors.push(`${group.key}: Object Permissions does not support ${sobjectType}`);
          unresolvedChanges.push(...group.changes);
          continue;
        }

        if (value) {
          value.SobjectType = sobjectType;
        }

        const body = {
          ParentId: group.permissionSetId,
          SobjectType: sobjectType,
          PermissionsRead: !!value?.PermissionsRead,
          PermissionsCreate: !!value?.PermissionsCreate,
          PermissionsEdit: !!value?.PermissionsEdit,
          PermissionsDelete: !!value?.PermissionsDelete,
          PermissionsViewAllRecords: !!value?.PermissionsViewAllRecords,
          PermissionsModifyAllRecords: !!value?.PermissionsModifyAllRecords
        };

        const recordId = group.changes.find(change => change.recordId)?.recordId || value?.Id || null;

        objectOperations.push({
          request: buildCompositeSobjectRequest(recordId ? 'PATCH' : 'POST', 'ObjectPermissions', body, recordId),
          onSuccess: result => {
            const newId = result?.result?.id || result?.result?.Id || recordId || null;
            if (value && newId) value.Id = newId;
          },
          onManaged: () => {
            managedSkips.push(group.key);
            unresolvedChanges.push(...group.changes);
          },
          onNotFoundFallback: async () => {
            const fallback = await safePatchOrCreate('ObjectPermissions', null, body);
            if (value && fallback.id) value.Id = fallback.id;
          },
          onError: message => {
            console.error('ObjectPermissions save failed', {
              objectKey: group.key,
              resolvedSobjectType: sobjectType,
              recordId,
              body,
              error: message
            });
            saveErrors.push(`${group.key}: ${message}`);
            unresolvedChanges.push(...group.changes);
          }
        });
      }

      await processObjectOperations('object permissions', objectOperations);

      const systemBodies = new Map();
      for (const change of systemChanges) {
        const row = [
          ...(state.comparison.systemRows || []),
          ...(state.comparison.appPermissionRows || [])
        ].find(r => r.key === change.key);
        const setIndex = state.selected.findIndex(ps => ps.Id === change.permissionSetId);
        if (setIndex < 0 || !row) continue;
        const selectedItem = state.selected[setIndex];
        const targetSobject = getSourceType(selectedItem) === 'Profile' ? 'Profile' : 'PermissionSet';
        const targetId = targetSobject === 'Profile'
          ? (selectedItem?.setupTargetId || selectedItem?.ProfileId || change.permissionSetId)
          : change.permissionSetId;

        const currentValue = !!state.selected[setIndex]?.details?.userPermissions?.[change.permission];
        const entry = systemBodies.get(change.permissionSetId) || {
          permissionSetLabel: change.permissionSetLabel,
          targetSobject,
          targetId,
          body: {}
        };
        entry.body[change.permission] = currentValue;
        systemBodies.set(change.permissionSetId, entry);
      }

      const systemOperations = Array.from(systemBodies.entries()).map(([permissionSetId, entry]) => ({
        request: buildCompositeSobjectRequest('PATCH', entry.targetSobject || 'PermissionSet', entry.body, entry.targetId || permissionSetId),
        onError: message => {
          saveErrors.push(`${entry.permissionSetLabel}: ${message}`);
          systemChanges
            .filter(change => change.permissionSetId === permissionSetId)
            .forEach(change => unresolvedChanges.push(change));
        }
      }));

      await processCompositeOperations('system permissions', systemOperations);

      const unsupportedAccessChanges = accessChanges.filter(change =>
        change.setupEntityType === 'RecordType' ||
        String(change.key || '').startsWith('RecordType::') ||
        isUnsupportedAccessSetupType(change.setupEntityType)
      );
      const supportedAccessChanges = accessChanges.filter(change => !unsupportedAccessChanges.includes(change));
      if (unsupportedAccessChanges.length) {
        unsupportedAccessChanges.forEach(change => unresolvedChanges.push(change));
        if (unsupportedAccessChanges.some(change => change.setupEntityType === 'RecordType' || String(change.key || '').startsWith('RecordType::'))) {
          saveErrors.push('Record type visibility cannot be saved from this screen because Salesforce requires the Metadata API for that update.');
        }
        if (unsupportedAccessChanges.some(change => isUnsupportedAccessSetupType(change.setupEntityType))) {
          saveErrors.push('App usage assignments cannot be saved from this screen because Salesforce blocks that permission for this license/profile.');
        }
      }

      const accessOperations = [];
      for (const change of supportedAccessChanges) {
        const row = findAccessRow(change.key);
        const setIndex = state.selected.findIndex(ps => ps.Id === change.permissionSetId);
        const value = row?.values?.[setIndex];
        const recordId = change.recordId || value?.Id || null;

        if (change.to) {
          if (value?.Id) continue;
          accessOperations.push({
            request: buildCompositeSobjectRequest('POST', 'SetupEntityAccess', {
              ParentId: change.permissionSetId,
              SetupEntityId: change.setupEntityId
            }),
            onSuccess: result => {
              row.values[setIndex] = {
                Id: result?.result?.id || null,
                ParentId: change.permissionSetId,
                SetupEntityId: change.setupEntityId,
                SetupEntityType: change.setupEntityType,
                SetupEntityLabel: change.label,
                SetupEntityName: change.label,
                label: change.label,
                setupType: change.setupEntityType
              };
            },
            onManaged: () => {
              managedSkips.push(change.key);
              unresolvedChanges.push(change);
            },
            onError: message => {
              saveErrors.push(`${change.key}: ${message}`);
              unresolvedChanges.push(change);
            }
          });
        } else if (recordId) {
          accessOperations.push({
            request: {
              method: 'DELETE',
              url: `/services/data/${apiVersion}/sobjects/SetupEntityAccess/${recordId}`
            },
            onSuccess: () => {
              row.values[setIndex] = null;
            },
            onManaged: () => {
              managedSkips.push(change.key);
              unresolvedChanges.push(change);
            },
            onError: message => {
              saveErrors.push(`${change.key}: ${message}`);
              unresolvedChanges.push(change);
            }
          });
        }
      }

      await processCompositeOperations('access permissions', accessOperations);

      state.pendingChanges = unresolvedChanges;
      syncSelectedDetailsFromComparison();
      state.editMode = false;
      reapplyCachedFieldCatalogToComparison();
      updateRestrictionNotice();
      updateModeUI();
      renderAll();

      const failedSignatures = new Set([
        ...unresolvedChanges.map(changeSignature),
        ...restrictedSkippedChanges.map(changeSignature)
      ]);
      const successfulChanges = attemptedChanges.filter(change => !failedSignatures.has(changeSignature(change)));
      renderSaveSummary(successfulChanges, saveErrors);

      const parts = [];
      const attemptedCount = attemptedChanges.length;
      const savedCount = successfulChanges.length;
      if (savedCount > 0) parts.push(`${savedCount} change(s) saved`);
      if (restrictedSkippedChanges.length) parts.push(`⚠️ ${restrictedSkippedChanges.length} permission set group change(s) not applied`);
      if (managedSkips.length) parts.push(`⚠️ ${managedSkips.length} managed item(s) skipped: ${managedSkips.join(', ')}`);
      if (saveErrors.length) parts.push(`❌ ${saveErrors.length} error(s): ${saveErrors.join('; ')}`);

      const type = saveErrors.length ? 'error' : (managedSkips.length || restrictedSkippedChanges.length) ? 'warn' : 'success';
      setStatus(parts.join(' · ') || 'Changes applied successfully.', type);
    } catch (e) {
      setStatus(e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  /* ─────────────────────────────────────────────
     RENDER ALL
  ───────────────────────────────────────────── */
  function renderAll() {
    if (!state.comparison) return;
    renderSummaryBar();
    renderObjectTable();
    renderFieldTable();
    renderAppPermissionsTable();
    renderSystemTable();
    renderAccessTable('apexClassRows',        'apexClassTable',        'apexFilter');
    renderAccessTable('visualforceRows',       'visualforceTable',      'vfFilter');
    renderAccessTable('customPermissionRows',  'customPermissionTable', 'custPermFilter');
    renderAccessTable('connectedAppRows',      'connectedAppsTable',    'connectedAppsFilter');
    renderAccessTable('flowAccessRows',        'flowAccessTable',       'flowFilter');
    renderAccessTable('assignedAppRows',       'assignedAppsTable',     'assignedAppsFilter');
    renderAccessTable('setupAccessRows',       'setupAccessTable',      'setupFilter');
    renderChangesTable();
    updateTabCounts();
  }

  function getPermissionSetColumnClass(setIndex) {
    const sourceTypeClass = `psm-source-${getSourceTypeSlug(state.selected?.[setIndex])}`;
    return `psm-col-${setIndex % 4} ${sourceTypeClass}`;
  }

  function renderSelectedHeaderLabel(selectedItem, secondaryLabel) {
    return `${escapeHtml(getDisplayLabel(selectedItem))}<span class="psm-source-badge psm-source-badge-${getSourceTypeSlug(selectedItem)}">${escapeHtml(getSourceType(selectedItem))}</span><br><small>${escapeHtml(secondaryLabel || '')}</small>`;
  }

  function renderSelectedHeaderTitle(selectedItem) {
    return `${escapeHtml(getDisplayLabel(selectedItem))}<span class="psm-source-badge psm-source-badge-${getSourceTypeSlug(selectedItem)}">${escapeHtml(getSourceType(selectedItem))}</span>`;
  }

  function renderCompareContext() {
    if (!refs.compareContext || !state.selected.length) return;
    const profileCount = state.selected.filter(ps => getSourceType(ps) === 'Profile').length;
    const permissionSetCount = state.selected.length - profileCount;
    refs.compareContext.textContent = profileCount && permissionSetCount
      ? `Comparing ${profileCount} Profile(s) and ${permissionSetCount} Permission Set(s)`
      : profileCount
        ? `Comparing ${profileCount} Profile(s)`
        : `Comparing ${permissionSetCount} Permission Set(s)`;
  }

  function getPermissionSetGroupClasses(setIndex, columnIndex, totalColumns) {
    const classes = [getPermissionSetColumnClass(setIndex)];
    if (columnIndex === 0) classes.push('psm-group-start');
    if (columnIndex === totalColumns - 1) classes.push('psm-group-end');
    return classes.join(' ');
  }

  function getEnabledSystemPermissionCount() {
    return (state.comparison?.systemRows || []).filter(row => (row.values || []).some(Boolean)).length;
  }

  /* ─────────────────────────────────────────────
     SUMMARY BAR
  ───────────────────────────────────────────── */
  function renderSummaryBar() {
    const c = state.comparison;
    const enabledSystemPermissionCount = getEnabledSystemPermissionCount();
    const appPermissionRows = c.appPermissionRows || [];
    const activeTarget = document.querySelector('.psm-view.active')?.id || 'objectTab';
    renderCompareContext();
    const cards = [
      ['Object Perms',    c.objectRows.length, 'objectTab'],
      ['Field Perms',     getVisibleFieldRows().length, 'fieldTab'],
      ['App Perms',       appPermissionRows.length, 'appPermissionsTab'],
      ['System Perms',    enabledSystemPermissionCount, 'systemTab'],
      ['Apex Classes',    c.apexClassRows.length, 'apexClassTab'],
      ['VF Pages',        c.visualforceRows.length, 'visualforceTab'],
      ['Custom Perms',    c.customPermissionRows.length, 'customPermissionTab'],
      ['Connected Apps',  c.connectedAppRows.length, 'connectedAppsTab'],
      ['Flow Access',     c.flowAccessRows.length, 'flowAccessTab'],
      ['Assigned Apps',   c.assignedAppRows.length, 'assignedAppsTab'],
      ['Other Setup',     c.setupAccessRows.length, 'setupAccessTab'],
      ['Pending Changes', state.pendingChanges.length, 'changesTab']
    ];

    refs.summaryBar.innerHTML = cards.map(([label, value, targetId]) => `
      <button type="button" class="psm-summary-card ${activeTarget === targetId ? 'active' : ''}" data-target="${targetId}">
        <div class="sc-value">${value}</div>
        <div class="sc-label">${label}</div>
      </button>
    `).join('');

    refs.summaryBar.querySelectorAll('.psm-summary-card').forEach(card => {
      card.addEventListener('click', () => activateTab(card.dataset.target));
    });
  }

  function updateTabCounts() {
    const c = state.comparison;
    const appPermissionRows = c.appPermissionRows || [];
    const map = {
      'cnt-object':  c.objectRows.length,
      'cnt-field':   getVisibleFieldRows().length,
      'cnt-apppermissions': appPermissionRows.length,
      'cnt-system':  getEnabledSystemPermissionCount(),
      'cnt-apex':    c.apexClassRows.length,
      'cnt-vf':      c.visualforceRows.length,
      'cnt-custperm':c.customPermissionRows.length,
      'cnt-connectedapps': c.connectedAppRows.length,
      'cnt-flow': c.flowAccessRows.length,
      'cnt-assignedapps': c.assignedAppRows.length,
      'cnt-setupaccess': c.setupAccessRows.length,
      'cnt-changes': state.pendingChanges.length
    };
    Object.entries(map).forEach(([id, val]) => {
      if (refs[id]) refs[id].textContent = val;
    });
  }

  /* ─────────────────────────────────────────────
     OBJECT TABLE
  ───────────────────────────────────────────── */
  function renderObjectTable() {
    const term = (refs.objectFilter?.value || '').toLowerCase();
    const showDiffOnly = !!refs.objectDiffOnly?.checked;
    const rows = state.comparison.objectRows.filter(row => {
      const display = formatObjectDisplay(row.key);
      const isDiff = hasObjectDiff(row.values, OBJECT_PERMS);
      return (!term || buildPrimarySecondarySearchText(display).includes(term)) && (!showDiffOnly || isDiff);
    });

    const columns = `<colgroup><col class="psm-object-name-column" />${state.selected.map(() =>
      OBJECT_PERMS.map(() => '<col />').join('')
    ).join('')}</colgroup>`;
    const thead = `
      <thead>
        <tr>
          <th rowspan="2" scope="col">Object</th>
          ${state.selected.map((ps, setIndex) =>
            `<th colspan="${OBJECT_PERMS.length}" scope="colgroup" class="psm-object-source ${getPermissionSetColumnClass(setIndex)}" title="${escapeHtml(getDisplayLabelWithType(ps))}">${renderSelectedHeaderTitle(ps)}</th>`
          ).join('')}
        </tr>
        <tr>
          ${state.selected.map((ps, setIndex) =>
            OBJECT_PERMS.map((permission, columnIndex) =>
              `<th scope="col" class="${getPermissionSetGroupClasses(setIndex, columnIndex, OBJECT_PERMS.length)}" title="${escapeHtml(OBJECT_PERM_LABELS[permission])}" aria-label="${escapeHtml(OBJECT_PERM_LABELS[permission])}">${OBJECT_PERM_SHORT_LABELS[columnIndex]}</th>`
            ).join('')
          ).join('')}
        </tr>
      </thead>`;

    const tbody = `<tbody>${rows.map(row => {
      const isDiff = hasObjectDiff(row.values, OBJECT_PERMS);
      const display = formatObjectDisplay(row.key);
      const objectPermissionRow = `<tr class="${isDiff ? 'diff-row' : ''}">
        <td>${formatPrimarySecondaryCell(display.primary, display.secondary)}</td>
        ${row.values.map((value, setIndex) => (
          OBJECT_PERMS.map((permission, columnIndex) => `<td class="perm-cell ${getPermissionSetGroupClasses(setIndex, columnIndex, OBJECT_PERMS.length)}">${
            state.editMode
              ? renderToggle(setIndex, row.key, permission, !!(value && value[permission]), 'object', isPermissionSetEditLocked(setIndex, 'object'))
              : permChip(!!(value && value[permission]), OBJECT_PERM_LABELS[permission])
          }</td>`).join('')
        )).join('')}
      </tr>`;
      return objectPermissionRow;
    }).join('')}</tbody>`;

    refs.objectTable.style.minWidth = `${160 + state.selected.length * 156}px`;
    refs.objectTable.innerHTML = columns + thead + tbody;
    if (state.editMode) attachToggleListeners(refs.objectTable);
  }

  /* ─────────────────────────────────────────────
     FIELD TABLE
  ───────────────────────────────────────────── */
  function renderFieldTable() {
    const term = (refs.fieldFilter?.value || '').toLowerCase();
    const showDiffOnly = !!refs.fieldDiffOnly?.checked;
    const rows = getVisibleFieldRows().filter(row => {
      const display = formatFieldDisplay(row.key);
      const isDiff = hasFieldDiff(row.values);
      return (!term || buildPrimarySecondarySearchText(display).includes(term)) && (!showDiffOnly || isDiff);
    });

    const groupedRows = new Map();
    rows.forEach(row => {
      const [objectApiName] = String(row.key || '').split('.');
      const objectKey = objectApiName || 'Unknown';
      const bucket = groupedRows.get(objectKey) || [];
      bucket.push(row);
      groupedRows.set(objectKey, bucket);
    });

    const thead = `
      <thead><tr>
        <th>Field</th>
        ${state.selected.map((ps, setIndex) => `
          <th class="${getPermissionSetGroupClasses(setIndex, 0, 2)}">${renderSelectedHeaderLabel(ps, 'Read')}</th>
          <th class="${getPermissionSetGroupClasses(setIndex, 1, 2)}">${renderSelectedHeaderLabel(ps, 'Edit')}</th>
        `).join('')}
      </tr></thead>`;

    const objectApiNames = term
      ? Array.from(groupedRows.keys()).filter(objectApiName => 
          state.catalogs.fieldPermissionObjectsLoaded.has(objectApiName)
        )
      : getFieldObjectApiNames();

    const tbody = `<tbody>${objectApiNames.map(objectApiName => {
      const objectRows = groupedRows.get(objectApiName) || [];
      const objectDisplay = formatObjectDisplay(objectApiName);
      const isCollapsed = term ? false : state.collapsedFieldObjects.has(objectApiName);
      const isLoaded = state.catalogs.fieldPermissionObjectsLoaded.has(objectApiName);
      const isLoading = state.catalogs.fieldPermissionObjectLoadPromises.has(objectApiName);
      const countLabel = isLoaded ? `${objectRows.length} field(s)` : (isLoading ? 'Loading…' : 'Click to load');
      const groupHeader = `<tr class="psm-field-group-row">
        <td colspan="${1 + (state.selected.length * 2)}">
          <button type="button" class="psm-collapse-toggle" data-object-api-name="${escapeHtml(objectApiName)}" aria-expanded="${isCollapsed ? 'false' : 'true'}">
            <span class="psm-collapse-icon">${isCollapsed ? '▸' : '▾'}</span>
            <span class="psm-collapse-label">${escapeHtml(objectDisplay.primary || objectApiName)}</span>
            ${objectDisplay.secondary ? `<span class="psm-collapse-secondary">${escapeHtml(objectDisplay.secondary)}</span>` : ''}
            <span class="psm-collapse-count">${countLabel}</span>
          </button>
        </td>
      </tr>`;

      if (isCollapsed) {
        return groupHeader;
      }

      if (!isLoaded) {
        return groupHeader + `<tr><td colspan="${1 + (state.selected.length * 2)}"><div class="psm-empty"><div class="psm-empty-text">${isLoading ? 'Loading field permissions…' : 'Click the object row to load its field permissions.'}</div></div></td></tr>`;
      }

      const groupBody = objectRows.map(row => {
        const isDiff = hasFieldDiff(row.values);
        const display = formatFieldDisplay(row.key);
        const metadata = getFieldMetadata(row.key);
        const effectiveValues = row.values.map(value => coerceFieldValueForDisplay(row.key, value));
        return `<tr class="${isDiff ? 'diff-row' : ''}">
          <td>${formatPrimarySecondaryCell(display.primary, display.secondary)}</td>
          ${effectiveValues.map((val, setIndex) => `
            <td class="perm-cell ${getPermissionSetGroupClasses(setIndex, 0, 2)}">${state.editMode
              ? renderToggle(setIndex, row.key, 'PermissionsRead', !!(val && val.PermissionsRead), 'field', !fieldPermissionRules.isFieldReadAllowed(metadata) || isPermissionSetEditLocked(setIndex, 'field'))
              : permChip(!!(val && val.PermissionsRead), 'R')}</td>
            <td class="perm-cell ${getPermissionSetGroupClasses(setIndex, 1, 2)}">${state.editMode
              ? renderToggle(setIndex, row.key, 'PermissionsEdit', !!(val && val.PermissionsEdit), 'field', !fieldPermissionRules.isFieldEditAllowed(metadata) || isPermissionSetEditLocked(setIndex, 'field'))
              : permChip(!!(val && val.PermissionsEdit), 'E')}</td>
          `).join('')}
        </tr>`;
      }).join('');

      return groupHeader + groupBody;
    }).join('')}</tbody>`;

    refs.fieldTable.innerHTML = thead + tbody;
    if (state.editMode) attachToggleListeners(refs.fieldTable);
    attachFieldGroupListeners();
  }

  function attachFieldGroupListeners() {
    refs.fieldTable?.querySelectorAll('.psm-collapse-toggle').forEach(button => {
      button.addEventListener('click', async () => {
        const objectApiName = button.dataset.objectApiName;
        if (!objectApiName) return;

        if (!state.catalogs.fieldPermissionObjectsLoaded.has(objectApiName)) {
          state.collapsedFieldObjects.delete(objectApiName);
          renderFieldTable();
          await ensureFieldPermissionsLoadedForObject(objectApiName, { showOverlay: true });
          return;
        }

        if (state.collapsedFieldObjects.has(objectApiName)) {
          state.collapsedFieldObjects.delete(objectApiName);
        } else {
          state.collapsedFieldObjects.add(objectApiName);
        }

        renderFieldTable();
      });
    });
  }

  function toggleCollapseAllFields() {
    const objectApiNames = getFieldObjectApiNames();
    const shouldCollapse = objectApiNames.some(objectApiName => !state.collapsedFieldObjects.has(objectApiName));

    objectApiNames.forEach(objectApiName => {
      if (shouldCollapse) state.collapsedFieldObjects.add(objectApiName);
      else state.collapsedFieldObjects.delete(objectApiName);
    });

    if (refs.btnCollapseFields) {
      refs.btnCollapseFields.textContent = shouldCollapse ? 'Expand All' : 'Collapse All';
    }

    renderFieldTable();
  }

  /* ─────────────────────────────────────────────
     SYSTEM TABLE
  ───────────────────────────────────────────── */
  function renderBooleanPermissionTable(rows, tableEl, filterEl, diffToggleEl, headerLabel) {
    if (!tableEl) return;
    const term = (filterEl?.value || '').toLowerCase();
    const showDiffOnly = !!diffToggleEl?.checked;
    const filteredRows = (rows || []).filter(row => {
      const haystack = `${row.label || ''} ${row.description || ''} ${row.key || ''}`.toLowerCase();
      const isDiff = new Set(row.values.map(Boolean)).size > 1;
      return (!term || haystack.includes(term)) && (!showDiffOnly || isDiff);
    });

    const thead = `
      <thead><tr>
        <th>${headerLabel}</th>
        ${state.selected.map((ps, setIndex) => `<th class="${getPermissionSetGroupClasses(setIndex, 0, 1)}">${renderSelectedHeaderTitle(ps)}</th>`).join('')}
      </tr></thead>`;

    const tbody = `<tbody>${filteredRows.map(row => {
      const isDiff = new Set(row.values.map(Boolean)).size > 1;
      return `<tr class="${isDiff ? 'diff-row' : ''}">
        <td>${formatPrimarySecondaryCell(row.label || row.key, row.description || '')}</td>
        ${row.values.map((value, setIndex) => `<td class="perm-cell ${getPermissionSetGroupClasses(setIndex, 0, 1)}">${
          state.editMode
            ? renderToggle(setIndex, row.key, row.key, !!value, 'system', !row.queryable || isPermissionSetEditLocked(setIndex, 'system'))
            : permChip(!!value, '✓')
        }</td>`).join('')}
      </tr>`;
    }).join('')}</tbody>`;

    tableEl.innerHTML = thead + tbody;
    if (state.editMode) attachToggleListeners(tableEl);
  }

  function renderAppPermissionsTable() {
    renderBooleanPermissionTable(
      state.comparison?.appPermissionRows,
      refs.appPermissionsTable,
      refs.appPermissionsFilter,
      refs.appPermissionsDiffOnly,
      'App Permission'
    );
  }

  function renderSystemTable() {
    renderBooleanPermissionTable(
      state.comparison?.systemRows,
      refs.systemTable,
      refs.systemFilter,
      refs.systemDiffOnly,
      'System Permission'
    );
  }

  /* ─────────────────────────────────────────────
     UNIFIED ACCESS TABLE
     (Apex, VF, Custom Perms, Flow, Setup Access)
     All use the same layout: Name | PS1 | PS2 | ...
     Value is a ✓ or — based on whether the row
     exists in that PS.
  ───────────────────────────────────────────── */
  function renderAccessTable(rowsKey, tableId, filterId) {
    const tableEl = refs[tableId];
    if (!tableEl) return;

    const term = (filterId && refs[filterId]?.value || '').toLowerCase();
    const diffToggleMap = {
      apexClassRows: refs.apexDiffOnly,
      visualforceRows: refs.vfDiffOnly,
      customPermissionRows: refs.custPermDiffOnly,
      connectedAppRows: refs.connectedAppsDiffOnly,
      flowAccessRows: refs.flowDiffOnly,
      assignedAppRows: refs.assignedAppsDiffOnly,
      setupAccessRows: refs.setupDiffOnly
    };
    const showDiffOnly = !!diffToggleMap[rowsKey]?.checked;
    let rows = state.comparison[rowsKey] || [];
    if (term) rows = rows.filter(row => buildAccessSearchText(row).includes(term));
    if (showDiffOnly) rows = rows.filter(row => new Set(row.values.map(value => !!value)).size > 1);

    if (!rows.length) {
      tableEl.innerHTML = emptyTableHtml(
        filterId && refs[filterId]?.value
          ? 'No results match your filter.'
          : 'None configured in the selected permission sets.'
      );
      return;
    }

    const thead = `
      <thead><tr>
        <th>Name</th>
        ${state.selected.map((ps, setIndex) => `<th class="${getPermissionSetGroupClasses(setIndex, 0, 1)}">${renderSelectedHeaderTitle(ps)}</th>`).join('')}
      </tr></thead>`;

    const tbody = `<tbody>${rows.map(row => {
      const isDiff = new Set(row.values.map(v => !!v)).size > 1;
      const display = getAccessDisplayInfo(row);
      return `<tr class="${isDiff ? 'diff-row' : ''}">
        <td>${formatAccessCell(display)}</td>
        ${row.values.map((value, setIndex) => `<td class="perm-cell ${getPermissionSetGroupClasses(setIndex, 0, 1)}">${
          state.editMode
            ? renderToggle(setIndex, row.key, 'Access', !!value, 'access', isPermissionSetEditLocked(setIndex, 'access') || isUnsupportedAccessSetupType(display.setupType))
            : (value
              ? `<span class="perm-yes">✓</span>`
              : `<span class="perm-no">—</span>`)
        }</td>`).join('')}
      </tr>`;
    }).join('')}</tbody>`;

    tableEl.innerHTML = thead + tbody;
    if (state.editMode) attachToggleListeners(tableEl);
  }

  /* ─────────────────────────────────────────────
     CHANGES TABLE
  ───────────────────────────────────────────── */
  function renderChangesTable() {
    if (!refs.changesTable) return;

    const term = (refs.changesFilter?.value || '').toLowerCase();
    const rows = state.pendingChanges.filter(change => {
      const haystack = [
        change.permissionSetLabel,
        change.changeType,
        change.key,
        change.permission,
        change.sobjectType,
        change.field
      ].filter(Boolean).join(' ').toLowerCase();
      return !term || haystack.includes(term);
    });

    const thead = `
      <thead><tr>
        <th>#</th><th>Permission Set</th><th>Type</th>
        <th>Key</th><th>Permission</th><th>From</th><th>To</th>
      </tr></thead>`;

    const tbody = rows.length
      ? `<tbody>${rows.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(c.permissionSetLabel)}</td>
            <td>${escapeHtml(c.changeType)}</td>
            <td>${escapeHtml(c.key)}</td>
            <td>${escapeHtml(c.permission)}</td>
            <td>${c.from ? '<span class="perm-yes">✓</span>' : '<span class="perm-no">—</span>'}</td>
            <td>${c.to   ? '<span class="perm-yes">✓</span>' : '<span class="perm-no">—</span>'}</td>
          </tr>`).join('')}
        </tbody>`
      : `<tbody><tr><td colspan="7" style="text-align:center;color:#706e6b;padding:24px;">No pending changes.</td></tr></tbody>`;

    refs.changesTable.innerHTML = thead + tbody;
    if (refs['cnt-changes']) refs['cnt-changes'].textContent = state.pendingChanges.length;
    if (refs.summaryBar) renderSummaryBar();
    updateModeUI();
  }

  function resolveCatalogEntry(entries, rawValue, accessors) {
    const search = String(rawValue || '').trim().toLowerCase();
    if (!search) return null;

    const exact = (entries || []).find(item => accessors.some(accessor => String(accessor(item) || '').trim().toLowerCase() === search));
    if (exact) return exact;

    const matches = (entries || []).filter(item => accessors.some(accessor => String(accessor(item) || '').toLowerCase().includes(search)));
    return matches.length === 1 ? matches[0] : null;
  }

  function resolveObjectCatalogEntry(rawValue) {
    return resolveCatalogEntry(state.catalogs.objects, rawValue, [
      item => item.key,
      item => item.label,
      item => buildObjectCatalogValue(item)
    ]);
  }

  function normalizeObjectApiNameInput(rawValue) {
    const value = String(rawValue || '').trim();
    const parenthesizedApiName = value.match(/\(([A-Za-z][A-Za-z0-9_]*__(?:c|mdt|x|b|e)|[A-Za-z][A-Za-z0-9_]*)\)$/);
    return parenthesizedApiName?.[1] || value;
  }

  function looksLikeObjectApiName(value) {
    return /^[A-Za-z][A-Za-z0-9_]*(?:__(?:c|mdt|x|b|e))?$/.test(String(value || '').trim());
  }

  function resolveFieldObjectEntry(rawValue) {
    const catalogEntry = resolveObjectCatalogEntry(rawValue);
    if (catalogEntry) return catalogEntry;

    const objectApiName = normalizeObjectApiNameInput(rawValue);
    if (!looksLikeObjectApiName(objectApiName) || looksLikeSalesforceId(objectApiName)) return null;

    return {
      key: objectApiName,
      label: objectApiName
    };
  }

  function resolveAccessCatalogEntry(section, rawValue) {
    return resolveCatalogEntry(state.catalogs.access[section] || [], rawValue, [
      item => item.key,
      item => item.entityId,
      item => item.label,
      item => item.secondary,
      item => buildAccessCatalogValue(item)
    ]);
  }

  function addObjectFromCatalog() {
    const entry = resolveObjectCatalogEntry(refs.objectAddSearch?.value);
    if (!entry) {
      setStatus('Select a valid object to add.', 'error');
      return;
    }

    const exists = state.comparison.objectRows.some(row => row.key === entry.key);
    if (!exists) {
      state.comparison.objectRows.push({
        key: entry.key,
        label: entry.label,
        catalogDisplay: entry,
        values: Array(state.selected.length).fill(null)
      });
      state.comparison.objectRows.sort((left, right) => String(left.key).localeCompare(String(right.key)));
    }

    if (refs.objectAddSearch) refs.objectAddSearch.value = '';
    updateAddControlState();
    renderObjectTable();
    updateTabCounts();
    renderSummaryBar();
    setStatus(`Added ${entry.label} to Object Permissions. Toggle the permissions you want to grant.`, 'success');
  }

  async function loadFieldObjectFromCatalog() {
    const entry = resolveFieldObjectEntry(refs.fieldObjectAddSearch?.value);
    if (!entry) {
      setStatus('Select a valid object to load fields for.', 'error');
      return;
    }

    await ensureFieldPermissionsLoadedForObject(entry.key, { showOverlay: true });
    const loadedFieldCount = (state.catalogs.fieldMaps.get(entry.key) || []).length ||
      (state.comparison?.fieldRows || []).filter(row => String(row.key || '').startsWith(`${entry.key}.`)).length;

    if (refs.fieldObjectAddSearch) refs.fieldObjectAddSearch.value = '';
    updateAddControlState();
    renderFieldTable();
    updateTabCounts();
    renderSummaryBar();
    if (!loadedFieldCount) {
      setStatus(`No fields were returned for ${entry.label || entry.key}. This can happen if Salesforce does not expose that object or its field metadata to the current session.`, 'warn');
      return;
    }
    setStatus(`Loaded field permissions for ${entry.label || entry.key}.`, 'success');
  }

  function isSupportedObjectPermissionTarget(objectApiName) {
    const name = String(objectApiName || '').trim();
    if (!name) return false;

    return !(
      name.endsWith('Feed') ||
      name.endsWith('History') ||
      name.endsWith('Share') ||
      name.endsWith('ChangeEvent')
    );
  }

  function addAccessFromCatalog(section, inputId) {
    const entry = resolveAccessCatalogEntry(section, refs[inputId]?.value);
    if (!entry) {
      setStatus('Select a valid item to add.', 'error');
      return;
    }

    const rows = state.comparison[section] || [];
    const exists = rows.some(row => row.key === entry.key || extractEntityId(row.key) === entry.entityId);
    if (!exists) {
      rows.push({
        key: entry.key,
        label: entry.label,
        catalogDisplay: entry,
        values: Array(state.selected.length).fill(null)
      });
      rows.sort((left, right) => buildAccessSearchText(left).localeCompare(buildAccessSearchText(right)));
    }

    if (refs[inputId]) refs[inputId].value = '';
    updateAddControlState();
    renderAccessTable(section, accessTableIdForSection(section), accessFilterIdForSection(section));
    updateTabCounts();
    renderSummaryBar();
    setStatus(`Added ${entry.label} to ${accessSectionTitle(section)}. Toggle the columns you want to grant.`, 'success');
  }

  function accessTableIdForSection(section) {
    return {
      apexClassRows: 'apexClassTable',
      visualforceRows: 'visualforceTable',
      customPermissionRows: 'customPermissionTable',
      flowAccessRows: 'flowAccessTable',
      assignedAppRows: 'assignedAppsTable',
      connectedAppRows: 'connectedAppsTable',
      setupAccessRows: 'setupAccessTable'
    }[section];
  }

  function accessFilterIdForSection(section) {
    return {
      apexClassRows: 'apexFilter',
      visualforceRows: 'vfFilter',
      customPermissionRows: 'custPermFilter',
      flowAccessRows: 'flowFilter',
      assignedAppRows: 'assignedAppsFilter',
      connectedAppRows: 'connectedAppsFilter',
      setupAccessRows: 'setupFilter'
    }[section];
  }

  function accessSectionTitle(section) {
    return {
      apexClassRows: 'Apex Classes',
      visualforceRows: 'Visualforce',
      customPermissionRows: 'Custom Permissions',
      flowAccessRows: 'Flow Access',
      assignedAppRows: 'Assigned Apps',
      connectedAppRows: 'Assigned Connected Apps',
      setupAccessRows: 'Other Setup Access'
    }[section] || 'Access';
  }

  /* ─────────────────────────────────────────────
     TOGGLE HELPERS
  ───────────────────────────────────────────── */
  function renderToggle(setIndex, key, permission, checked, changeType, disabled = false) {
    return `<input type="checkbox" class="psm-toggle"
      data-set-index="${setIndex}"
      data-key="${escapeHtml(key)}"
      data-permission="${escapeHtml(permission)}"
      data-change-type="${changeType}"
      ${disabled ? 'disabled' : ''}
      ${checked ? 'checked' : ''}>`;
  }

  function attachToggleListeners(tableEl) {
    tableEl.querySelectorAll('.psm-toggle').forEach(el => {
      el.addEventListener('change', onToggleChange);
    });
  }

  async function onToggleChange(e) {
    const el = e.target;
    const setIndex  = Number(el.dataset.setIndex);
    const key       = el.dataset.key;
    const permission = el.dataset.permission;
    const changeType = el.dataset.changeType;
    const to = !!el.checked;

    if (changeType === 'field')  handleFieldToggle(setIndex, key, permission, to);
    if (changeType === 'object') handleObjectToggle(setIndex, key, permission, to);
    if (changeType === 'system') handleSystemToggle(setIndex, key, to);
    if (changeType === 'access') handleAccessToggle(setIndex, key, to);
    if (changeType === 'object' && permission === 'PermissionsRead') {
      renderObjectTable();
      renderFieldTable();
      renderSummaryBar();
      updateTabCounts();
    }
    renderChangesTable();
    setStatus(`${state.pendingChanges.length} pending change(s).`, 'info');
  }

  function upsertPendingChange(change) {
    const index = state.pendingChanges.findIndex(c =>
      c.permissionSetId === change.permissionSetId &&
      c.changeType === change.changeType &&
      c.key === change.key &&
      c.permission === change.permission
    );

    if (change.from === change.to) {
      if (index >= 0) state.pendingChanges.splice(index, 1);
      return;
    }

    if (index >= 0) state.pendingChanges[index] = { ...state.pendingChanges[index], ...change };
    else state.pendingChanges.push(change);
  }

  function handleFieldToggle(setIndex, key, permission, to) {
    if (isPermissionSetEditLocked(setIndex, 'field')) return;

    const row = state.comparison.fieldRows.find(r => r.key === key);
    if (!row) return;
    const metadata = getFieldMetadata(key);
    if (!fieldPermissionRules.isFieldReadAllowed(metadata)) return;
    if (permission === 'PermissionsEdit' && !fieldPermissionRules.isFieldEditAllowed(metadata)) return;

    const [, ...fieldParts] = String(key || '').split('.');
    const fieldApiName = fieldParts.join('.');

    const current = row.values[setIndex];
    const existing = state.pendingChanges.find(c =>
      c.permissionSetId === state.selected[setIndex].Id && c.changeType === 'field' &&
      c.key === key && c.permission === permission
    );
    const from = existing ? existing.from : !!(current && current[permission]);

    upsertPendingChange({
      permissionSetId: state.selected[setIndex].Id,
      permissionSetLabel: getDisplayLabelWithType(state.selected[setIndex]),
      changeType: 'field', key, permission, from, to,
      recordId: current?.Id || null,
      sobjectType: current?.SobjectType || key.split('.')[0],
      field: current?.Field || fieldApiName
    });

    if (current) current[permission] = to;
    else row.values[setIndex] = {
      Id: null, ParentId: state.selected[setIndex].Id,
      SobjectType: key.split('.')[0], Field: fieldApiName,
      PermissionsRead: permission === 'PermissionsRead' ? to : autoGrantFieldRead(key),
      PermissionsEdit: permission === 'PermissionsEdit' ? to : false
    };

    if (permission === 'PermissionsEdit' && to) {
      const value = row.values[setIndex];
      if (!value.PermissionsRead) {
        handleFieldToggle(setIndex, key, 'PermissionsRead', true);
      }
    } else if (permission === 'PermissionsRead' && !to) {
      const value = row.values[setIndex];
      if (value?.PermissionsEdit) {
        handleFieldToggle(setIndex, key, 'PermissionsEdit', false);
      }
    }
  }

  function handleObjectToggle(setIndex, key, permission, to) {
    if (isPermissionSetEditLocked(setIndex, 'object')) return;

    const row = state.comparison.objectRows.find(r => r.key === key);
    if (!row) return;
    const current = row.values[setIndex];
    const existing = state.pendingChanges.find(c =>
      c.permissionSetId === state.selected[setIndex].Id && c.changeType === 'object' &&
      c.key === key && c.permission === permission
    );
    const from = existing ? existing.from : !!(current && current[permission]);

    upsertPendingChange({
      permissionSetId: state.selected[setIndex].Id,
      permissionSetLabel: getDisplayLabelWithType(state.selected[setIndex]),
      changeType: 'object', key, permission, from, to,
      recordId: current?.Id || null,
      sobjectType: !looksLikeSalesforceId(key) ? key : resolveObjectApiName(row, key)
    });

    if (current) {
      current.SobjectType = !looksLikeSalesforceId(key) ? key : resolveObjectApiName(row, key);
      current[permission] = to;
    }
    else row.values[setIndex] = {
      Id: null, ParentId: state.selected[setIndex].Id, SobjectType: !looksLikeSalesforceId(key) ? key : resolveObjectApiName(row, key),
      PermissionsRead: permission === 'PermissionsRead' ? to : false,
      PermissionsCreate: permission === 'PermissionsCreate' ? to : false,
      PermissionsEdit: permission === 'PermissionsEdit' ? to : false,
      PermissionsDelete: permission === 'PermissionsDelete' ? to : false,
      PermissionsViewAllRecords: permission === 'PermissionsViewAllRecords' ? to : false,
      PermissionsModifyAllRecords: permission === 'PermissionsModifyAllRecords' ? to : false
    };

    const value = row.values[setIndex];
    if (permission === 'PermissionsEdit' && to && !value.PermissionsRead) {
      handleObjectToggle(setIndex, key, 'PermissionsRead', true);
    } else if (permission === 'PermissionsRead' && !to) {
      if (value?.PermissionsEdit) handleObjectToggle(setIndex, key, 'PermissionsEdit', false);
      if (value?.PermissionsViewAllRecords) handleObjectToggle(setIndex, key, 'PermissionsViewAllRecords', false);
      if (value?.PermissionsModifyAllRecords) handleObjectToggle(setIndex, key, 'PermissionsModifyAllRecords', false);
    } else if (permission === 'PermissionsModifyAllRecords' && to) {
      if (!value.PermissionsRead) handleObjectToggle(setIndex, key, 'PermissionsRead', true);
      if (!value.PermissionsViewAllRecords) handleObjectToggle(setIndex, key, 'PermissionsViewAllRecords', true);
      if (!value.PermissionsEdit) handleObjectToggle(setIndex, key, 'PermissionsEdit', true);
    } else if (permission === 'PermissionsViewAllRecords' && to && !value.PermissionsRead) {
      handleObjectToggle(setIndex, key, 'PermissionsRead', true);
    }
  }

  function handleSystemToggle(setIndex, key, to) {
    if (isPermissionSetEditLocked(setIndex, 'system')) return;

    const row = [
      ...(state.comparison.systemRows || []),
      ...(state.comparison.appPermissionRows || [])
    ].find(r => r.key === key);
    if (!row) return;
    const existing = state.pendingChanges.find(c =>
      c.permissionSetId === state.selected[setIndex].Id && c.changeType === 'system' &&
      c.key === key && c.permission === key
    );
    const from = existing ? existing.from : !!row.values[setIndex];

    upsertPendingChange({
      permissionSetId: state.selected[setIndex].Id,
      permissionSetLabel: getDisplayLabelWithType(state.selected[setIndex]),
      changeType: 'system', key, permission: key, from, to
    });

    row.values[setIndex] = to;
    if (!state.selected[setIndex].details.userPermissions) state.selected[setIndex].details.userPermissions = {};
    state.selected[setIndex].details.userPermissions[key] = to;
  }

  function handleAccessToggle(setIndex, key, to) {
    if (isPermissionSetEditLocked(setIndex, 'access')) return;

    const row = findAccessRow(key);
    if (!row) return;
    const display = getAccessDisplayInfo(row);
    if (isUnsupportedAccessSetupType(display.setupType)) return;

    const current = row.values[setIndex];
    const existing = state.pendingChanges.find(c =>
      c.permissionSetId === state.selected[setIndex].Id && c.changeType === 'access' &&
      c.key === key && c.permission === 'Access'
    );
    const from = existing ? existing.from : !!current;
    upsertPendingChange({
      permissionSetId: state.selected[setIndex].Id,
      permissionSetLabel: getDisplayLabelWithType(state.selected[setIndex]),
      changeType: 'access',
      key,
      permission: 'Access',
      from,
      to,
      recordId: current?.Id || null,
      setupEntityId: display.entityId,
      setupEntityType: display.setupType,
      label: display.label || display.entityId
    });

    if (to) {
      row.values[setIndex] = current || {
        Id: null,
        ParentId: state.selected[setIndex].Id,
        SetupEntityId: display.entityId,
        SetupEntityType: display.setupType,
        SetupEntityLabel: display.label,
        SetupEntityName: display.label,
        label: display.label,
        setupType: display.setupType
      };
    } else {
      row.values[setIndex] = null;
    }
  }

  /* ─────────────────────────────────────────────
     EXPORT WORKBOOK
  ───────────────────────────────────────────── */
  async function exportCsv() {
    if (!state.comparison) return;
    showLoading('Preparing export…');
    try {
      setLoadingLabel('Loading field permissions for export…');
      await ensureSelectedFieldPermissionsLoaded({ showOverlay: false });
      setLoadingLabel('Loading field metadata for export…');
      await ensureVisibleFieldMetadataLoaded({ showOverlay: false });

      const worksheets = [
        {
          name: 'Object Permissions',
          rows: [
            ['Object Label', 'Object API Name', 'Permission', ...state.selected.map(ps => getDisplayLabelWithType(ps))],
            ...state.comparison.objectRows.flatMap(row => {
              const display = formatObjectDisplay(resolveObjectApiName(row, row.key));
              return OBJECT_PERMS.map(permission => [
                display.primary,
                resolveObjectApiName(row, row.key),
                OBJECT_PERM_LABELS[permission] || permission,
                ...row.values.map(value => (value && value[permission]) ? 'TRUE' : 'FALSE')
              ]);
            })
          ]
        },
        {
          name: 'Field Permissions',
          rows: [
            ['Object API Name', 'Field API Name', 'Permission', ...state.selected.map(ps => getDisplayLabelWithType(ps))],
            ...getVisibleFieldRows().flatMap(row => {
              const [objectApiName, ...fieldParts] = String(row.key || '').split('.');
              const fieldApiName = fieldParts.join('.') || row.key || '';
              const values = row.values.map(value => coerceFieldValueForDisplay(row.key, value));
              return [
                ['Read', ...values.map(value => (value && value.PermissionsRead) ? 'TRUE' : 'FALSE')],
                ['Edit', ...values.map(value => (value && value.PermissionsEdit) ? 'TRUE' : 'FALSE')]
              ].map(([permission, ...flags]) => [objectApiName, fieldApiName, permission, ...flags]);
            })
          ]
        },
        {
          name: 'App Permissions',
          rows: [
            ['Label', 'API Name', 'Description', ...state.selected.map(ps => getDisplayLabelWithType(ps))],
            ...(state.comparison.appPermissionRows || []).map(row => [
              row.label || row.key,
              row.key,
              row.description || '',
              ...row.values.map(value => value ? 'TRUE' : 'FALSE')
            ])
          ]
        },
        {
          name: 'System Permissions',
          rows: [
            ['Label', 'API Name', 'Description', ...state.selected.map(ps => getDisplayLabelWithType(ps))],
            ...state.comparison.systemRows.map(row => [
              row.label || row.key,
              row.key,
              row.description || '',
              ...row.values.map(value => value ? 'TRUE' : 'FALSE')
            ])
          ]
        },
        buildAccessWorksheet('Apex Classes', 'apexClassRows'),
        buildAccessWorksheet('Visualforce', 'visualforceRows'),
        buildAccessWorksheet('Custom Permissions', 'customPermissionRows'),
        buildAccessWorksheet('Connected Apps', 'connectedAppRows'),
        buildAccessWorksheet('Flow Access', 'flowAccessRows'),
        buildAccessWorksheet('Assigned Apps', 'assignedAppRows'),
        buildAccessWorksheet('Other Setup Access', 'setupAccessRows')
      ];

      setLoadingLabel('Building export file…');
      await waitForNextFrame();

      let blob;
      let fileName;
      const exportBaseName = buildExportFileBaseName();
      try {
        blob = await buildXlsxBlob(worksheets);
        fileName = `${exportBaseName}.xlsx`;
      } catch (error) {
        console.warn('XLSX export failed, falling back to XML workbook export.', error);
        const workbookXml = buildWorkbookXml(worksheets);
        blob = new Blob([workbookXml], { type: 'application/xml;charset=utf-8;' });
        fileName = `${exportBaseName}.xml`;
      }

      setLoadingLabel('Starting download…');
      await waitForNextFrame();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const exportedRowCount = worksheets.reduce((count, sheet) => count + Math.max(0, sheet.rows.length - 1), 0);
      setStatus(`Exported ${exportedRowCount} rows to workbook tabs.`, 'success');
    } catch (error) {
      console.error('Export failed', error);
      setStatus(`Export failed: ${error.message}`, 'error');
    } finally {
      hideLoading();
    }
  }

  function waitForNextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function buildAccessWorksheet(name, rowsKey) {
    return {
      name,
      rows: [
        ['Label', 'Entity Id', 'Type', ...state.selected.map(ps => getDisplayLabelWithType(ps))],
        ...(state.comparison?.[rowsKey] || []).map(row => {
          const display = getAccessDisplayInfo(row);
          return [
            display.label || display.entityId || row.key,
            display.entityId || '',
            display.setupType || '',
            ...row.values.map(value => value ? 'TRUE' : 'FALSE')
          ];
        })
      ]
    };
  }

  function buildExportFileBaseName() {
    const labels = (state.selected || [])
      .map(ps => String(ps?.Label || '').trim())
      .filter(Boolean);

    const joinedLabels = labels.length ? labels.join(' vs ') : 'comparison';
    const safeLabels = joinedLabels
      .replace(/[<>:"/\\|?*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const baseName = `permission-set-${safeLabels || 'comparison'}`;
    return baseName.length > 140 ? `${baseName.slice(0, 137).trim()}...` : baseName;
  }

  async function buildXlsxBlob(worksheets) {
    const encoder = new TextEncoder();
    const sheetNames = buildUniqueWorksheetNames(worksheets.map(sheet => sheet.name));
    const entries = [
      {
        name: '[Content_Types].xml',
        data: encoder.encode(buildXlsxContentTypesXml(worksheets.length))
      },
      {
        name: '_rels/.rels',
        data: encoder.encode(buildXlsxRootRelsXml())
      },
      {
        name: 'xl/workbook.xml',
        data: encoder.encode(buildXlsxWorkbookXml(sheetNames))
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: encoder.encode(buildXlsxWorkbookRelsXml(worksheets.length))
      },
      {
        name: 'xl/styles.xml',
        data: encoder.encode(buildXlsxStylesXml())
      },
      ...worksheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        data: encoder.encode(buildXlsxWorksheetXml(sheet.rows || []))
      }))
    ];

    const zipBytes = await buildZipArchive(entries);
    return new Blob([zipBytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function buildUniqueWorksheetNames(names) {
    const seen = new Set();
    return (names || []).map((name, index) => {
      const baseName = sanitizeWorksheetName(name || `Sheet ${index + 1}`);
      let candidate = baseName || `Sheet ${index + 1}`;
      let suffix = 2;
      while (seen.has(candidate)) {
        const suffixLabel = ` (${suffix})`;
        candidate = `${baseName.slice(0, Math.max(0, 31 - suffixLabel.length))}${suffixLabel}`;
        suffix += 1;
      }
      seen.add(candidate);
      return candidate;
    });
  }

  function buildXlsxContentTypesXml(worksheetCount) {
    const worksheetOverrides = Array.from({ length: worksheetCount }, (_, index) => (
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${worksheetOverrides}
</Types>`;
  }

  function buildXlsxRootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  }

  function buildXlsxWorkbookXml(sheetNames) {
    const sheetsXml = (sheetNames || []).map((name, index) => (
      `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetsXml}</sheets>
</workbook>`;
  }

  function buildXlsxWorkbookRelsXml(worksheetCount) {
    const sheetRelationships = Array.from({ length: worksheetCount }, (_, index) => (
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    )).join('');
    const stylesRelationship = `<Relationship Id="rId${worksheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
  ${stylesRelationship}
</Relationships>`;
  }

  function buildXlsxStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
  }

  function buildXlsxWorksheetXml(rows) {
    const sheetRows = (rows || []).map((row, rowIndex) => {
      const cells = (row || []).map((value, columnIndex) => {
        const ref = `${toExcelColumnName(columnIndex + 1)}${rowIndex + 1}`;
        if (value === 'TRUE' || value === 'FALSE') {
          return `<c r="${ref}" t="b"><v>${value === 'TRUE' ? '1' : '0'}</v></c>`;
        }

        const text = String(value ?? '');
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
      }).join('');

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
  }

  function toExcelColumnName(index) {
    let value = Math.max(1, Number(index) || 1);
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  async function buildZipArchive(entries) {
    const preparedEntries = [];
    for (const entry of entries) {
      preparedEntries.push(await prepareZipEntry(entry));
    }

    const parts = [];
    const centralDirectoryParts = [];
    let offset = 0;
    const { dosDate, dosTime } = getZipDosDateTime(new Date());

    preparedEntries.forEach(entry => {
      const localHeader = createZipLocalHeader(entry, dosDate, dosTime);
      parts.push(localHeader, entry.nameBytes, entry.compressedData);

      centralDirectoryParts.push(createZipCentralDirectoryHeader(entry, dosDate, dosTime, offset), entry.nameBytes);
      offset += localHeader.length + entry.nameBytes.length + entry.compressedData.length;
    });

    const centralDirectorySize = centralDirectoryParts.reduce((sum, part) => sum + part.length, 0);
    const endOfCentralDirectory = createZipEndOfCentralDirectory(preparedEntries.length, centralDirectorySize, offset);
    return concatUint8Arrays([...parts, ...centralDirectoryParts, endOfCentralDirectory]);
  }

  async function prepareZipEntry(entry) {
    const nameBytes = new TextEncoder().encode(String(entry.name || 'file'));
    const uncompressedData = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || []);
    const compressedData = await compressZipData(uncompressedData);
    const useCompression = compressedData.length < uncompressedData.length;

    return {
      nameBytes,
      uncompressedData,
      compressedData: useCompression ? compressedData : uncompressedData,
      compressionMethod: useCompression ? 8 : 0,
      crc32: computeCrc32(uncompressedData)
    };
  }

  async function compressZipData(data) {
    if (typeof CompressionStream !== 'function') {
      return data;
    }

    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  function createZipLocalHeader(entry, dosDate, dosTime) {
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entry.compressionMethod, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, entry.crc32 >>> 0, true);
    view.setUint32(18, entry.compressedData.length, true);
    view.setUint32(22, entry.uncompressedData.length, true);
    view.setUint16(26, entry.nameBytes.length, true);
    view.setUint16(28, 0, true);
    return header;
  }

  function createZipCentralDirectoryHeader(entry, dosDate, dosTime, offset) {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, entry.compressionMethod, true);
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint32(16, entry.crc32 >>> 0, true);
    view.setUint32(20, entry.compressedData.length, true);
    view.setUint32(24, entry.uncompressedData.length, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    return header;
  }

  function createZipEndOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
    const footer = new Uint8Array(22);
    const view = new DataView(footer.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralDirectorySize, true);
    view.setUint32(16, centralDirectoryOffset, true);
    view.setUint16(20, 0, true);
    return footer;
  }

  function concatUint8Arrays(parts) {
    const totalLength = (parts || []).reduce((sum, part) => sum + (part?.length || 0), 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    (parts || []).forEach(part => {
      if (!part?.length) return;
      combined.set(part, offset);
      offset += part.length;
    });
    return combined;
  }

  function getZipDosDateTime(date) {
    const value = date instanceof Date ? date : new Date();
    const year = Math.max(1980, value.getFullYear());
    const dosDate = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();
    const dosTime = (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2);
    return { dosDate, dosTime };
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function computeCrc32(data) {
    let crc = 0xffffffff;
    for (const byte of data || []) {
      crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildWorkbookXml(worksheets) {
    const workbookBody = worksheets
      .filter(sheet => Array.isArray(sheet.rows) && sheet.rows.length)
      .map(sheet => {
        const worksheetRows = sheet.rows.map(row => {
          const cells = row.map(value => {
            const cellValue = value == null ? '' : String(value);
            return `<Cell><Data ss:Type="String">${xmlEscape(cellValue)}</Data></Cell>`;
          }).join('');
          return `<Row>${cells}</Row>`;
        }).join('');

        return `<Worksheet ss:Name="${xmlEscape(sanitizeWorksheetName(sheet.name))}"><Table>${worksheetRows}</Table></Worksheet>`;
      }).join('');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Bottom"/>
      <Borders/>
      <Font ss:FontName="Calibri" ss:Size="11"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
  </Styles>
  ${workbookBody}
</Workbook>`;
  }

  function sanitizeWorksheetName(value) {
    const name = String(value || 'Sheet')
      .replace(/[\\/?*\[\]:]/g, ' ')
      .trim();
    return (name || 'Sheet').slice(0, 31);
  }

  /* ─────────────────────────────────────────────
     UTILITIES
  ───────────────────────────────────────────── */
  async function activateTab(targetId) {
    document.querySelectorAll('.psm-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.target === targetId);
    });
    document.querySelectorAll('.psm-summary-card').forEach(card => {
      card.classList.toggle('active', card.dataset.target === targetId);
    });
    document.querySelectorAll('.psm-view').forEach(view => {
      view.classList.toggle('active', view.id === targetId);
    });

    const activeView = document.getElementById(targetId);
    if (activeView) {
      activeView.scrollTop = 0;
      activeView.querySelectorAll('.psm-table-wrap').forEach(wrapper => {
        wrapper.scrollTop = 0;
      });
    }

    if (targetId === 'fieldTab') {
      await ensureVisibleFieldMetadataLoaded({ showOverlay: !state.catalogs.fieldMaps.size });
      renderFieldTable();
    }
  }

  function permChip(on, label) {
    return on
      ? `<span class="perm-chip on" title="${escapeHtml(label)}">✓</span>`
      : `<span class="perm-chip off" title="—">—</span>`;
  }

  function emptyTableHtml(message) {
    return `<tr><td colspan="99"><div class="psm-empty">
      <div class="psm-empty-icon">📋</div>
      <div class="psm-empty-text">${escapeHtml(message)}</div>
    </div></td></tr>`;
  }

  function hasObjectDiff(values, perms) {
    return perms.some(p => new Set(values.map(v => !!(v && v[p]))).size > 1);
  }

  function hasFieldDiff(values) {
    return new Set(values.map(v => `${!!(v && v.PermissionsRead)}-${!!(v && v.PermissionsEdit)}`)).size > 1;
  }

  function getFieldMetadata(key) {
    const [objectApiName, ...fieldParts] = String(key || '').split('.');
    const fieldApiName = fieldParts.join('.');
    const fields = state.catalogs.fieldMaps.get(objectApiName) || [];
    return fields.find(field => field.fieldApiName === fieldApiName) || {
      fieldApiName,
      permissionable: true,
      updateable: true,
      calculated: false,
      autoNumber: false,
      custom: /__(?:c|mdt|x|b|e)$/i.test(fieldApiName),
      type: ''
    };
  }

  function autoGrantFieldRead(key) {
    const metadata = getFieldMetadata(key);
    return fieldPermissionRules.shouldAutoGrantFieldRead(metadata);
  }

  function coerceFieldValueForDisplay(key, value) {
    const metadata = getFieldMetadata(key);
    return fieldPermissionRules.coerceFieldPermissionValue(metadata, value);
  }

  function getVisibleFieldRows() {
    return (state.comparison?.fieldRows || []).filter(row => {
      const [objectApiName] = String(row.key || '').split('.');
      return fieldPermissionRules.shouldShowFieldRow({
        objectApiName,
        row,
        hasReadableObjectAccess: hasReadableObjectAccess(objectApiName),
        hasLoadedFieldCatalog: state.catalogs.fieldMaps.has(objectApiName)
      });
    });
  }

  function hasReadableObjectAccess(objectApiName) {
    const objectRow = state.comparison?.objectRows?.find(row => resolveObjectApiName(row, row.key) === objectApiName || row.key === objectApiName);
    return !!objectRow?.values?.some(value => !!(value && value.PermissionsRead));
  }

  function getAccessDisplayInfo(row) {
    const sample = row.values.find(Boolean) || null;
    const catalog = row.catalogDisplay || null;
    const setupType = sample?.setupType || catalog?.setupType || extractSetupType(row.key);
    const entityId = sample?.SetupEntityId || catalog?.entityId || extractEntityId(row.key);
    const rawLabel = sample?.label || sample?.SetupEntityLabel || sample?.SetupEntityName || row.label || '';
    const label = (!rawLabel || rawLabel === entityId) ? (catalog?.label || rawLabel) : rawLabel;
    return { entityId, label, setupType };
  }

  function findAccessRow(key) {
    const sections = ['apexClassRows', 'visualforceRows', 'customPermissionRows', 'flowAccessRows', 'assignedAppRows', 'connectedAppRows', 'setupAccessRows'];
    for (const section of sections) {
      const row = state.comparison?.[section]?.find(candidate => candidate.key === key);
      if (row) return row;
    }
    return null;
  }

  function extractEntityId(key) {
    const raw = String(key || '');
    return raw.includes('::') ? raw.split('::').slice(1).join('::') : raw;
  }

  function isUnsupportedAccessSetupType(setupType) {
    const type = String(setupType || '').toLowerCase();
    return type.includes('appusageassignment');
  }

  function extractSetupType(key) {
    const raw = String(key || '');
    return raw.includes('::') ? raw.split('::')[0] : '';
  }

  function buildAccessSearchText(row) {
    const display = getAccessDisplayInfo(row);
    return [display.entityId, display.label, display.setupType, row.key]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function buildPrimarySecondarySearchText(display) {
    return [display.primary, display.secondary]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function formatObjectDisplay(key) {
    const catalog = state.catalogs.objectMap.get(key);
    if (catalog?.label && catalog.label !== key) {
      return { primary: catalog.label, secondary: key || '' };
    }
    return { primary: key || 'Unknown', secondary: '' };
  }

  function resolveObjectApiName(row, candidate) {
    const normalizedCandidate = String(candidate || '').trim();
    if (row?.catalogDisplay?.key) return row.catalogDisplay.key;
    if (row?.key && !looksLikeSalesforceId(row.key)) return row.key;
    if (normalizedCandidate && !looksLikeSalesforceId(normalizedCandidate)) return normalizedCandidate;
    return row?.key || normalizedCandidate;
  }

  function looksLikeSalesforceId(value) {
    return /^[a-z0-9]{15}(?:[a-z0-9]{3})?$/i.test(String(value || '').trim());
  }

  function buildFullFieldPermissionName(objectApiName, fieldOrKey) {
    const objectName = String(objectApiName || '').trim();
    const rawField = String(fieldOrKey || '').trim();
    const prefix = objectName ? `${objectName}.` : '';
    const normalizedField = prefix && rawField.startsWith(prefix)
      ? rawField.slice(prefix.length)
      : rawField.split('.').slice(1).join('.') || rawField;

    return prefix ? `${prefix}${normalizedField}` : normalizedField;
  }

  function formatFieldDisplay(key) {
    const [objectName, ...fieldParts] = String(key || '').split('.');
    const fieldApiName = fieldParts.join('.') || key || 'Unknown';
    const metadata = getFieldMetadata(key);
    const label = metadata?.label && metadata.label !== fieldApiName ? metadata.label : fieldApiName;
    const secondary = label === fieldApiName
      ? objectName || ''
      : [objectName, fieldApiName].filter(Boolean).join('.');

    return {
      primary: label,
      secondary
    };
  }

  function formatPrimarySecondaryCell(primary, secondary) {
    if (!secondary) {
      return `<span class="psm-cell-primary">${escapeHtml(primary)}</span>`;
    }

    return `
      <span class="psm-cell-primary">${escapeHtml(primary)}</span>
      <span class="psm-cell-secondary">${escapeHtml(secondary)}</span>
    `;
  }

  function formatAccessCell(display) {
    const primary = display.label || display.entityId || 'Unknown';
    if (String(display.setupType || '').match(/ApexClass|ApexPage|Visualforce/i)) {
      return `<span class="psm-cell-primary">${escapeHtml(primary)}</span>`;
    }

    if (String(display.setupType || '').trim()) {
      return `<span class="psm-cell-primary">${escapeHtml(primary)}</span>`;
    }

    const secondary = display.entityId || '';

    if (!secondary || secondary === primary) {
      return `<span class="psm-cell-primary">${escapeHtml(primary)}</span>`;
    }

    return `
      <span class="psm-cell-primary">${escapeHtml(primary)}</span>
      <span class="psm-cell-secondary">${escapeHtml(secondary)}</span>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function xmlEscape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function setStatus(message, type) {
    if (!refs.statusBanner) return;
    refs.statusBanner.className = `psm-status ${type}`;
    refs.statusBanner.textContent = message;
  }

  function changeSignature(change) {
    return [change?.permissionSetId, change?.changeType, change?.key, change?.permission].join('::');
  }

  function isPermissionSetGroupRestricted(setIndex) {
    return !!state.selected?.[setIndex]?.details?.isInPermissionSetGroup;
  }

  function isManagedPermissionSet(setIndex) {
    return !!state.selected?.[setIndex]?.NamespacePrefix;
  }

  function isPermissionSetEditLocked(setIndex, changeType) {
    if (isManagedPermissionSet(setIndex)) return true;
    if (isPermissionSetGroupRestricted(setIndex)) return true;
    return false;
  }

  function isPermissionSetIdGroupRestricted(permissionSetId) {
    return state.selected.some(ps => ps?.Id === permissionSetId && ps?.details?.isInPermissionSetGroup);
  }

  function isPermissionSetIdManaged(permissionSetId) {
    return state.selected.some(ps => ps?.Id === permissionSetId && ps?.NamespacePrefix);
  }

  function clearSaveSummary() {
    if (refs.saveSummaryPanel) refs.saveSummaryPanel.innerHTML = '';
    refs.saveSummaryModal?.classList.add('psm-hidden');
  }

  function toSystemLabel(apiName) {
    return String(apiName || '')
      .replace(/^Permissions/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
  }

  function formatSavedChange(change) {
    if (change.changeType === 'object') {
      return `${change.key} — ${OBJECT_PERM_LABELS[change.permission] || change.permission}: ${change.to ? 'Enabled' : 'Disabled'}`;
    }
    if (change.changeType === 'field') {
      const permissionLabel = change.permission === 'PermissionsRead' ? 'Read' : 'Edit';
      return `${change.key} — ${permissionLabel}: ${change.to ? 'Enabled' : 'Disabled'}`;
    }
    if (change.changeType === 'system') {
      return `${toSystemLabel(change.permission)}: ${change.to ? 'Enabled' : 'Disabled'}`;
    }
    if (change.changeType === 'access') {
      return `${change.label || change.key} — ${change.to ? 'Added' : 'Removed'}`;
    }
    return `${change.key} — ${change.to ? 'Enabled' : 'Disabled'}`;
  }

  function categoryForSavedChange(change) {
    if (change.changeType === 'object') return 'Object Permissions';
    if (change.changeType === 'field') return 'Field Permissions';
    if (change.changeType === 'system') return 'System Permissions';
    if (change.changeType === 'access') {
      const type = String(change.setupEntityType || '').toLowerCase();
      if (type.includes('apexclass')) return 'Apex Classes';
      if (type.includes('apexpage') || type.includes('visualforce')) return 'Visualforce Pages';
      if (type.includes('custompermission')) return 'Custom Permissions';
      if (type.includes('flow')) return 'Flow Access';
      if (type.includes('connectedapp')) return 'Connected Apps';
      return 'Other Access';
    }
    return 'Other';
  }

  const SAVE_SUMMARY_CATEGORY_ORDER = [
    'Object Permissions',
    'Field Permissions',
    'System Permissions',
    'Apex Classes',
    'Visualforce Pages',
    'Custom Permissions',
    'Flow Access',
    'Connected Apps',
    'Other Access',
    'Other'
  ];

  function renderSaveSummary(changes, errors = []) {
    if (!refs.saveSummaryPanel || !refs.saveSummaryModal) return;
    if (!changes.length && !errors.length) {
      clearSaveSummary();
      return;
    }

    const groupedByPs = new Map();
    changes.forEach(change => {
      const group = groupedByPs.get(change.permissionSetLabel) || [];
      group.push(change);
      groupedByPs.set(change.permissionSetLabel, group);
    });

    const renderCategorized = (groupChanges) => {
      const byCategory = new Map();
      groupChanges.forEach(change => {
        const category = categoryForSavedChange(change);
        const list = byCategory.get(category) || [];
        list.push(change);
        byCategory.set(category, list);
      });

      const orderedEntries = SAVE_SUMMARY_CATEGORY_ORDER
        .filter(category => byCategory.has(category))
        .map(category => [category, byCategory.get(category)]);
      // Append any unexpected categories at the end
      Array.from(byCategory.keys())
        .filter(category => !SAVE_SUMMARY_CATEGORY_ORDER.includes(category))
        .forEach(category => orderedEntries.push([category, byCategory.get(category)]));

      return orderedEntries.map(([category, items]) => `
        <div class="psm-save-summary-category">
          <div class="psm-save-summary-category-title">${escapeHtml(category)} <span class="psm-save-summary-count">(${items.length})</span></div>
          <ul class="psm-save-summary-list">
            ${items.map(change => `<li>${escapeHtml(formatSavedChange(change))}</li>`).join('')}
          </ul>
        </div>
      `).join('');
    };

    refs.saveSummaryPanel.innerHTML = `
      <div class="psm-save-summary-title">Saved Updates</div>
      ${changes.length ? Array.from(groupedByPs.entries()).map(([label, groupChanges]) => `
        <div class="psm-save-summary-group">
          <div class="psm-save-summary-group-title">${escapeHtml(label)}</div>
          ${renderCategorized(groupChanges)}
        </div>
      `).join('') : '<div class="psm-save-summary-empty">No updates were saved.</div>'}
      ${errors.length ? `
        <div class="psm-save-summary-errors">
          <div class="psm-save-summary-errors-title">Errors <span class="psm-save-summary-count">(${errors.length})</span></div>
          <ul class="psm-save-summary-list psm-save-summary-error-list">
            ${errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `;
    refs.saveSummaryModal.classList.remove('psm-hidden');
  }

  function updateRestrictionNotice() {
    if (!refs.psgRestrictionNotice) return;

    const managedLabels = state.selected
      .filter(ps => ps?.NamespacePrefix)
      .map(ps => getDisplayLabelWithType(ps));

    const restrictedLabels = state.selected
      .filter(ps => ps?.details?.isInPermissionSetGroup)
      .map(ps => getDisplayLabelWithType(ps));

    if ((!restrictedLabels.length && !managedLabels.length) || !state.comparison) {
      refs.psgRestrictionNotice.textContent = '';
      refs.psgRestrictionNotice.classList.add('psm-hidden');
      return;
    }

    const messages = [];
    if (managedLabels.length) {
      messages.push(`${managedLabels.join(', ')} is a managed-package permission set. Salesforce does not allow this plugin to modify managed permission sets, so all edits are read-only.`);
    }
    if (restrictedLabels.length) {
      messages.push(`${restrictedLabels.join(', ')} is part of a permission set group. Comparison is still available, but all edits are read-only. If you still want to edit the permission set while it is part of the group, please remove it from the group, make the change, then add it back to avoid group policy update errors.`);
    }

    refs.psgRestrictionNotice.textContent = messages.join(' ');
    refs.psgRestrictionNotice.classList.remove('psm-hidden');
  }

  function showLoading(label) {
    if (refs.loadingOverlay) refs.loadingOverlay.classList.remove('psm-hidden');
    if (refs.loadingLabel && label) refs.loadingLabel.textContent = label;
  }

  function hideLoading() {
    if (refs.loadingOverlay) refs.loadingOverlay.classList.add('psm-hidden');
  }

  function setLoadingLabel(label) {
    if (refs.loadingLabel) refs.loadingLabel.textContent = label;
  }
})();