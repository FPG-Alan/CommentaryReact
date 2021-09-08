import { getRootHostContext } from "../react-dom/ReactDOMHostConfig";
import { createCursor, push, pop } from "./ReactFiberStack";

const NO_CONTEXT = {};
const contextStackCursor = createCursor(NO_CONTEXT);
const rootInstanceStackCursor = createCursor(NO_CONTEXT);

function requiredContext(c) {
  invariant(
    c !== NO_CONTEXT,
    "Expected host context to exist. This error is likely caused by a bug " +
      "in React. Please file an issue."
  );
  return c;
}

export function getRootHostContainer() {
  const rootInstance = requiredContext(rootInstanceStackCursor.current);
  return rootInstance;
}

export function getHostContext() {
  const context = requiredContext(contextStackCursor.current);
  return context;
}

export function pushHostContainer(fiber, nextRootInstance) {
  // Push current root instance onto the stack;
  // This allows us to reset root when portals are popped.
  push(rootInstanceStackCursor, nextRootInstance, fiber);
  // Track the context and the Fiber that provided it.
  // This enables us to pop only Fibers that provide unique contexts.
  push(contextFiberStackCursor, fiber, fiber);

  // Finally, we need to push the host context to the stack.
  // However, we can't just call getRootHostContext() and push it because
  // we'd have a different number of entries on the stack depending on
  // whether getRootHostContext() throws somewhere in renderer code or not.
  // So we push an empty value first. This lets us safely unwind on errors.
  push(contextStackCursor, NO_CONTEXT, fiber);
  // 拿了一个nameSpace, 暂时不知道干嘛的
  const nextRootContext = getRootHostContext(nextRootInstance);
  // Now that we know this function doesn't throw, replace it.
  pop(contextStackCursor, fiber);
  push(contextStackCursor, nextRootContext, fiber);
}