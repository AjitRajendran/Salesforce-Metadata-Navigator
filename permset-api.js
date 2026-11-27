window.PermsetApi = (() => {
  const API_VERSION = 'v60.0';
  const LEGACY_PERMISSION_FIELDS = new Set([
    'PermissionsActivateContract',
    'PermissionsActivateContracts',
    'PermissionsActivateOrder',
    'PermissionsActivateOrders'
  ]);
  let cachedAuth = null;
  let cachedLatestApiVersion = null;
  let cachedPermissionFields = null;
  let cachedPermissionFieldMetadata = null;
  let cachedQueryablePermissionFieldMetadata = null;
  let cachedUserPermissionMetadata = null;
  const cachedPermissionSetDetails = new Map();
  const cachedPermissionSetDetailPromises = new Map();
  const cachedFieldPermissionsByObject = new Map();
  const cachedFieldPermissionObjectPromises = new Map();

  function getPermissionSetDetailsCacheKey(permSetId, includeFieldPermissions) {
    return `${permSetId}::${includeFieldPermissions ? 'full' : 'light'}`;
  }

  function getSourceHost() {
    try {
      const params = new URLSearchParams(window.location.search);
      const sourceUrl = params.get('sourceUrl');
      return sourceUrl ? new URL(sourceUrl).hostname : null;
    } catch {
      return null;
    }
  }


  async function getActiveSalesforceTab() {
    const preferredHost = getSourceHost();
    if (preferredHost) {
      return { url: new URLSearchParams(window.location.search).get('sourceUrl') };
    }

    const tabs = await chrome.tabs.query({});

    const active = tabs.find(
      tab => tab?.active && tab?.url && (tab.url.includes('salesforce.com') || tab.url.includes('force.com'))
    );
    if (active) return active;

    const sf = tabs.find(
      tab => tab?.url && (tab.url.includes('salesforce.com') || tab.url.includes('force.com'))
    );
    if (!sf) throw new Error('No active Salesforce tab found. Open a Salesforce org tab first.');
    return sf;
  }
  

  function normalizeHostname(hostname) {
    return hostname
      .replace('.my.salesforce-setup.com', '.my.salesforce.com')
      .replace('.sandbox.my.salesforce-setup.com', '.sandbox.my.salesforce.com')
      .replace('.lightning.force.com', '.my.salesforce.com')
      .replace('.sandbox.lightning.force.com', '.sandbox.my.salesforce.com')
      .replace('.file.force.com', '.my.salesforce.com')
      .replace('.sandbox.file.force.com', '.sandbox.my.salesforce.com')
      .replace('.visualforce.com', '.my.salesforce.com')
      .replace('.sandbox.visualforce.com', '.sandbox.my.salesforce.com');
  }

  function isInvalidTypeErrorMessage(message) {
    return /INVALID_TYPE|sObject type .* is not supported|No such column|Didn't understand relationship/i.test(String(message || ''));
  }

  function quoteSoqlString(value) {
    return String(value || '').replace(/'/g, "\\'");
  }

  function withAuthHeaders(auth, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    if (auth?.accessToken) {
      headers.Authorization = `Bearer ${auth.accessToken}`;
    }

    return {
      ...options,
      headers
    };
  }

  async function getAuth() {
    if (cachedAuth?.accessToken && cachedAuth?.instanceUrl) {
      return cachedAuth;
    }

    const tab = await getActiveSalesforceTab();
    const tabUrl = new URL(tab.url);
    const hostname = normalizeHostname(tabUrl.hostname);
    const instanceUrl = `${tabUrl.protocol}//${hostname}`;

    const sidCookies = await chrome.cookies.getAll({ name: 'sid' });
    const matchingCookie = sidCookies.find(cookie => {
      const domain = String(cookie?.domain || '').replace(/^\./, '');
      if (!domain) return false;
      return hostname === domain || hostname.endsWith(`.${domain}`) || domain.endsWith(`.${hostname}`);
    });

    if (!matchingCookie?.value) {
      throw new Error('Salesforce session not found. Open the target org in a logged-in tab and try again.');
    }

    cachedAuth = {
      instanceUrl,
      accessToken: matchingCookie.value,
      hostname
    };

    return cachedAuth;
  }

  async function apiFetch(url, options = {}) {
    return await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'permset_api_query', url, options }, resolve);
    });
  }

  function compareApiVersions(left, right) {
    return parseFloat(String(left || 'v0.0').replace(/^v/i, '')) - parseFloat(String(right || 'v0.0').replace(/^v/i, ''));
  }

  async function getSupportedApiVersion(preferLatest = false) {
    if (!preferLatest) return API_VERSION;
    if (cachedLatestApiVersion) return cachedLatestApiVersion;

    const auth = await getAuth();
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/`,
      withAuthHeaders(auth, { method: 'GET' })
    );

    if (!res?.ok) {
      cachedLatestApiVersion = API_VERSION;
      return cachedLatestApiVersion;
    }

    const versions = JSON.parse(res.text || '[]');
    const latest = (Array.isArray(versions) ? versions : [])
      .map(item => item?.version)
      .filter(Boolean)
      .sort(compareApiVersions)
      .pop();

    cachedLatestApiVersion = latest ? `v${String(latest).replace(/^v/i, '')}` : API_VERSION;
    return cachedLatestApiVersion;
  }

  async function queryAll(soql, options = {}) {
    const auth = await getAuth();
    const apiVersion = options.apiVersion || API_VERSION;
    let url = `${auth.instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;
    const records = [];

    while (url) {
      const res = await apiFetch(url, withAuthHeaders(auth, { method: 'GET' }));

      if (!res?.ok) {
        const txt = res?.text || '';
        if (!options.suppressErrorLog) {
          console.error('Salesforce query failed', {
            url,
            status: res?.status,
            body: txt,
            auth
          });
        }
        throw new Error(`Query failed: HTTP ${res?.status} ${txt}`);
      }

      const data = JSON.parse(res.text || '{}');
      records.push(...(data.records || []));
      url = data.nextRecordsUrl ? `${auth.instanceUrl}${data.nextRecordsUrl}` : null;
    }

    return { auth, records };
  }

  async function queryAllTooling(soql, options = {}) {
    const auth = await getAuth();
    const apiVersion = options.apiVersion || API_VERSION;
    let url = `${auth.instanceUrl}/services/data/${apiVersion}/tooling/query?q=${encodeURIComponent(soql)}`;
    const records = [];

    while (url) {
      const res = await apiFetch(url, withAuthHeaders(auth, { method: 'GET' }));

      if (!res?.ok) {
        const txt = res?.text || '';
        if (!options.suppressErrorLog) {
          console.error('Salesforce tooling query failed', {
            url,
            status: res?.status,
            body: txt,
            auth
          });
        }
        throw new Error(`Tooling query failed: HTTP ${res?.status} ${txt}`);
      }

      const data = JSON.parse(res.text || '{}');
      records.push(...(data.records || []));
      url = data.nextRecordsUrl ? `${auth.instanceUrl}${data.nextRecordsUrl}` : null;
    }

    return { auth, records };
  }

  async function queryOptional(soql, options = {}) {
    try {
      return await queryAll(soql, { ...options, suppressErrorLog: true });
    } catch (e) {
      if (isInvalidTypeErrorMessage(e?.message)) {
        return { records: [] };
      }
      throw e;
    }
  }

  async function queryOptionalTooling(soql, options = {}) {
    try {
      return await queryAllTooling(soql, { ...options, suppressErrorLog: true });
    } catch (e) {
      if (isInvalidTypeErrorMessage(e?.message)) {
        return { records: [] };
      }
      throw e;
    }
  }

  async function loadFieldDependencies(objectApiName, fieldApiName) {
    const definition = await queryAllTooling(`
      SELECT DurableId FROM FieldDefinition
      WHERE EntityDefinition.QualifiedApiName = '${quoteSoqlString(objectApiName)}'
        AND QualifiedApiName = '${quoteSoqlString(fieldApiName)}'
      LIMIT 1
    `);
    const durableId = definition.records[0]?.DurableId || '';
    const fieldId = durableId.split('.').pop();
    if (!/^00N[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(fieldId)) {
      throw new Error('This field has no custom field metadata ID available for dependency lookup.');
    }

    const result = await queryAllTooling(`
      SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType,
        RefMetadataComponentId
      FROM MetadataComponentDependency
      WHERE RefMetadataComponentId = '${fieldId}'
    `);
    return result.records;
  }

  function chunkValues(values, size = 100) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
      chunks.push(values.slice(index, index + size));
    }
    return chunks;
  }

  async function loadGroupQueueDirectory(type) {
    const groupType = type === 'queues' ? 'Queue' : 'Regular';
    const { records } = await queryAll(`
      SELECT Id, Name, DeveloperName, Type
      FROM Group
      WHERE Type = '${groupType}'
      ORDER BY Name ASC
    `);
    return records.map(group => ({ ...group, members: [], queueObjects: [], detailsLoaded: false }));
  }

  async function loadGroupQueueDetails(groupId, isQueue = false) {
    const { records: members } = await queryAll(`
      SELECT Id, GroupId, UserOrGroupId
      FROM GroupMember
      WHERE GroupId = '${quoteSoqlString(groupId)}'
    `);

    const memberIds = Array.from(new Set(members.map(member => member.UserOrGroupId).filter(Boolean)));
    const memberLabels = new Map();
    const userIds = memberIds.filter(id => String(id).startsWith('005'));
    const nestedGroupIds = memberIds.filter(id => String(id).startsWith('00G'));

    for (const ids of chunkValues(userIds)) {
      const quotedIds = ids.map(id => `'${quoteSoqlString(id)}'`).join(',');
      const { records } = await queryAll(`
        SELECT Id, Name, Username
        FROM User
        WHERE Id IN (${quotedIds})
      `);
      records.forEach(user => memberLabels.set(user.Id, user.Name || user.Username || user.Id));
    }

    for (const ids of chunkValues(nestedGroupIds)) {
      const quotedIds = ids.map(id => `'${quoteSoqlString(id)}'`).join(',');
      const { records } = await queryAll(`
        SELECT Id, Name, Type
        FROM Group
        WHERE Id IN (${quotedIds})
      `);
      records.forEach(group => memberLabels.set(group.Id, group.Name || group.Id));
    }

    const queueObjects = isQueue
      ? (await queryOptional(`
          SELECT Id, QueueId, SobjectType
          FROM QueueSobject
          WHERE QueueId = '${quoteSoqlString(groupId)}'
          ORDER BY SobjectType ASC
        `)).records || []
      : [];

    return {
      members: members.map(member => ({
        ...member,
        label: memberLabels.get(member.UserOrGroupId) || member.UserOrGroupId,
        memberType: String(member.UserOrGroupId || '').startsWith('005') ? 'User' : 'Group'
      })),
      queueObjects
    };
  }

  async function searchGroupQueueCandidates(searchText, excludedGroupId = '') {
    const term = quoteSoqlString(String(searchText || '').trim());
    if (term.length < 2) return [];

    const [{ records: users }, { records: groups }] = await Promise.all([
      queryAll(`
        SELECT Id, Name, Username
        FROM User
        WHERE IsActive = true AND (Name LIKE '%${term}%' OR Username LIKE '%${term}%')
        ORDER BY Name ASC
        LIMIT 50
      `),
      queryAll(`
        SELECT Id, Name, DeveloperName, Type
        FROM Group
        WHERE Type IN ('Regular', 'Role', 'RoleAndSubordinates') AND Name LIKE '%${term}%'
        ORDER BY Name ASC
        LIMIT 50
      `)
    ]);

    return [
      ...users.map(user => ({ id: user.Id, label: user.Name || user.Username, detail: user.Username, type: 'User' })),
      ...groups
        .filter(group => group.Id !== excludedGroupId)
        .map(group => ({ id: group.Id, label: group.Name, detail: group.Type, type: 'Group' }))
    ];
  }

  async function loadQueueableObjects() {
    const auth = await getAuth();
    const apiVersion = await getSupportedApiVersion();
    const response = await apiFetch(
      `${auth.instanceUrl}/services/data/${apiVersion}/sobjects/QueueSobject/describe`,
      withAuthHeaders(auth, { method: 'GET' })
    );

    if (!response?.ok) {
      throw new Error(`Queue object types could not be loaded: ${response?.text || `HTTP ${response?.status}`}`);
    }

    const description = JSON.parse(response.text || '{}');
    const field = description.fields?.find(candidate => candidate.name === 'SobjectType');
    return (field?.picklistValues || [])
      .filter(value => value.active !== false)
      .map(value => ({ apiName: value.value, label: value.label || value.value }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async function loadPermissionSets() {
    const { auth, records } = await queryAll(`
      SELECT Id, Name, Label, Description, NamespacePrefix, IsOwnedByProfile, ProfileId, Profile.Name
      FROM PermissionSet
      ORDER BY Label ASC
    `);

    const loadLicenseAssignments = async () => {
      const candidates = ['LicenseId', 'PermissionSetLicenseId'];

      for (const fieldName of candidates) {
        const result = await queryOptional(`
          SELECT Id, ${fieldName}
          FROM PermissionSet
        `);
        const candidateRecords = result.records || [];
        if (!candidateRecords.length) continue;

        return {
          fieldName,
          map: new Map(candidateRecords.map(record => [record.Id, record[fieldName] || null]))
        };
      }

      return { fieldName: null, map: new Map() };
    };

    const licenseAssignments = await loadLicenseAssignments();

    const normalizedRecords = (records || []).map(record => {
      const sourceType = record?.IsOwnedByProfile ? 'Profile' : 'Permission Set';
      const displayLabel = record?.IsOwnedByProfile
        ? (record?.Profile?.Name || record?.Label || record?.Name || 'Unknown')
        : (record?.Label || record?.Name || 'Unknown');
      const licenseId = licenseAssignments.map.get(record?.Id) || null;

      return {
        ...record,
        sourceType,
        displayLabel,
        setupTargetId: record?.IsOwnedByProfile ? (record?.ProfileId || record?.Id) : record?.Id,
        licenseId,
        hasLicenseRestriction: !record?.IsOwnedByProfile && !!licenseId,
        selectionLabel: `${displayLabel} [${sourceType}]`
      };
    });

    return { auth, records: normalizedRecords };
  }

  async function getPermissionSetGroupMembership(permSetId) {
    const result = await queryOptional(`
      SELECT Id, PermissionSetGroupId
      FROM PermissionSetGroupComponent
      WHERE PermissionSetId = '${permSetId}'
    `);

    const records = result.records || [];
    return {
      isInPermissionSetGroup: records.length > 0,
      permissionSetGroupIds: records.map(record => record.PermissionSetGroupId).filter(Boolean)
    };
  }

  async function getCurrentUserContext() {
    const auth = await getAuth();
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/${API_VERSION}/chatter/users/me`,
      withAuthHeaders(auth, { method: 'GET' })
    );

    if (!res?.ok) {
      throw new Error(`Current user lookup failed: ${res?.text || ''}`);
    }

    const data = JSON.parse(res.text || '{}');
    return {
      id: data.id || '',
      username: data.username || data.email || '',
      displayName: data.displayName || data.name || data.username || data.email || ''
    };
  }

  async function loadObjectCatalog() {
    const auth = await getAuth();
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/${API_VERSION}/sobjects`,
      withAuthHeaders(auth, { method: 'GET' })
    );

    if (!res?.ok) {
      throw new Error(`Object catalog load failed: ${res?.text || ''}`);
    }

    const data = JSON.parse(res.text || '{}');

    function isSupportedObjectPermissionTarget(objectApiName) {
      const name = String(objectApiName || '').trim();
      if (!name) return false;

      // The global sObject list includes pseudo-objects that Salesforce rejects in
      // ObjectPermissions.SobjectType (for example AccountFeed).
      return !(
        name.endsWith('Feed') ||
        name.endsWith('History') ||
        name.endsWith('Share') ||
        name.endsWith('ChangeEvent')
      );
    }

    return (data.sobjects || [])
      .filter(record => record?.name && isSupportedObjectPermissionTarget(record.name))
      .map(record => ({
        key: record.name,
        label: record.label || record.name,
        custom: !!record.custom,
        queryable: record.queryable !== false
      }))
      .sort((left, right) => {
        const leftLabel = String(left.label || left.key);
        const rightLabel = String(right.label || right.key);
        return leftLabel.localeCompare(rightLabel) || String(left.key).localeCompare(String(right.key));
      });
  }

  async function loadAccessCatalogs() {
    const [apexClasses, apexPages, customPermissions, flowDefinitions, namedCredentials, externalDataSources, connectedApplications, customApplications, appMenuItems, serviceProviders, customTabs, recordTypes, layouts, staticResources, emailTemplates] = await Promise.all([
      queryOptionalTooling(`SELECT Id, Name FROM ApexClass ORDER BY Name ASC`).then(result => result.records || []).catch(() => []),
      queryOptionalTooling(`SELECT Id, Name FROM ApexPage ORDER BY Name ASC`).then(result => result.records || []).catch(() => []),
      (async () => {
        try {
          const result = await queryOptional(`SELECT Id, DeveloperName, MasterLabel FROM CustomPermission ORDER BY MasterLabel ASC, DeveloperName ASC`);
          return result.records || [];
        } catch {
          const result = await queryOptionalTooling(`SELECT Id, DeveloperName, MasterLabel FROM CustomPermission ORDER BY MasterLabel ASC, DeveloperName ASC`);
          return result.records || [];
        }
      })().catch(() => []),
      queryOptionalTooling(`SELECT Id, DeveloperName, MasterLabel FROM FlowDefinition ORDER BY MasterLabel ASC, DeveloperName ASC`).then(result => result.records || []).catch(() => []),
      queryOptional(`SELECT Id, DeveloperName, MasterLabel FROM NamedCredential ORDER BY MasterLabel ASC, DeveloperName ASC`).then(result => result.records || []).catch(() => []),
      queryOptional(`SELECT Id, DeveloperName, MasterLabel FROM ExternalDataSource ORDER BY MasterLabel ASC, DeveloperName ASC`).then(result => result.records || []).catch(() => []),
      queryOptional(`SELECT Id, Name FROM ConnectedApplication ORDER BY Name ASC`).then(result => result.records || []).catch(() => []),
      (async () => {
        try {
          const result = await queryOptionalTooling(`SELECT Id, DeveloperName, Name FROM CustomApplication ORDER BY DeveloperName ASC, Name ASC`);
          return result.records || [];
        } catch {
          const result = await queryOptional(`SELECT Id, Label, Name FROM CustomApplication ORDER BY Label ASC, Name ASC`);
          return result.records || [];
        }
      })().catch(() => []),
      queryOptional(`SELECT Id, Name, Label, Type FROM AppMenuItem ORDER BY Label ASC, Name ASC`).then(result => result.records || []).catch(() => []),
      queryOptional(`SELECT Id, Name FROM ServiceProvider ORDER BY Name ASC`).then(result => result.records || []).catch(() => []),
      queryOptionalTooling(`SELECT Id, MasterLabel, DeveloperName, Name FROM CustomTab ORDER BY MasterLabel ASC, DeveloperName ASC`).then(result => result.records || []).catch(() => []),
      queryOptional(`SELECT Id, Name, DeveloperName, SobjectType FROM RecordType ORDER BY Name ASC, DeveloperName ASC`).then(result => result.records || []).catch(() => []),
      queryOptionalTooling(`SELECT Id, Name, TableEnumOrId FROM Layout ORDER BY Name ASC`).then(result => result.records || []).catch(() => []),
      queryOptionalTooling(`SELECT Id, Name FROM StaticResource ORDER BY Name ASC`).then(result => result.records || []).catch(() => []),
      queryOptional(`SELECT Id, Name, DeveloperName FROM EmailTemplate ORDER BY Name ASC, DeveloperName ASC`).then(result => result.records || []).catch(() => [])
    ]);

    const usableAppMenuItems = (appMenuItems || []).filter(record => {
      const recordId = String(record?.Id || '').trim();
      return recordId && (!record.Type || String(record.Type).toLowerCase() === 'app');
    });
    const assignedAppFallbackRows = [];
    // NOTE: We intentionally do NOT query SetupEntityAccess org-wide here.
    // That query (even with GROUP BY/LIMIT) can be very slow on large orgs and was
    // causing Compare Selected to hang. Apps already assigned to the selected
    // permission sets show up via the enriched details on each PS; the search
    // catalog below covers apps available to add via CustomApplication/AppMenuItem.

    return {
      apexClassRows: apexClasses.map(record => ({
        key: record.Id,
        entityId: record.Id,
        label: record.Name || record.Id,
        secondary: record.Id,
        setupType: 'ApexClass'
      })),
      visualforceRows: apexPages.map(record => ({
        key: record.Id,
        entityId: record.Id,
        label: record.Name || record.Id,
        secondary: record.Id,
        setupType: 'ApexPage'
      })),
      customPermissionRows: customPermissions.map(record => ({
        key: record.Id,
        entityId: record.Id,
        label: record.MasterLabel || record.DeveloperName || record.Id,
        secondary: record.DeveloperName || record.Id,
        setupType: 'CustomPermission'
      })),
      flowAccessRows: flowDefinitions.map(record => ({
        key: record.Id,
        entityId: record.Id,
        label: record.MasterLabel || record.DeveloperName || record.Id,
        secondary: record.DeveloperName || record.Id,
        setupType: 'FlowDefinition'
      })),
      assignedAppRows: (() => {
        // Primary source: IDs from SetupEntityAccess are guaranteed valid for saving.
        // Supplement with CustomApplication / AppMenuItem for apps not yet in any PS.
        const seenEntityIds = new Set(assignedAppFallbackRows.map(r => r.entityId));
        return [
          ...assignedAppFallbackRows,
          ...customApplications
            .filter(record => !seenEntityIds.has(record.Id))
            .map(record => ({
              key: `CustomApplication::${record.Id}`,
              entityId: record.Id,
              label: record.Label || record.DeveloperName || record.Name || record.Id,
              secondary: record.Name || record.DeveloperName || record.Id,
              setupType: 'CustomApplication'
            })),
          ...usableAppMenuItems
            .filter(record => !seenEntityIds.has(record.Id))
            .map(record => ({
              key: `AppMenuItem::${record.Id}`,
              entityId: record.Id,
              label: record.Label || record.Name || record.Id,
              secondary: record.Name || record.Id,
              setupType: 'AppMenuItem'
            }))
        ];
      })(),
      connectedAppRows: connectedApplications.map(record => ({
        key: `ConnectedApplication::${record.Id}`,
        entityId: record.Id,
        label: record.Name || record.Id,
        secondary: record.Id,
        setupType: 'ConnectedApplication'
      })),
      setupAccessRows: [
        ...namedCredentials.map(record => ({
          key: `NamedCredential::${record.Id}`,
          entityId: record.Id,
          label: record.MasterLabel || record.DeveloperName || record.Id,
          secondary: record.DeveloperName || record.Id,
          setupType: 'NamedCredential'
        })),
        ...externalDataSources.map(record => ({
          key: `ExternalDataSource::${record.Id}`,
          entityId: record.Id,
          label: record.MasterLabel || record.DeveloperName || record.Id,
          secondary: record.DeveloperName || record.Id,
          setupType: 'ExternalDataSource'
        })),
        ...serviceProviders.map(record => ({
          key: `ServiceProvider::${record.Id}`,
          entityId: record.Id,
          label: record.Name || record.Id,
          secondary: record.Id,
          setupType: 'ServiceProvider'
        })),
        ...customTabs.map(record => ({
          key: `CustomTab::${record.Id}`,
          entityId: record.Id,
          label: record.MasterLabel || record.Name || record.DeveloperName || record.Id,
          secondary: record.DeveloperName || record.Name || record.Id,
          setupType: 'CustomTab'
        })),
        ...recordTypes.map(record => ({
          key: `RecordType::${record.Id}`,
          entityId: record.Id,
          label: record.Name || record.DeveloperName || record.Id,
          secondary: record.SobjectType || record.DeveloperName || record.Id,
          setupType: 'RecordType'
        })),
        ...layouts.map(record => ({
          key: `Layout::${record.Id}`,
          entityId: record.Id,
          label: record.Name || record.Id,
          secondary: record.TableEnumOrId || record.Id,
          setupType: 'Layout'
        })),
        ...staticResources.map(record => ({
          key: `StaticResource::${record.Id}`,
          entityId: record.Id,
          label: record.Name || record.Id,
          secondary: record.Id,
          setupType: 'StaticResource'
        })),
        ...emailTemplates.map(record => ({
          key: `EmailTemplate::${record.Id}`,
          entityId: record.Id,
          label: record.Name || record.DeveloperName || record.Id,
          secondary: record.DeveloperName || record.Id,
          setupType: 'EmailTemplate'
        }))
      ]
    };
  }

  async function loadFieldCatalog(objectApiNames) {
    const auth = await getAuth();
    const names = [...new Set((objectApiNames || []).map(name => String(name || '').trim()).filter(Boolean))];
    const byObject = new Map();

    await Promise.all(names.map(async objectApiName => {
      try {
        const res = await apiFetch(
          `${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/${encodeURIComponent(objectApiName)}/describe`,
          withAuthHeaders(auth, { method: 'GET' })
        );

        if (!res?.ok) {
          throw new Error(`Describe failed for ${objectApiName}: ${res?.text || ''}`);
        }

        const data = JSON.parse(res.text || '{}');
        const describeFields = (data.fields || [])
          .filter(field => field?.name)
          .map(field => ({
            objectApiName,
            fieldApiName: field.name,
            label: field.label || field.name,
            permissionable: field.permissionable !== false,
            updateable: field.updateable !== false,
            calculated: !!field.calculated,
            autoNumber: !!field.autoNumber,
            custom: !!field.custom,
            type: field.type || ''
          }));
        const metadataFields = await loadFieldCatalogFromMetadata(objectApiName);
        const fieldsByApiName = new Map();

        [...metadataFields, ...describeFields].forEach(field => {
          if (!field?.fieldApiName) return;
          fieldsByApiName.set(field.fieldApiName, {
            ...(fieldsByApiName.get(field.fieldApiName) || {}),
            ...field
          });
        });

        const fields = Array.from(fieldsByApiName.values())
          .sort((left, right) => String(left.label || left.fieldApiName).localeCompare(String(right.label || right.fieldApiName)));

        byObject.set(objectApiName, fields);
      } catch (e) {
        try {
          const fields = await loadFieldCatalogFromMetadata(objectApiName);
          if (fields.length) {
            byObject.set(objectApiName, fields);
            return;
          }
        } catch (metadataError) {
          console.warn(`Field metadata fallback failed for ${objectApiName}`, metadataError);
        }

        console.warn(`Field catalog load failed for ${objectApiName}`, e);
      }
    }));

    return byObject;
  }

  async function loadFieldCatalogFromMetadata(objectApiName) {
    const objectName = quoteSoqlString(objectApiName);
    const queries = [
      {
        load: queryOptionalTooling,
        soql: `
          SELECT DurableId, QualifiedApiName, Label, DataType
          FROM FieldDefinition
          WHERE EntityDefinition.QualifiedApiName = '${objectName}'
          ORDER BY Label ASC, QualifiedApiName ASC
        `
      },
      {
        load: queryOptional,
        soql: `
        SELECT QualifiedApiName, Label, DataType, IsCalculated, IsPermissionable
        FROM EntityParticle
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
          AND IsComponent = false
        ORDER BY Label ASC, QualifiedApiName ASC
      `
      },
      {
        load: queryOptional,
        soql: `
        SELECT QualifiedApiName, Label, DataType, IsCalculated
        FROM EntityParticle
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
        ORDER BY Label ASC, QualifiedApiName ASC
      `
      }
    ];

    for (const query of queries) {
      let result;
      try {
        result = await query.load(query.soql, { apiVersion: await getSupportedApiVersion(true) });
      } catch (e) {
        console.warn(`Field metadata query failed for ${objectApiName}`, e);
        continue;
      }

      const fields = (result.records || [])
        .filter(record => record?.QualifiedApiName)
        .map(record => ({
          objectApiName,
          fieldApiName: record.QualifiedApiName,
          label: record.Label || record.QualifiedApiName,
          permissionable: record.IsPermissionable !== false,
          updateable: true,
          calculated: !!record.IsCalculated || /formula/i.test(String(record.DataType || '')),
          autoNumber: /auto\s*number|autonumber/i.test(String(record.DataType || '')),
          custom: /__(?:c|mdt|x|b|e)$/i.test(String(record.QualifiedApiName || '')),
          type: record.DataType || ''
        }));

      if (fields.length) {
        return fields.sort((left, right) => String(left.label || left.fieldApiName).localeCompare(String(right.label || right.fieldApiName)));
      }
    }

    return [];
  }

  async function getPermissionSetPermissionFields() {
    if (cachedPermissionFields?.length) return cachedPermissionFields;

    const metadata = await getQueryablePermissionSetPermissionMetadata();
    cachedPermissionFields = metadata.map(field => field.name);
    return cachedPermissionFields;
  }

  function sortPermissionMetadata(fields) {
    return fields.sort((left, right) => String(left.label || left.name).localeCompare(String(right.label || right.name)));
  }

  async function getQueryablePermissionSetPermissionMetadata() {
    if (cachedQueryablePermissionFieldMetadata?.length) return cachedQueryablePermissionFieldMetadata;

    const auth = await getAuth();
    const apiVersion = await getSupportedApiVersion(true);
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/${apiVersion}/sobjects/PermissionSet/describe`,
      withAuthHeaders(auth, { method: 'GET' })
    );

    if (!res?.ok) {
      throw new Error(`PermissionSet describe failed: ${res?.text || ''}`);
    }

    const data = JSON.parse(res.text || '{}');
    cachedQueryablePermissionFieldMetadata = sortPermissionMetadata((data.fields || [])
      .filter(field => (
        field?.name?.startsWith('Permissions')
        && field.name !== 'PermissionsHasActivationRequired'
        && field.type === 'boolean'
        && !field.deprecatedAndHidden
        && !LEGACY_PERMISSION_FIELDS.has(field.name)
      ))
      .map(field => ({
        name: field.name,
        label: field.label || field.name,
        description: field.inlineHelpText || '',
        queryable: true
      })));

    cachedPermissionFields = cachedQueryablePermissionFieldMetadata.map(field => field.name);
    return cachedQueryablePermissionFieldMetadata;
  }

  function normalizeUserPermissionMetadata(records) {
    const deduped = new Map();

    (records || []).forEach(record => {
      const rawName = String(record?.DeveloperName || record?.Name || '').trim();
      if (!rawName) return;

      const name = rawName.startsWith('Permissions') ? rawName : `Permissions${rawName}`;
      const label = String(record?.MasterLabel || record?.Label || rawName).trim();
      if (!label) return;

      deduped.set(name, {
        name,
        label,
        description: String(record?.Description || '').trim(),
        queryable: false
      });
    });

    return sortPermissionMetadata(Array.from(deduped.values()));
  }

  async function getUserPermissionMetadata() {
    if (cachedUserPermissionMetadata?.length) return cachedUserPermissionMetadata;

    const queries = [
      `SELECT DeveloperName, MasterLabel, Description FROM UserPermission ORDER BY MasterLabel ASC, DeveloperName ASC`,
      `SELECT Name, Label, Description FROM UserPermission ORDER BY Label ASC, Name ASC`,
      `SELECT DeveloperName, MasterLabel FROM UserPermission ORDER BY MasterLabel ASC, DeveloperName ASC`,
      `SELECT Name, Label FROM UserPermission ORDER BY Label ASC, Name ASC`
    ];

    for (const soql of queries) {
      const result = await queryOptionalTooling(soql, { apiVersion: await getSupportedApiVersion(true) });
      const metadata = normalizeUserPermissionMetadata(result.records || []);
      if (metadata.length) {
        cachedUserPermissionMetadata = metadata;
        return cachedUserPermissionMetadata;
      }
    }

    cachedUserPermissionMetadata = [];
    return cachedUserPermissionMetadata;
  }

  async function getPermissionSetPermissionMetadata() {
    if (cachedPermissionFieldMetadata?.length) return cachedPermissionFieldMetadata;

    const [queryableMetadata, userPermissionMetadata] = await Promise.all([
      getQueryablePermissionSetPermissionMetadata(),
      getUserPermissionMetadata()
    ]);

    if (userPermissionMetadata.length) {
      const userPermissionByName = new Map(userPermissionMetadata.map(field => [field.name, field]));
      cachedPermissionFieldMetadata = queryableMetadata.map(field => {
        const userPermissionField = userPermissionByName.get(field.name);
        return {
          name: field.name,
          label: userPermissionField?.label || field.label || field.name,
          description: userPermissionField?.description || field.description || '',
          queryable: true
        };
      });
    } else {
      cachedPermissionFieldMetadata = queryableMetadata;
    }

    return cachedPermissionFieldMetadata;
  }

  function classifySetupEntity(row) {
    const type = String(
      row?.SetupEntityType ||
      row?.SetupEntity?.attributes?.type ||
      ''
    ).toLowerCase();
    const inferredGroupKey = inferSetupGroupFromIdPrefix(row?.SetupEntityId);

    const setupLabel = String(
      row?.SetupEntityLabel ||
      row?.SetupEntityName ||
      row?.SetupEntityId ||
      ''
    ).toLowerCase();

    if (type.includes('apexclass')) return 'apexClassAccess';
    if (type.includes('apexpage') || type.includes('visualforce')) return 'visualforceAccess';
    if (type.includes('custompermission')) return 'customPermissions';
    if (type.includes('flow')) return 'flowAccess';
    if (type.includes('connectedapplication') || type.includes('connectedapp')) return 'connectedAppAccess';
    if (
      type.includes('appdefinition') ||
      type.includes('customapplication') ||
      type.includes('appmenuitem') ||
      type.includes('tabset') ||
      type.includes('tabdefinition') ||
      inferredGroupKey === 'assignedApps'
    ) {
      return 'assignedApps';
    }

    if (
      type.includes('custommetadata') ||
      type.includes('namedcredential') ||
      type.includes('externaldatasource') ||
      type.includes('connectedapplication') ||
      type.includes('connectedapp') ||
      type.includes('customsetting') ||
      setupLabel.includes('__mdt')
    ) {
      return 'setupAccess';
    }

    return 'setupAccess';
  }

  function buildSetupEntityLabel(row) {
    return (
      row?.SetupEntityName ||
      row?.SetupEntityLabel ||
      row?.SetupEntityId ||
      'Unknown'
    );
  }

  function inferSetupGroupFromIdPrefix(setupEntityId) {
    const prefix = String(setupEntityId || '').slice(0, 3).toLowerCase();

    if (prefix === '02u') return 'assignedApps';
    if (prefix === '012') return 'recordType';
    if (prefix === '00h') return 'layout';
    if (prefix === '081') return 'staticResource';
    if (prefix === '00x') return 'emailTemplate';

    return null;
  }

  function inferSetupObjectCandidatesFromIdPrefix(setupEntityId) {
    const prefix = String(setupEntityId || '').slice(0, 3).toLowerCase();

    if (prefix === '02u') return ['CustomApplication', 'AppMenuItem', 'CustomTab', 'TabDefinition'];
    if (prefix === '012') return ['RecordType'];
    if (prefix === '00h') return ['Layout'];
    if (prefix === '081') return ['StaticResource'];
    if (prefix === '00x') return ['EmailTemplate'];

    return [];
  }

  function extractSetupEntityRecordLabel(record) {
    if (!record || typeof record !== 'object') return '';

    const candidates = [
      record.MasterLabel,
      record.Label,
      record.Name,
      record.DeveloperName,
      record.QualifiedApiName,
      record.FullName,
      record.ApiName
    ].filter(Boolean);

    return candidates[0] || '';
  }

  async function enrichSetupEntityAccessRows(rows) {
    if (!rows?.length) return rows || [];

    const labelMap = new Map();
    const candidateIds = [...new Set(rows.map(row => row?.SetupEntityId).filter(Boolean))];

    const groups = rows.reduce((acc, row) => {
      const setupType = String(row?.SetupEntityType || '').toLowerCase();
      const inferredGroupKey = inferSetupGroupFromIdPrefix(row?.SetupEntityId);
      const groupKey = setupType.includes('apexclass')
        ? 'apexClass'
        : (setupType.includes('apexpage') || setupType.includes('visualforce'))
          ? 'apexPage'
          : setupType.includes('custompermission')
            ? 'customPermission'
            : setupType.includes('flow')
              ? 'flowDefinition'
              : setupType.includes('namedcredential')
                ? 'namedCredential'
                : setupType.includes('externaldatasource')
                  ? 'externalDataSource'
                  : (setupType.includes('connectedapplication') || setupType.includes('connectedapp'))
                    ? 'connectedApplication'
                    : setupType.includes('customtab')
                      ? 'customTab'
                      : setupType.includes('recordtype')
                        ? 'recordType'
                        : setupType.includes('layout')
                          ? 'layout'
                          : setupType.includes('staticresource')
                            ? 'staticResource'
                            : setupType.includes('emailtemplate')
                              ? 'emailTemplate'
                              : setupType.includes('tabset')
                                ? 'tabSet'
                                : setupType.includes('appmenuitem')
                                  ? 'appMenuItem'
                                  : (inferredGroupKey || 'entityDefinition');

      if (!acc[groupKey]) acc[groupKey] = [];
      if (row?.SetupEntityId) acc[groupKey].push(row.SetupEntityId);
      return acc;
    }, {});

    const chunkSize = 200;
    const loaders = [
      {
        key: 'entityDefinition',
        load: async (quoted) => queryOptional(`
          SELECT Id, QualifiedApiName, DeveloperName, MasterLabel
          FROM EntityDefinition
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.MasterLabel || rec.QualifiedApiName || rec.DeveloperName || rec.Id,
        warning: 'EntityDefinition lookup failed for setup access chunk'
      },
      {
        key: 'apexClass',
        load: async (quoted) => queryAllTooling(`
          SELECT Id, Name
          FROM ApexClass
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Name || rec.Id,
        warning: 'ApexClass lookup failed for setup access chunk'
      },
      {
        key: 'apexPage',
        load: async (quoted) => queryAllTooling(`
          SELECT Id, Name
          FROM ApexPage
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Name || rec.Id,
        warning: 'ApexPage lookup failed for setup access chunk'
      },
      {
        key: 'customPermission',
        load: async (quoted) => {
          try {
            return await queryAll(`
              SELECT Id, DeveloperName, MasterLabel
              FROM CustomPermission
              WHERE Id IN (${quoted})
            `);
          } catch {
            return await queryAllTooling(`
              SELECT Id, DeveloperName, MasterLabel
              FROM CustomPermission
              WHERE Id IN (${quoted})
            `);
          }
        },
        mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
        warning: 'CustomPermission lookup failed for setup access chunk'
      },
      {
        key: 'flowDefinition',
        load: async (quoted) => queryAllTooling(`
          SELECT Id, DeveloperName, MasterLabel
          FROM FlowDefinition
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
        warning: 'FlowDefinition lookup failed for setup access chunk'
      },
      {
        key: 'namedCredential',
        load: async (quoted) => queryAll(`
          SELECT Id, DeveloperName, MasterLabel
          FROM NamedCredential
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
        warning: 'NamedCredential lookup failed for setup access chunk'
      },
      {
        key: 'externalDataSource',
        load: async (quoted) => queryOptional(`
          SELECT Id, DeveloperName, MasterLabel
          FROM ExternalDataSource
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
        warning: 'ExternalDataSource lookup failed for setup access chunk'
      },
      {
        key: 'connectedApplication',
        load: async (quoted) => queryAll(`
          SELECT Id, Name
          FROM ConnectedApplication
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Name || rec.Id,
        warning: 'ConnectedApplication lookup failed for setup access chunk'
      },
      {
        key: 'customTab',
        load: async (quoted) => {
          try {
            return await queryOptional(`
              SELECT Id, MasterLabel, DeveloperName, Name
              FROM CustomTab
              WHERE Id IN (${quoted})
            `);
          } catch {
            return await queryOptionalTooling(`
              SELECT Id, MasterLabel, DeveloperName, Name
              FROM CustomTab
              WHERE Id IN (${quoted})
            `);
          }
        },
        mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
        warning: 'CustomTab lookup failed for setup access chunk'
      },
      {
        key: 'recordType',
        load: async (quoted) => queryOptional(`
          SELECT Id, Name, DeveloperName, SobjectType
          FROM RecordType
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Name || rec.DeveloperName || rec.Id,
        warning: 'RecordType lookup failed for setup access chunk'
      },
      {
        key: 'layout',
        load: async (quoted) => queryOptionalTooling(`
          SELECT Id, Name, TableEnumOrId
          FROM Layout
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Name || rec.TableEnumOrId || rec.Id,
        warning: 'Layout lookup failed for setup access chunk'
      },
      {
        key: 'staticResource',
        load: async (quoted) => queryOptionalTooling(`
          SELECT Id, Name
          FROM StaticResource
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Name || rec.Id,
        warning: 'StaticResource lookup failed for setup access chunk'
      },
      {
        key: 'emailTemplate',
        load: async (quoted) => queryOptional(`
          SELECT Id, Name, DeveloperName
          FROM EmailTemplate
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Name || rec.DeveloperName || rec.Id,
        warning: 'EmailTemplate lookup failed for setup access chunk'
      },
      {
        key: 'tabSet',
        load: async (quoted) => queryOptionalTooling(`
          SELECT Id, Label
          FROM TabSet
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Label || rec.Id,
        warning: 'TabSet lookup failed for setup access chunk'
      },
      {
        key: 'appMenuItem',
        load: async (quoted) => queryOptional(`
          SELECT Id, Label, Name
          FROM AppMenuItem
          WHERE Id IN (${quoted})
        `),
        mapLabel: rec => rec.Label || rec.Name || rec.Id,
        warning: 'AppMenuItem lookup failed for setup access chunk'
      }
    ];

    for (const loader of loaders) {
      const ids = [...new Set((groups[loader.key] || []).filter(Boolean))];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const quoted = chunk.map(id => `'${id.replace(/'/g, "\\'")}'`).join(',');

        try {
          const result = await loader.load(quoted);
          (result.records || []).forEach(rec => {
            labelMap.set(rec.Id, loader.mapLabel(rec));
          });
        } catch (e) {
          console.warn(loader.warning, e);
        }
      }
    }

    const unresolvedIds = candidateIds.filter(id => !labelMap.has(id));
    if (unresolvedIds.length) {
      const fallbackLoaders = [
        {
          load: async (quoted) => queryOptionalTooling(`
            SELECT Id, DeveloperName, MasterLabel
            FROM CustomPermission
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
          warning: 'Fallback CustomPermission lookup failed'
        },
        {
          load: async (quoted) => queryAllTooling(`
            SELECT Id, DeveloperName, MasterLabel
            FROM FlowDefinition
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
          warning: 'Fallback FlowDefinition lookup failed'
        },
        {
          load: async (quoted) => queryAll(`
            SELECT Id, DeveloperName, MasterLabel
            FROM NamedCredential
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.MasterLabel || rec.DeveloperName || rec.Id,
          warning: 'Fallback NamedCredential lookup failed'
        },
        {
          load: async (quoted) => queryOptional(`
            SELECT Id, DeveloperName, MasterLabel
            FROM ExternalDataSource
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.MasterLabel || rec.Name || rec.DeveloperName || rec.Id,
          warning: 'Fallback ExternalDataSource lookup failed'
        },
        {
          load: async (quoted) => queryAll(`
            SELECT Id, Name
            FROM ConnectedApplication
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.Id,
          warning: 'Fallback ConnectedApplication lookup failed'
        },
        {
          load: async (quoted) => queryAllTooling(`
            SELECT Id, Name
            FROM ApexClass
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.Id,
          warning: 'Fallback ApexClass lookup failed'
        },
        {
          load: async (quoted) => queryAllTooling(`
            SELECT Id, Name
            FROM ApexPage
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.Id,
          warning: 'Fallback ApexPage lookup failed'
        },
        {
          load: async (quoted) => queryOptional(`
            SELECT Id, QualifiedApiName, DeveloperName, MasterLabel
            FROM EntityDefinition
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.MasterLabel || rec.QualifiedApiName || rec.DeveloperName || rec.Id,
          warning: 'Fallback EntityDefinition lookup failed'
        },
        {
          load: async (quoted) => {
            const result = await queryOptional(`
              SELECT DurableId, Label, DeveloperName
              FROM AppDefinition
              WHERE DurableId IN (${quoted})
            `);
            // Remap DurableId → Id so the shared labelMap.set(rec.Id) path works
            return {
              ...result,
              records: (result.records || []).map(rec => ({ ...rec, Id: rec.DurableId }))
            };
          },
          mapLabel: rec => rec.Label || rec.DeveloperName || rec.Id,
          warning: 'Fallback AppDefinition lookup failed'
        },
        {
          load: async (quoted) => {
            try {
              return await queryOptionalTooling(`
                SELECT Id, DeveloperName, Name
                FROM CustomApplication
                WHERE Id IN (${quoted})
              `);
            } catch {
              return await queryOptional(`
                SELECT Id, Label, Name
                FROM CustomApplication
                WHERE Id IN (${quoted})
              `);
            }
          },
          mapLabel: rec => rec.Label || rec.DeveloperName || rec.Name || rec.Id,
          warning: 'Fallback CustomApplication lookup failed'
        },
        {
          load: async (quoted) => queryOptional(`
            SELECT Id, Name
            FROM ServiceProvider
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.Id,
          warning: 'Fallback ServiceProvider lookup failed'
        },
        {
          load: async (quoted) => {
            try {
              return await queryOptional(`
                SELECT Id, MasterLabel, DeveloperName, Name
                FROM CustomTab
                WHERE Id IN (${quoted})
              `);
            } catch {
              return await queryOptionalTooling(`
                SELECT Id, MasterLabel, DeveloperName, Name
                FROM CustomTab
                WHERE Id IN (${quoted})
              `);
            }
          },
          mapLabel: rec => rec.MasterLabel || rec.Name || rec.DeveloperName || rec.Id,
          warning: 'Fallback CustomTab lookup failed'
        },
        {
          load: async (quoted) => queryOptional(`
            SELECT Id, Name, DeveloperName, SobjectType
            FROM RecordType
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.DeveloperName || rec.Id,
          warning: 'Fallback RecordType lookup failed'
        },
        {
          load: async (quoted) => queryOptionalTooling(`
            SELECT Id, Name, TableEnumOrId
            FROM Layout
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.TableEnumOrId || rec.Id,
          warning: 'Fallback Layout lookup failed'
        },
        {
          load: async (quoted) => queryOptionalTooling(`
            SELECT Id, Name
            FROM StaticResource
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.Id,
          warning: 'Fallback StaticResource lookup failed'
        },
        {
          load: async (quoted) => queryOptional(`
            SELECT Id, Name, DeveloperName
            FROM EmailTemplate
            WHERE Id IN (${quoted})
          `),
          mapLabel: rec => rec.Name || rec.DeveloperName || rec.Id,
          warning: 'Fallback EmailTemplate lookup failed'
        }
      ];

      for (const loader of fallbackLoaders) {
        const stillUnresolved = unresolvedIds.filter(id => !labelMap.has(id));
        if (!stillUnresolved.length) break;

        for (let i = 0; i < stillUnresolved.length; i += chunkSize) {
          const chunk = stillUnresolved.slice(i, i + chunkSize);
          const quoted = chunk.map(id => `'${id.replace(/'/g, "\\'")}'`).join(',');

          try {
            const result = await loader.load(quoted);
            (result.records || []).forEach(rec => {
              if (!labelMap.has(rec.Id)) {
                labelMap.set(rec.Id, loader.mapLabel(rec));
              }
            });
          } catch (e) {
            console.warn(loader.warning, e);
          }
        }
      }

      const stillUnresolved = unresolvedIds.filter(id => !labelMap.has(id));
      if (stillUnresolved.length) {
        const prefixes = [...new Set(stillUnresolved.map(id => String(id).slice(0, 3)).filter(Boolean))];
        const objectApiByPrefix = new Map();

        if (prefixes.length) {
          const quotedPrefixes = prefixes.map(prefix => `'${prefix.replace(/'/g, "\\'")}'`).join(',');

          try {
            const result = await queryOptional(`
              SELECT KeyPrefix, QualifiedApiName
              FROM EntityDefinition
              WHERE KeyPrefix IN (${quotedPrefixes})
            `);

            (result.records || []).forEach(record => {
              if (record?.KeyPrefix && record?.QualifiedApiName && !objectApiByPrefix.has(record.KeyPrefix)) {
                objectApiByPrefix.set(record.KeyPrefix, record.QualifiedApiName);
              }
            });
          } catch {
            // ignore generic key-prefix discovery failures
          }
        }

        const auth = await getAuth();
        for (const recordId of stillUnresolved) {
          const candidateObjectApis = inferSetupObjectCandidatesFromIdPrefix(recordId);

          if (candidateObjectApis.length) {
            for (const objectApiName of candidateObjectApis) {
              const recordUrls = [
                `${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}`,
                `${auth.instanceUrl}/services/data/${API_VERSION}/tooling/sobjects/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}`
              ];

              for (const url of recordUrls) {
                try {
                  const res = await apiFetch(url, withAuthHeaders(auth, { method: 'GET' }));
                  if (!res?.ok) continue;

                  const data = JSON.parse(res.text || '{}');
                  const label = extractSetupEntityRecordLabel(data);
                  if (label) {
                    labelMap.set(recordId, label);
                    break;
                  }
                } catch {
                  // continue to the next candidate object
                }
              }

              if (labelMap.has(recordId)) break;
            }
          }

          if (labelMap.has(recordId)) continue;

          const objectApiName = objectApiByPrefix.get(String(recordId).slice(0, 3));

          if (objectApiName) {
            const recordUrls = [
              `${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}`,
              `${auth.instanceUrl}/services/data/${API_VERSION}/tooling/sobjects/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}`
            ];

            for (const url of recordUrls) {
              try {
                const res = await apiFetch(url, withAuthHeaders(auth, { method: 'GET' }));
                if (!res?.ok) continue;

                const data = JSON.parse(res.text || '{}');
                const label = extractSetupEntityRecordLabel(data);
                if (label) {
                  labelMap.set(recordId, label);
                  break;
                }
              } catch {
                // continue to the next generic lookup option
              }
            }
          }

          if (labelMap.has(recordId)) continue;

          try {
            const res = await apiFetch(
              `${auth.instanceUrl}/services/data/${API_VERSION}/ui-api/records/${encodeURIComponent(recordId)}`,
              withAuthHeaders(auth, { method: 'GET' })
            );

            if (!res?.ok) continue;

            const data = JSON.parse(res.text || '{}');
            const fields = data.fields || {};
            const fieldNames = ['Name', 'MasterLabel', 'Label', 'DeveloperName'];
            const label = fieldNames
              .map(name => fields[name]?.displayValue || fields[name]?.value)
              .find(Boolean);

            if (label) {
              labelMap.set(recordId, label);
            }
          } catch {
            // ignore last-resort label lookup failures
          }
        }
      }
    }

    return rows.map(row => ({
      ...row,
      SetupEntityLabel: labelMap.get(row.SetupEntityId) || row.SetupEntityId,
      SetupEntityName: labelMap.get(row.SetupEntityId) || row.SetupEntityId
    }));
  }

  function looksLikeSalesforceId(value) {
    return /^[a-z0-9]{15}(?:[a-z0-9]{3})?$/i.test(String(value || '').trim());
  }

  async function normalizeEntityApiNames(rows, fieldName = 'SobjectType') {
    if (!rows?.length) return rows || [];

    const durableIds = [...new Set(
      rows
        .map(row => row?.[fieldName])
        .filter(value => looksLikeSalesforceId(value))
    )];

    if (!durableIds.length) return rows;

    const apiNameByDurableId = new Map();
    const chunkSize = 100;

    for (let i = 0; i < durableIds.length; i += chunkSize) {
      const chunk = durableIds.slice(i, i + chunkSize);
      const quoted = chunk.map(id => `'${String(id).replace(/'/g, "\\'")}'`).join(',');

      try {
        const result = await queryAll(`
          SELECT DurableId, QualifiedApiName
          FROM EntityDefinition
          WHERE DurableId IN (${quoted})
        `);

        (result.records || []).forEach(record => {
          if (record?.DurableId && record?.QualifiedApiName) {
            apiNameByDurableId.set(record.DurableId, record.QualifiedApiName);
          }
        });
      } catch (e) {
        console.warn('EntityDefinition durable-id normalization failed', e);
      }
    }

    return rows.map(row => ({
      ...row,
      [fieldName]: apiNameByDurableId.get(row?.[fieldName]) || row?.[fieldName]
    }));
  }

  function normalizeFieldPermissionFieldName(row) {
    const sobjectType = String(row?.SobjectType || '').trim();
    const rawField = String(row?.Field || '').trim();
    if (!rawField) return row;

    const prefix = sobjectType ? `${sobjectType}.` : '';
    const normalizedField = prefix && rawField.startsWith(prefix)
      ? rawField.slice(prefix.length)
      : rawField.split('.').slice(1).join('.') || rawField;

    return {
      ...row,
      Field: normalizedField
    };
  }

  async function fetchPermissionSetDetails(permSetId, options = {}) {
    const { forceRefresh = false, includeFieldPermissions = true } = options || {};
    const lightKey = getPermissionSetDetailsCacheKey(permSetId, false);
    const fullKey = getPermissionSetDetailsCacheKey(permSetId, true);
    const targetKey = getPermissionSetDetailsCacheKey(permSetId, includeFieldPermissions);

    if (!forceRefresh) {
      if (includeFieldPermissions && cachedPermissionSetDetails.has(fullKey)) {
        return cachedPermissionSetDetails.get(fullKey);
      }

      if (!includeFieldPermissions) {
        if (cachedPermissionSetDetails.has(fullKey)) return cachedPermissionSetDetails.get(fullKey);
        if (cachedPermissionSetDetails.has(lightKey)) return cachedPermissionSetDetails.get(lightKey);
      }
    }

    if (!forceRefresh && cachedPermissionSetDetailPromises.has(targetKey)) {
      return cachedPermissionSetDetailPromises.get(targetKey);
    }

    const loadPromise = (async () => {
      const [
        permissionSetGroupMembership,
        objectPermissionResult,
        fieldPermissionResult,
        setupEntityAccessResult,
        permissionFields
      ] = await Promise.all([
        getPermissionSetGroupMembership(permSetId),
        queryAll(`
          SELECT Id, ParentId, SobjectType, PermissionsRead, PermissionsCreate,
                 PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords,
                 PermissionsModifyAllRecords
          FROM ObjectPermissions
          WHERE ParentId = '${permSetId}'
          ORDER BY SobjectType
        `),
        includeFieldPermissions
          ? queryAll(`
              SELECT Id, ParentId, SobjectType, Field, PermissionsRead, PermissionsEdit
              FROM FieldPermissions
              WHERE ParentId = '${permSetId}'
              ORDER BY SobjectType, Field
            `)
          : Promise.resolve({ records: [] }),
        queryAll(`
          SELECT Id, ParentId, SetupEntityId, SetupEntityType
          FROM SetupEntityAccess
          WHERE ParentId = '${permSetId}'
          ORDER BY SetupEntityType, SetupEntityId
        `),
        getPermissionSetPermissionFields()
      ]);

      let objectPermissions = objectPermissionResult.records;
      let fieldPermissions = fieldPermissionResult.records;
      let setupEntityAccessRaw = setupEntityAccessResult.records;

      [objectPermissions, fieldPermissions, setupEntityAccessRaw] = await Promise.all([
        normalizeEntityApiNames(objectPermissions, 'SobjectType'),
        normalizeEntityApiNames(fieldPermissions, 'SobjectType'),
        enrichSetupEntityAccessRows(setupEntityAccessRaw)
      ]);

      fieldPermissions = fieldPermissions.map(normalizeFieldPermissionFieldName);

      const apexClassAccess = [];
      const visualforceAccess = [];
      const customPermissions = [];
      const flowAccess = [];
      const assignedApps = [];
      const connectedAppAccess = [];
      const setupAccess = [];

      setupEntityAccessRaw.forEach(row => {
        const bucket = classifySetupEntity(row);
        const enriched = {
          ...row,
          label: buildSetupEntityLabel(row),
          setupType: row?.SetupEntityType || 'Other'
        };

        if (bucket === 'apexClassAccess') apexClassAccess.push(enriched);
        else if (bucket === 'visualforceAccess') visualforceAccess.push(enriched);
        else if (bucket === 'customPermissions') customPermissions.push(enriched);
        else if (bucket === 'flowAccess') flowAccess.push(enriched);
        else if (bucket === 'assignedApps') assignedApps.push(enriched);
        else if (bucket === 'connectedAppAccess') connectedAppAccess.push(enriched);
        else setupAccess.push(enriched);
      });

      const chunkSize = 80;
      const permissionApiVersion = await getSupportedApiVersion(true);
      const userPermissionResults = await Promise.all(
        Array.from({ length: Math.ceil(permissionFields.length / chunkSize) }, (_, index) => {
          const chunk = permissionFields.slice(index * chunkSize, (index + 1) * chunkSize);
          return queryAll(`
            SELECT ${chunk.join(', ')}
            FROM PermissionSet
            WHERE Id = '${permSetId}'
          `, { apiVersion: permissionApiVersion });
        })
      );

      const mergedUserPermissions = {};
      userPermissionResults.forEach(result => {
        Object.assign(mergedUserPermissions, result.records?.[0] || {});
      });

      const details = {
        objectPermissions,
        fieldPermissions,
        fieldPermissionsLoaded: includeFieldPermissions,
        userPermissions: mergedUserPermissions,
        apexClassAccess,
        visualforceAccess,
        customPermissions,
        flowAccess,
        assignedApps,
        connectedAppAccess,
        setupAccess,
        ...permissionSetGroupMembership
      };

      cachedPermissionSetDetails.set(targetKey, details);
      if (includeFieldPermissions) {
        cachedPermissionSetDetails.set(lightKey, details);
      }
      return details;
    })();

    cachedPermissionSetDetailPromises.set(targetKey, loadPromise);

    try {
      return await loadPromise;
    } finally {
      cachedPermissionSetDetailPromises.delete(targetKey);
    }
  }

  async function fetchPermissionSetFieldPermissionsForObject(permSetId, objectApiName, options = {}) {
    const { forceRefresh = false } = options || {};
    const cacheKey = `${permSetId}::${objectApiName}`;

    if (!forceRefresh && cachedFieldPermissionsByObject.has(cacheKey)) {
      return cachedFieldPermissionsByObject.get(cacheKey);
    }

    if (!forceRefresh && cachedFieldPermissionObjectPromises.has(cacheKey)) {
      return cachedFieldPermissionObjectPromises.get(cacheKey);
    }

    const loadPromise = (async () => {
      const result = await queryAll(`
        SELECT Id, ParentId, SobjectType, Field, PermissionsRead, PermissionsEdit
        FROM FieldPermissions
        WHERE ParentId = '${permSetId}'
          AND SobjectType = '${String(objectApiName || '').replace(/'/g, "\\'")}'
        ORDER BY Field
      `);

      const rows = (result.records || []).map(normalizeFieldPermissionFieldName);
      cachedFieldPermissionsByObject.set(cacheKey, rows);
      return rows;
    })();

    cachedFieldPermissionObjectPromises.set(cacheKey, loadPromise);
    try {
      return await loadPromise;
    } finally {
      cachedFieldPermissionObjectPromises.delete(cacheKey);
    }
  }

  async function patchRecord(sobjectName, recordId, body) {
    const auth = await getAuth();
    const apiVersion = await getSupportedApiVersion(true);
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/${apiVersion}/sobjects/${sobjectName}/${recordId}`,
      withAuthHeaders(auth, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    );

    if (!res?.ok) {
      // Try to parse the Salesforce error response
      let errors = [];
      try {
        errors = JSON.parse(res.text || '[]');
      } catch {
        // If parsing fails, fall through to generic error
      }

      // Detect managed package restriction (HTTP 403 CANNOT_MODIFY_MANAGED_OBJECT)
      const managedError = Array.isArray(errors) && errors.find(
        e => e.errorCode === 'CANNOT_MODIFY_MANAGED_OBJECT'
      );

      if (managedError) {
        // Throw a typed error so callers can handle it gracefully
        const err = new Error(
          `Cannot edit managed field — this field is locked by an installed package and cannot be modified: ${sobjectName}/${recordId}`
        );
        err.code = 'CANNOT_MODIFY_MANAGED_OBJECT';
        err.recordId = recordId;
        err.sobjectName = sobjectName;
        err.salesforceErrors = errors;
        throw err;
      }

      // All other API errors
      throw new Error(`Update failed for ${sobjectName}/${recordId}: ${res?.text || ''}`);
    }
  }

  async function createRecord(sobjectName, body) {
    const auth = await getAuth();
    const apiVersion = await getSupportedApiVersion(true);
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/${apiVersion}/sobjects/${sobjectName}`,
      withAuthHeaders(auth, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    );

    if (!res?.ok) {
      throw new Error(`Create failed for ${sobjectName}: ${res?.text || ''}`);
    }

    return JSON.parse(res.text || '{}');
  }

  async function compositeBatch(batchRequests, haltOnError = false) {
    const auth = await getAuth();
    const apiVersion = await getSupportedApiVersion(true);
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/${apiVersion}/composite/batch`,
      withAuthHeaders(auth, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchRequests, haltOnError })
      })
    );

    if (!res?.ok) {
      throw new Error(`Composite batch failed: ${res?.text || ''}`);
    }

    const data = JSON.parse(res.text || '{}');
    return data.results || [];
  }

  async function deleteRecord(sobjectName, recordId) {
    const auth = await getAuth();
    const apiVersion = await getSupportedApiVersion(true);
    const res = await apiFetch(
      `${auth.instanceUrl}/services/data/${apiVersion}/sobjects/${sobjectName}/${recordId}`,
      withAuthHeaders(auth, { method: 'DELETE' })
    );

    if (!res?.ok) {
      throw new Error(`Delete failed for ${sobjectName}/${recordId}: ${res?.text || ''}`);
    }
  }

  function clearAuthCache() {
    cachedAuth = null;
    cachedLatestApiVersion = null;
  }

  function clearPermissionFieldCache() {
    cachedPermissionFields = null;
    cachedPermissionFieldMetadata = null;
    cachedQueryablePermissionFieldMetadata = null;
    cachedUserPermissionMetadata = null;
  }

  function clearPermissionSetDetailsCache(permSetId = null) {
    if (permSetId) {
      cachedPermissionSetDetails.delete(getPermissionSetDetailsCacheKey(permSetId, false));
      cachedPermissionSetDetails.delete(getPermissionSetDetailsCacheKey(permSetId, true));
      cachedPermissionSetDetailPromises.delete(getPermissionSetDetailsCacheKey(permSetId, false));
      cachedPermissionSetDetailPromises.delete(getPermissionSetDetailsCacheKey(permSetId, true));
      Array.from(cachedFieldPermissionsByObject.keys())
        .filter(key => key.startsWith(`${permSetId}::`))
        .forEach(key => cachedFieldPermissionsByObject.delete(key));
      Array.from(cachedFieldPermissionObjectPromises.keys())
        .filter(key => key.startsWith(`${permSetId}::`))
        .forEach(key => cachedFieldPermissionObjectPromises.delete(key));
      return;
    }

    cachedPermissionSetDetails.clear();
    cachedPermissionSetDetailPromises.clear();
    cachedFieldPermissionsByObject.clear();
    cachedFieldPermissionObjectPromises.clear();
  }

  return {
    getAuth,
    loadFieldDependencies,
    getCurrentUserContext,
    loadPermissionSets,
    loadObjectCatalog,
    loadAccessCatalogs,
    loadGroupQueueDirectory,
    loadGroupQueueDetails,
    searchGroupQueueCandidates,
    loadQueueableObjects,
    loadFieldCatalog,
    fetchPermissionSetDetails,
    fetchPermissionSetFieldPermissionsForObject,
    patchRecord,
    createRecord,
    compositeBatch,
    deleteRecord,
    getPermissionSetPermissionFields,
    getPermissionSetPermissionMetadata,
    getSupportedApiVersion,
    clearAuthCache,
    clearPermissionFieldCache,
    clearPermissionSetDetailsCache
  };
})();