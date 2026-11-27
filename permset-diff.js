window.PermsetDiff = (() => {
  function mapBy(rows, keyFn) {
    const map = new Map();
    (rows || []).forEach(row => {
      const key = keyFn(row);
      if (key) map.set(key, row);
    });
    return map;
  }

  function toSystemLabel(apiName) {
    return String(apiName || '')
      .replace(/^Permissions/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
  }

  function getSystemPermissionKeys(selected) {
    const keys = new Set();

    selected.forEach(ps => {
      const userPermissions = ps?.details?.userPermissions || {};
      Object.keys(userPermissions).forEach(key => {
        if (key.startsWith('Permissions') && key !== 'attributes') {
          keys.add(key);
        }
      });
    });

    return Array.from(keys).sort((a, b) =>
      toSystemLabel(a).localeCompare(toSystemLabel(b))
    );
  }

  function getSetupRowLabel(row, fallbackKey) {
    return (
      row?.label ||
      row?.SetupEntityLabel ||
      row?.SetupEntityName ||
      row?.SetupEntityId ||
      fallbackKey
    );
  }

  function buildGenericRows(selected, sectionName, keyFn, labelFn = (row, key) => key) {
    const keys = new Set();

    selected.forEach(ps => {
      (ps?.details?.[sectionName] || []).forEach(row => {
        const key = keyFn(row);
        if (key) keys.add(key);
      });
    });

    const maps = selected.map(ps => mapBy(ps?.details?.[sectionName] || [], keyFn));

    return Array.from(keys)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map(key => {
        const firstMatch = maps.find(m => m.has(key))?.get(key);
        return {
          key,
          label: labelFn(firstMatch, key),
          values: maps.map(m => m.get(key) || null)
        };
      });
  }

  function buildMergedRows(selected, sectionNames, keyFn, labelFn = (row, key) => key) {
    const keys = new Set();

    selected.forEach(ps => {
      sectionNames.forEach(sectionName => {
        (ps?.details?.[sectionName] || []).forEach(row => {
          const key = keyFn(row);
          if (key) keys.add(key);
        });
      });
    });

    const maps = selected.map(ps => mapBy(
      sectionNames.flatMap(sectionName => ps?.details?.[sectionName] || []),
      keyFn
    ));

    return Array.from(keys)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map(key => {
        const firstMatch = maps.find(m => m.has(key))?.get(key);
        return {
          key,
          label: labelFn(firstMatch, key),
          values: maps.map(m => m.get(key) || null)
        };
      });
  }

  function buildComparison(selected) {
    const objectRows = buildGenericRows(
      selected,
      'objectPermissions',
      row => row?.SobjectType,
      (row, key) => key
    );

    const fieldRows = buildGenericRows(
      selected,
      'fieldPermissions',
      row => (row?.SobjectType && row?.Field) ? `${row.SobjectType}.${row.Field}` : null,
      (row, key) => key
    );

    const apexClassRows = buildGenericRows(
      selected,
      'apexClassAccess',
      row => row?.SetupEntityId || row?.label,
      (row, key) => getSetupRowLabel(row, key)
    );

    const visualforceRows = buildGenericRows(
      selected,
      'visualforceAccess',
      row => row?.SetupEntityId || row?.label,
      (row, key) => getSetupRowLabel(row, key)
    );

    const customPermissionRows = buildGenericRows(
      selected,
      'customPermissions',
      row => row?.SetupEntityId || row?.label,
      (row, key) => getSetupRowLabel(row, key)
    );

    const flowAccessRows = buildGenericRows(
      selected,
      'flowAccess',
      row => row?.SetupEntityId || row?.label,
      (row, key) => getSetupRowLabel(row, key)
    );

    const assignedAppRows = buildGenericRows(
      selected,
      'assignedApps',
      row => `${row?.setupType || 'App'}::${row?.SetupEntityId || row?.label || 'Unknown'}`,
      (row, key) => getSetupRowLabel(row, key)
    );

    const connectedAppRows = buildGenericRows(
      selected,
      'connectedAppAccess',
      row => `${row?.setupType || 'ConnectedApplication'}::${row?.SetupEntityId || row?.label || 'Unknown'}`,
      (row, key) => getSetupRowLabel(row, key)
    );

    const setupAccessRows = buildGenericRows(
      selected,
      'setupAccess',
      row => `${row?.setupType || 'Other'}::${row?.SetupEntityId || row?.label || 'Unknown'}`,
      (row, key) => `${row?.setupType || 'Other'} — ${getSetupRowLabel(row, key)}`
    );

    const systemFields = getSystemPermissionKeys(selected);
    const systemRows = systemFields.map(key => ({
      key,
      label: toSystemLabel(key),
      values: selected.map(ps => !!ps?.details?.userPermissions?.[key])
    }));

    return {
      objectRows,
      fieldRows,
      systemRows,
      apexClassRows,
      visualforceRows,
      customPermissionRows,
      flowAccessRows,
      assignedAppRows,
      connectedAppRows,
      setupAccessRows
    };
  }

  return {
    buildComparison,
    getSystemPermissionKeys,
    toSystemLabel
  };
})();