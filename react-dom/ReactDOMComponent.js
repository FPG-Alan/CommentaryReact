function getOwnerDocumentFromRootContainer(rootContainerElement) {
  return rootContainerElement.nodeType === DOCUMENT_NODE
    ? rootContainerElement
    : rootContainerElement.ownerDocument;
}

export function createTextNode(text, rootContainerElement) {
  // 理解为Document就好
  return getOwnerDocumentFromRootContainer(rootContainerElement).createTextNode(
    text
  );
}
