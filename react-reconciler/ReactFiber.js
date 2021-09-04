import { BlockingRoot, ConcurrentRoot } from "./ReactRootTags";
import { BlockingMode, ConcurrentMode, StrictMode } from "./ReactTypeOfMode";
import { HostRoot } from "./ReactWokTags";


// legacy模式下， tag为LegacyRoot = 0, 对应mode为NoMode = 0b00000
export function createHostRootFiber(tag) {
  let mode;
  if (tag === ConcurrentRoot) {
    mode = ConcurrentMode | BlockingMode | StrictMode;
  } else if (tag === BlockingRoot) {
    mode = BlockingMode | StrictMode;
  } else {
    mode = NoMode;
  }

  //   return createFiber(HostRoot, null, null, mode);
  return new FiberNode(HostRoot, null, null, mode);
}

function FiberNode(tag, pendingProps, key, mode) {
  // Instance
  this.tag = tag;
  this.key = key;
  this.elementType = null;
  this.type = null;
  this.stateNode = null;

  // Fiber
  this.return = null;
  this.child = null;
  this.sibling = null;
  this.index = 0;

  this.ref = null;

  this.pendingProps = pendingProps;
  this.memoizedProps = null;
  this.updateQueue = null;
  this.memoizedState = null;
  this.dependencies = null;

  this.mode = mode;

  // Effects
  this.flags = NoFlags;
  this.nextEffect = null;

  this.firstEffect = null;
  this.lastEffect = null;

  this.lanes = NoLanes;
  this.childLanes = NoLanes;

  this.alternate = null;
}
