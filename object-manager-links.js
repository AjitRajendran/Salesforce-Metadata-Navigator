(function (globalScope) {
    const ROUTE_OBJECT_SEGMENT_MODE = Object.freeze({
        LightningRecordPages: 'apiName',
        LightningPages: 'apiName',
        ButtonsLinksActions: 'apiName',
        Limits: 'apiName',
        RecordTypes: 'apiName',
        MySearchLayouts: 'apiName',
        AlohaSearchLayouts: 'apiName',
        FieldAccess: 'apiName',
        ApexTriggers: 'apiName'
    });

    function normalizeBaseUrl(baseUrl) {
        return String(baseUrl || '').replace(/\/+$/, '');
    }

    function resolveObjectSegment(selectedObject, routeName) {
        const segmentMode = ROUTE_OBJECT_SEGMENT_MODE[routeName] || 'id';
        const segment = segmentMode === 'apiName'
            ? selectedObject?.name
            : selectedObject?.id;

        if (!segment) {
            throw new Error(`Missing object ${segmentMode === 'apiName' ? 'API name' : 'id'} for route ${routeName}`);
        }

        return segment;
    }

    function buildRootUrl(baseUrl, selectedObject, routeName) {
        return `${normalizeBaseUrl(baseUrl)}/lightning/setup/ObjectManager/${resolveObjectSegment(selectedObject, routeName)}/${routeName}/view`;
    }

    function buildItemUrl(baseUrl, selectedObject, routeName, itemId) {
        if (!itemId) {
            throw new Error(`Missing item id for route ${routeName}`);
        }

        return `${normalizeBaseUrl(baseUrl)}/lightning/setup/ObjectManager/${resolveObjectSegment(selectedObject, routeName)}/${routeName}/${itemId}/view`;
    }

    function buildEnhancedProfileUrl(baseUrl, profileId, sectionKey) {
        if (!profileId) {
            throw new Error('Missing profile id');
        }

        const address = `/${profileId}${sectionKey ? `?s=${sectionKey}` : ''}`;
        return `${normalizeBaseUrl(baseUrl)}/lightning/setup/EnhancedProfiles/page?address=${encodeURIComponent(address)}`;
    }

    function buildPermissionSetUrl(baseUrl, permissionSetId, sectionKey) {
        if (!permissionSetId) {
            throw new Error('Missing permission set id');
        }

        const address = `/${permissionSetId}${sectionKey ? `?s=${sectionKey}` : ''}`;
        return `${normalizeBaseUrl(baseUrl)}/lightning/setup/PermSets/page?address=${encodeURIComponent(address)}`;
    }

    const api = {
        ROUTE_OBJECT_SEGMENT_MODE,
        resolveObjectSegment,
        buildRootUrl,
        buildItemUrl,
        buildEnhancedProfileUrl,
        buildPermissionSetUrl
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.ObjectManagerLinks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);