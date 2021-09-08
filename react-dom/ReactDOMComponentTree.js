const randomKey = Math.random().toString(36).slice(2);
const internalInstanceKey = "__reactFiber$" + randomKey;
const internalPropsKey = "__reactProps$" + randomKey;
const internalContainerInstanceKey = "__reactContainer$" + randomKey;
const internalEventHandlersKey = "__reactEvents$" + randomKey;
const internalEventHandlerListenersKey = "__reactListeners$" + randomKey;
const internalEventHandlesSetKey = "__reactHandles$" + randomKey;

// fiber对象挂载到dom上
export function precacheFiberNode(hostInst, node) {
  node[internalInstanceKey] = hostInst;
}
