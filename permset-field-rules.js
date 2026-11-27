(function initPermsetFieldPermissionRules(root, factory) {
  const api = factory();

  if (root) root.PermsetFieldPermissionRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, () => {
  const NON_PERMISSIONABLE_STANDARD_FIELDS = new Set([
    'CreatedById',
    'CreatedDate',
    'LastModifiedById',
    'LastModifiedDate',
    'SystemModstamp'
  ]);

  function isFieldPermissionable(metadata = {}) {
    return !isNonPermissionableStandardField(metadata);
  }

  function isFieldReadAllowed(metadata = {}) {
    return isFieldPermissionable(metadata);
  }

  function isFieldEditAllowed(metadata = {}) {
    return isFieldPermissionable(metadata)
      && !(metadata.custom === false && metadata.updateable === false)
      && !metadata.calculated
      && !metadata.autoNumber;
  }

  function isNonPermissionableStandardField(metadata = {}) {
    return metadata.custom === false && (
      metadata.permissionable === false ||
      NON_PERMISSIONABLE_STANDARD_FIELDS.has(String(metadata.fieldApiName || ''))
    );
  }

  function shouldAutoGrantFieldRead(metadata = {}) {
    return isFieldReadAllowed(metadata) && !isFieldEditAllowed(metadata);
  }

  function coerceFieldPermissionValue(metadata = {}, value) {
    if (!value) return value;

    return {
      ...value,
      PermissionsRead: !!value.PermissionsRead,
      PermissionsEdit: isFieldEditAllowed(metadata) ? !!value.PermissionsEdit : false
    };
  }

  function shouldShowFieldRow({ objectApiName, row, hasReadableObjectAccess, hasLoadedFieldCatalog } = {}) {
    if (!objectApiName) return false;
    return !!(hasReadableObjectAccess || hasLoadedFieldCatalog || row?.values?.some(Boolean));
  }

  return {
    isFieldPermissionable,
    isFieldReadAllowed,
    isFieldEditAllowed,
    shouldAutoGrantFieldRead,
    coerceFieldPermissionValue,
    shouldShowFieldRow
  };
});