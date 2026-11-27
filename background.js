async function openTabNextToReference(url, referenceTab) {
  if (typeof url !== 'string' || !url) return;

  let targetTab = referenceTab;
  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    targetTab = tabs && tabs[0];
  }

  const createOptions = { url };
  if (typeof targetTab?.index === 'number') {
    createOptions.index = targetTab.index + 1;
  }

  return chrome.tabs.create(createOptions);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'permset_api_query') {
    (async () => {
      try {
        const res = await fetch(message.url, message.options || {});
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      } catch (e) {
        sendResponse({ ok: false, status: 0, text: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (message.type === 'open_inspector') {
    if (typeof message.url === 'string' && message.url.startsWith('http')) {
      openTabNextToReference(message.url, sender.tab);
    }
    return false;
  }

  if (message.type === 'open_urls') {
    (async () => {
      try {
        const urls = Array.isArray(message.urls)
          ? message.urls.filter(url => typeof url === 'string' && url.startsWith('http'))
          : [];

        if (!urls.length) {
          sendResponse({ ok: false, opened: 0, error: 'No valid URLs provided.' });
          return;
        }

        let referenceTab = sender.tab;
        if (!referenceTab) {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          referenceTab = tabs && tabs[0];
        }

        let insertIndex = typeof referenceTab?.index === 'number' ? referenceTab.index + 1 : undefined;
        let opened = 0;
        for (const url of urls) {
          const createdTab = await chrome.tabs.create(insertIndex === undefined ? { url } : { url, index: insertIndex });
          opened += 1;
          if (typeof createdTab?.index === 'number') {
            insertIndex = createdTab.index + 1;
          } else if (typeof insertIndex === 'number') {
            insertIndex += 1;
          }
        }

        sendResponse({ ok: true, opened });
      } catch (error) {
        sendResponse({ ok: false, opened: 0, error: String(error?.message || error) });
      }
    })();
    return true;
  }

  if (message.type === 'open_permset_manager') {
    (async () => {
      let sourceTab = sender.tab;
      if (!sourceTab) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        sourceTab = tabs && tabs[0];
      }

      const managerUrl = new URL(chrome.runtime.getURL('permset-manager.html'));
      if (sourceTab?.url) managerUrl.searchParams.set('sourceUrl', sourceTab.url);
      openTabNextToReference(managerUrl.toString(), sourceTab);
    })();
    return false;
  }

  return false;
});