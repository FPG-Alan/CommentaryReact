import { getChildNamespace } from "../shared/DOMNamespaces";
import { createTextNode } from "./ReactDOMComponent";
import { precacheFiberNode } from "./ReactDOMComponentTree";

export const noTimeout = -1;

export function getPublicInstance(instance) {
  return instance;
}

export function getRootHostContext(rootContainerInstance) {
  let type;
  let namespace;
  const nodeType = rootContainerInstance.nodeType;
  switch (nodeType) {
    case DOCUMENT_NODE:
    case DOCUMENT_FRAGMENT_NODE: {
      type = nodeType === DOCUMENT_NODE ? "#document" : "#fragment";
      const root = rootContainerInstance.documentElement;
      namespace = root ? root.namespaceURI : getChildNamespace(null, "");
      break;
    }
    default: {
      const container =
        nodeType === COMMENT_NODE
          ? rootContainerInstance.parentNode
          : rootContainerInstance;
      const ownNamespace = container.namespaceURI || null;
      type = container.tagName;
      namespace = getChildNamespace(ownNamespace, type);
      break;
    }
  }
  return namespace;
}

export function getChildHostContext(
  parentHostContext,
  type,
  rootContainerInstance
) {
  const parentNamespace = parentHostContext;
  return getChildNamespace(parentNamespace, type);
}

export const supportsMutation = true;

export function shouldSetTextContent(type, props) {
  return (
    type === "textarea" ||
    type === "option" ||
    type === "noscript" ||
    typeof props.children === "string" ||
    typeof props.children === "number" ||
    (typeof props.dangerouslySetInnerHTML === "object" &&
      props.dangerouslySetInnerHTML !== null &&
      props.dangerouslySetInnerHTML.__html != null)
  );
}

export function createTextInstance(
  text,
  rootContainerInstance,
  internalInstanceHandle
) {
  const textNode = createTextNode(text, rootContainerInstance);
  precacheFiberNode(internalInstanceHandle, textNode);
  return textNode;
}

export function prepareForCommit(containerInfo) {
  // 事件相关的东西。。。反正断点调试这里是 true
  eventsEnabled = ReactBrowserEventEmitterIsEnabled();

  // 通过 document.activeElement， 过滤出用户能选择的element(特定类型的input, textarea, 有contentEditable=true属性的其他元素)，
  // 返回其选择的范围(如果有的话)
  selectionInformation = getSelectionInformation();
  let activeInstance = null;

  ReactBrowserEventEmitterSetEnabled(false);
  return activeInstance;
}

/**
 * 清除所有文本信息...
 * 为啥...
 */
export function clearContainer(container) {
  if (container.nodeType === ELEMENT_NODE) {
    container.textContent = "";
  } else if (container.nodeType === DOCUMENT_NODE) {
    const body = container.body;
    if (body != null) {
      body.textContent = "";
    }
  }
}

/**
 * 跟上面的prepareForCommit是一对
 * 嗯, 这一定是为了解决现实世界的某个bug
 * 就
 * 1. 先保存用户选中的
 * 2. 然后 clearContainer 清除所有文字
 * 3. 最后 resetAfterCommit 恢复用户选中的
 *
 * 还有些跟事件blabla相关的blabla
 *
 * 猜的
 */
export function resetAfterCommit(containerInfo) {
  restoreSelection(selectionInformation);
  ReactBrowserEventEmitterSetEnabled(eventsEnabled);
  eventsEnabled = null;
  selectionInformation = null;
}
