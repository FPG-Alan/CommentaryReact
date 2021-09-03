import {
  getPublicRootInstance,
  updateContainer,
} from "../react-reconciler/ReactFiberReconciler";
import { createLegacyRoot } from "./ReactDOMRoot";

export function render(element, container, callback) {
  return legacyRenderSubtreeIntoContainer(null, element, container, callback);
}

function legacyRenderSubtreeIntoContainer(
  parentComponent,
  children,
  container,
  callback
) {
  let root = container._reactRootContainer;
  let fiberRoot;
  if (!root) {
    // Initial mount
    root = container._reactRootContainer =
      legacyCreateRootFromDOMContainer(container);
    fiberRoot = root._internalRoot;
    if (typeof callback === "function") {
      const originalCallback = callback;
      callback = function () {
        const instance = getPublicRootInstance(fiberRoot);
        originalCallback.call(instance);
      };
    }
    // Initial mount should not be batched.
    // unbatchedUpdates 主要是设置 ReactFiberWorkLoop的全局变量 executionContext (执行上下文)
    unbatchedUpdates(() => {
      updateContainer(children, fiberRoot, parentComponent, callback);
    });
  } else {
    fiberRoot = root._internalRoot;
    if (typeof callback === "function") {
      const originalCallback = callback;
      callback = function () {
        const instance = getPublicRootInstance(fiberRoot);
        originalCallback.call(instance);
      };
    }
    // Update
    updateContainer(children, fiberRoot, parentComponent, callback);
  }
  return getPublicRootInstance(fiberRoot);
}

function legacyCreateRootFromDOMContainer(container) {
  // First clear any existing content.
  let rootSibling;
  while ((rootSibling = container.lastChild)) {
    container.removeChild(rootSibling);
  }
  return createLegacyRoot(container);
}
