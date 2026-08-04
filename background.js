const extensionApi = globalThis.browser ?? chrome;

extensionApi.action?.onClicked.addListener(() => {
  if (extensionApi.sidebarAction) {
    void extensionApi.sidebarAction.open();
  } else if (extensionApi.sidePanel) {
    void extensionApi.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const windowId = tabs[0]?.windowId;
      if (windowId !== undefined) void extensionApi.sidePanel.open({ windowId });
    });
  }
});
