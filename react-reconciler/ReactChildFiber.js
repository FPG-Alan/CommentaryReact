// This API will tag the children with the side-effect of the reconciliation
// itself. They will be added to the side-effect list as we pass through the

import {
  Block,
  ClassComponent,
  ForwardRef,
  FunctionComponent,
  SimpleMemoComponent,
} from "./ReactWokTags";
import {
  REACT_ELEMENT_TYPE,
  REACT_LAZY_TYPE,
  REACT_PORTAL_TYPE,
} from "../shared/ReactSymbols";

import { createFiberFromElement } from "./ReactFiber";

// 胁迫...ref???
function coerceRef(returnFiber, current, element) {
  const mixedRef = element.ref;
  if (
    mixedRef !== null &&
    typeof mixedRef !== "function" &&
    typeof mixedRef !== "object"
  ) {
    if (element._owner) {
      const owner = element._owner;
      let inst;
      if (owner) {
        const ownerFiber = owner;
        invariant(
          ownerFiber.tag === ClassComponent,
          "Function components cannot have string refs. " +
            "We recommend using useRef() instead. " +
            "Learn more about using refs safely here: " +
            "https://reactjs.org/link/strict-mode-string-ref"
        );
        inst = ownerFiber.stateNode;
      }
      invariant(
        inst,
        "Missing owner for string ref %s. This error is likely caused by a " +
          "bug in React. Please file an issue.",
        mixedRef
      );
      const stringRef = "" + mixedRef;
      // Check if previous string ref matches new string ref
      if (
        current !== null &&
        current.ref !== null &&
        typeof current.ref === "function" &&
        current.ref._stringRef === stringRef
      ) {
        return current.ref;
      }
      const ref = function (value) {
        let refs = inst.refs;
        if (refs === emptyRefsObject) {
          // This is a lazy pooled frozen object, so we need to initialize.
          refs = inst.refs = {};
        }
        if (value === null) {
          delete refs[stringRef];
        } else {
          refs[stringRef] = value;
        }
      };
      ref._stringRef = stringRef;
      return ref;
    } else {
      invariant(
        typeof mixedRef === "string",
        "Expected ref to be a function, a string, an object returned by React.createRef(), or null."
      );
      invariant(
        element._owner,
        "Element ref was specified as a string (%s) but no owner was set. This could happen for one of" +
          " the following reasons:\n" +
          "1. You may be adding a ref to a function component\n" +
          "2. You may be adding a ref to a component that was not created inside a component's render method\n" +
          "3. You have multiple copies of React loaded\n" +
          "See https://reactjs.org/link/refs-must-have-owner for more information.",
        mixedRef
      );
    }
  }
  return mixedRef;
}

// This wrapper function exists because I expect to clone the code in each path
// to be able to optimize each path individually by branching early. This needs
// a compiler or we can do it manually. Helpers that don't need this branching
// live outside of this function.
function ChildReconciler(shouldTrackSideEffects) {
  function placeSingleChild(newFiber) {
    // This is simpler for the single child case. We only need to do a
    // placement for inserting new children.
    if (shouldTrackSideEffects && newFiber.alternate === null) {
      newFiber.flags = Placement;
    }
    return newFiber;
  }

  function reconcileSingleElement(
    returnFiber,
    currentFirstChild,
    element,
    lanes
  ) {
    const key = element.key;
    let child = currentFirstChild;
    // 初次渲染， child应该为null
    while (child !== null) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        switch (child.tag) {
          case Fragment: {
            if (element.type === REACT_FRAGMENT_TYPE) {
              deleteRemainingChildren(returnFiber, child.sibling);
              const existing = useFiber(child, element.props.children);
              existing.return = returnFiber;
              return existing;
            }
            break;
          }
          case Block:
            if (enableBlocksAPI) {
              let type = element.type;
              if (type.$$typeof === REACT_LAZY_TYPE) {
                type = resolveLazyType(type);
              }
              if (type.$$typeof === REACT_BLOCK_TYPE) {
                // The new Block might not be initialized yet. We need to initialize
                // it in case initializing it turns out it would match.
                if (type._render === child.type._render) {
                  deleteRemainingChildren(returnFiber, child.sibling);
                  const existing = useFiber(child, element.props);
                  existing.type = type;
                  existing.return = returnFiber;

                  return existing;
                }
              }
            }
          // We intentionally fallthrough here if enableBlocksAPI is not on.
          // eslint-disable-next-lined no-fallthrough
          default: {
            if (child.elementType === element.type) {
              deleteRemainingChildren(returnFiber, child.sibling);
              const existing = useFiber(child, element.props);
              existing.ref = coerceRef(returnFiber, child, element);
              existing.return = returnFiber;

              return existing;
            }
            break;
          }
        }
        // Didn't match.
        deleteRemainingChildren(returnFiber, child);
        break;
      } else {
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    if (element.type === REACT_FRAGMENT_TYPE) {
      const created = createFiberFromFragment(
        element.props.children,
        returnFiber.mode,
        lanes,
        element.key
      );
      created.return = returnFiber;
      return created;
    } else {
      // 得到一个新fiber， 对应elements上第一层， 下面层级的elements被赋值给 created.pendingProps上
      // 这样的结构: created.pendingProps.children = elements...
      const created = createFiberFromElement(element, returnFiber.mode, lanes);
      // ref 相关， 暂时跳过
      created.ref = coerceRef(returnFiber, currentFirstChild, element);
      created.return = returnFiber;
      return created;
    }
  }

  // children and the parent.
  function reconcileChildFibers(
    returnFiber,
    currentFirstChild,
    newChild,
    lanes
  ) {
    // This function is not recursive.
    // If the top level item is an array, we treat it as a set of children,
    // not as a fragment. Nested arrays on the other hand will be treated as
    // fragment nodes. Recursion happens at the normal flow.

    // Handle top level unkeyed fragments as if they were arrays.
    // This leads to an ambiguity between <>{[...]}</> and <>...</>.
    // We treat the ambiguous cases above the same.
    // 判断是否顶层的fregment元素的
    const isUnkeyedTopLevelFragment =
      typeof newChild === "object" &&
      newChild !== null &&
      newChild.type === REACT_FRAGMENT_TYPE &&
      newChild.key === null;
    if (isUnkeyedTopLevelFragment) {
      newChild = newChild.props.children;
    }

    // Handle object types
    const isObject = typeof newChild === "object" && newChild !== null;

    if (isObject) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(
            reconcileSingleElement(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes
            )
          );
        case REACT_PORTAL_TYPE:
          return placeSingleChild(
            reconcileSinglePortal(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes
            )
          );
        case REACT_LAZY_TYPE:
          if (enableLazyElements) {
            const payload = newChild._payload;
            const init = newChild._init;
            // TODO: This function is supposed to be non-recursive.
            return reconcileChildFibers(
              returnFiber,
              currentFirstChild,
              init(payload),
              lanes
            );
          }
      }
    }

    if (typeof newChild === "string" || typeof newChild === "number") {
      return placeSingleChild(
        reconcileSingleTextNode(
          returnFiber,
          currentFirstChild,
          "" + newChild,
          lanes
        )
      );
    }

    if (isArray(newChild)) {
      return reconcileChildrenArray(
        returnFiber,
        currentFirstChild,
        newChild,
        lanes
      );
    }

    if (getIteratorFn(newChild)) {
      return reconcileChildrenIterator(
        returnFiber,
        currentFirstChild,
        newChild,
        lanes
      );
    }

    if (isObject) {
      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (typeof newChild === "undefined" && !isUnkeyedTopLevelFragment) {
      // If the new child is undefined, and the return fiber is a composite
      // component, throw an error. If Fiber return types are disabled,
      // we already threw above.
      switch (returnFiber.tag) {
        case ClassComponent: {
        }
        // Intentionally fall through to the next case, which handles both
        // functions and classes
        // eslint-disable-next-lined no-fallthrough
        case Block:
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
          invariant(
            false,
            "%s(...): Nothing was returned from render. This usually means a " +
              "return statement is missing. Or, to render nothing, " +
              "return null.",
            getComponentName(returnFiber.type) || "Component"
          );
        }
      }
    }

    // Remaining cases are all treated as empty.
    return deleteRemainingChildren(returnFiber, currentFirstChild);
  }

  return reconcileChildFibers;
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);
