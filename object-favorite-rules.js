(function initObjectFavoriteRules(root, factory) {
    const api = factory();

    if (root) root.ObjectFavoriteRules = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, () => {
    function getAvailableFavoriteObjects(favoriteNames, availableObjects) {
        const objectsByName = new Map(
            (availableObjects || [])
                .filter(item => item?.name)
                .map(item => [item.name, item])
        );

        return Array.from(favoriteNames || [])
            .map(name => objectsByName.get(name))
            .filter(Boolean)
            .sort((a, b) => String(a.label || a.name).localeCompare(String(b.label || b.name)));
    }

    return { getAvailableFavoriteObjects };
});