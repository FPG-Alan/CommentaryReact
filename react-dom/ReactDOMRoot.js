import { createContainer } from "../react-reconciler/ReactFiberReconciler";
import { LegacyRoot } from "../react-reconciler/ReactRootTags";

const randomKey = Math.random().toString(36).slice(2);
const internalContainerInstanceKey = "__reactContainer$" + randomKey;

export function createLegacyRoot(container) {
  return new ReactDOMBlockingRoot(container, LegacyRoot);
}

function ReactDOMBlockingRoot(container, tag) {
  this._internalRoot = createRootImpl(container, tag);
}

ReactDOMBlockingRoot.prototype.render = function (children) {
  const root = this._internalRoot;
  updateContainer(children, root, null, null);
};

ReactDOMBlockingRoot.prototype.unmount = function () {
  const root = this._internalRoot;
  const container = root.containerInfo;
  updateContainer(null, root, null, () => {
    // unmarkContainerAsRoot(container);
    container[internalContainerInstanceKey] = null;
  });
};

// tag: 0, 1, 2
function createRootImpl(container, tag) {
  // Tag is either LegacyRoot or Concurrent Root
  const root = createContainer(container, tag);
  // markContainerAsRoot(root.current, container);
  container[internalContainerInstanceKey] = root.current;

  return root;
}
