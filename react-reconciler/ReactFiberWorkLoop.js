import { NoLanes, SyncLane } from "./ReactFiberLane";
import { BlockingMode, ConcurrentMode } from "./ReactTypeOfMode";

export const NoContext = /*             */ 0b0000000;
const BatchedContext = /*               */ 0b0000001;
const EventContext = /*                 */ 0b0000010;
const DiscreteEventContext = /*         */ 0b0000100;
const LegacyUnbatchedContext = /*       */ 0b0001000;
const RenderContext = /*                */ 0b0010000;
const CommitContext = /*                */ 0b0100000;
export const RetryAfterError = /*       */ 0b1000000;

const RootIncomplete = 0;
const RootFatalErrored = 1;
const RootErrored = 2;
const RootSuspended = 3;
const RootSuspendedWithDelay = 4;
const RootCompleted = 5;

// Describes where we are in the React execution stack
let executionContext = NoContext;
// The root we're working on
let workInProgressRoot = null;
// The fiber we're working on
let workInProgress = null;
// The lanes we're rendering
let workInProgressRootRenderLanes = NoLanes;

// Lanes that were updated (in an interleaved event) during this render.
let workInProgressRootUpdatedLanes = NoLanes;

// The absolute time for when we should start giving up on rendering
// more and prefer CPU suspense heuristics instead.
let workInProgressRootRenderTargetTime = Infinity;
// How long a render is supposed to take before we start following CPU
// suspense heuristics and opt out of rendering more content.
const RENDER_TIMEOUT_MS = 500;
function resetRenderTimer() {
  workInProgressRootRenderTargetTime = window.performance.now();
  +RENDER_TIMEOUT_MS;
}

export function unbatchedUpdates(fn, a) {
  const prevExecutionContext = executionContext;
  executionContext &= ~BatchedContext;
  executionContext |= LegacyUnbatchedContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      resetRenderTimer();
      //   flushSyncCallbackQueue();
    }
  }
}

// export function requestUpdateLane(fiber) {
//   // Special cases
//   const mode = fiber.mode;
//   if ((mode & BlockingMode) === NoMode) {
//     return SyncLane;
//   } else if (
//     !deferRenderPhaseUpdateToNextBatch &&
//     (executionContext & RenderContext) !== NoContext &&
//     workInProgressRootRenderLanes !== NoLanes
//   ) {
//     // This is a render phase update. These are not officially supported. The
//     // old behavior is to give this the same "thread" (expiration time) as
//     // whatever is currently rendering. So if you call `setState` on a component
//     // that happens later in the same render, it will flush. Ideally, we want to
//     // remove the special case and treat them as if they came from an
//     // interleaved event. Regardless, this pattern is not officially supported.
//     // This behavior is only a fallback. The flag only exists until we can roll
//     // out the setState warning, since existing code might accidentally rely on
//     // the current behavior.
//     return pickArbitraryLane(workInProgressRootRenderLanes);
//   }

//   // The algorithm for assigning an update to a lane should be stable for all
//   // updates at the same priority within the same event. To do this, the inputs
//   // to the algorithm must be the same. For example, we use the `renderLanes`
//   // to avoid choosing a lane that is already in the middle of rendering.
//   //
//   // However, the "included" lanes could be mutated in between updates in the
//   // same event, like if you perform an update inside `flushSync`. Or any other
//   // code path that might call `prepareFreshStack`.
//   //
//   // The trick we use is to cache the first of each of these inputs within an
//   // event. Then reset the cached values once we can be sure the event is over.
//   // Our heuristic for that is whenever we enter a concurrent work loop.
//   //
//   // We'll do the same for `currentEventPendingLanes` below.
//   if (currentEventWipLanes === NoLanes) {
//     currentEventWipLanes = workInProgressRootIncludedLanes;
//   }

//   const isTransition = requestCurrentTransition() !== NoTransition;
//   if (isTransition) {
//     if (currentEventPendingLanes !== NoLanes) {
//       currentEventPendingLanes =
//         mostRecentlyUpdatedRoot !== null
//           ? mostRecentlyUpdatedRoot.pendingLanes
//           : NoLanes;
//     }
//     return findTransitionLane(currentEventWipLanes, currentEventPendingLanes);
//   }

//   // TODO: Remove this dependency on the Scheduler priority.
//   // To do that, we're replacing it with an update lane priority.
//   const schedulerPriority = getCurrentPriorityLevel();

//   // The old behavior was using the priority level of the Scheduler.
//   // This couples React to the Scheduler internals, so we're replacing it
//   // with the currentUpdateLanePriority above. As an example of how this
//   // could be problematic, if we're not inside `Scheduler.runWithPriority`,
//   // then we'll get the priority of the current running Scheduler task,
//   // which is probably not what we want.
//   let lane;
//   if (
//     // TODO: Temporary. We're removing the concept of discrete updates.
//     (executionContext & DiscreteEventContext) !== NoContext &&
//     schedulerPriority === UserBlockingSchedulerPriority
//   ) {
//     lane = findUpdateLane(InputDiscreteLanePriority, currentEventWipLanes);
//   } else {
//     const schedulerLanePriority =
//       schedulerPriorityToLanePriority(schedulerPriority);

//     if (decoupleUpdatePriorityFromScheduler) {
//       // In the new strategy, we will track the current update lane priority
//       // inside React and use that priority to select a lane for this update.
//       // For now, we're just logging when they're different so we can assess.
//       const currentUpdateLanePriority = getCurrentUpdateLanePriority();

//     lane = findUpdateLane(schedulerLanePriority, currentEventWipLanes);
//   }

//   return lane;
// }

/**
 * 1. 合并当前fiber.lanes字段以及从当前fiber向上查找直到host root fiber节点的childLanes字段
 * 2. 设置 fiber root 字段的pendingLanes，suspendedLanes，pingedLanes字段 和 eventTimes 数组
 * 3. 调用 performSyncWorkOnRoot
 */
export function scheduleUpdateOnFiber(fiber, lane, eventTime) {
  // 有点检测堆栈溢出那个意思
  // 检测当前全局变量 nestedUpdateCount 是否超过了 NESTED_UPDATE_LIMIT = 50， 超过了的话就报个错
  // checkForNestedUpdates();

  // 三件事
  // 1. 合并当前lane和fiber.lane
  // 2. 从当前fiber开始向上查找， 合并每一个节点与其alternate节点（如果存在）的childLanes
  // 2. 返回root, Fiber Root Node
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);
  // root不应该为none
  if (root === null) {
    // 如果fiber root node为null， 考虑这个节点没有渲染的情况
    // warnAboutUpdateOnUnmountedFiberInDEV(fiber);
    return null;
  }

  // Mark that the root has a pending update.
  // 设置Fiber Root Node上的 pendingLanes， suspendedLanes， pingedLanes字段
  // 设置Fiber Root Node上的 eventTimes 数组中当前lane对应的eventTime.
  markRootUpdated(root, lane, eventTime);

  // 初次渲染时， 没有workInProgressRoot
  // 至于更新时后面再说啦
  if (root === workInProgressRoot) {
    // Received an update to a tree that's in the middle of rendering. Mark
    // that there was an interleaved update work on this root. Unless the
    // `deferRenderPhaseUpdateToNextBatch` flag is off and this is a render
    // phase update. In that case, we don't treat render phase updates as if
    // they were interleaved, for backwards compat reasons.
    if (
      deferRenderPhaseUpdateToNextBatch ||
      (executionContext & RenderContext) === NoContext
    ) {
      workInProgressRootUpdatedLanes = mergeLanes(
        workInProgressRootUpdatedLanes,
        lane
      );
    }
    if (workInProgressRootExitStatus === RootSuspendedWithDelay) {
      // The root already suspended with a delay, which means this render
      // definitely won't finish. Since we have a new update, let's mark it as
      // suspended now, right before marking the incoming update. This has the
      // effect of interrupting the current render and switching to the update.
      // TODO: Make sure this doesn't override pings that happen while we've
      // already started rendering.
      markRootSuspended(root, workInProgressRootRenderLanes);
    }
  }

  // TODO: requestUpdateLanePriority also reads the priority. Pass the
  // priority as an argument to that function and this one.

  // 这里挺奇怪的， getCurrentPriorityLevel事实上调用了独立库 scheduler.unstable_getCurrentPriorityLevel
  // 拿到的是scheduler的一个全局变量 currentPriorityLevel， 而这个变量的值是几个枚举之一， 分别为：
  // ImmediatePriority = 1， UserBlockingPriority = 2， NormalPriority = 3， LowPriority = 4， IdlePriority = 5
  // 到了 getCurrentPriorityLevel 函数体内， 又通过一个switch把这些枚举映射成了同名枚举：
  // ImmediatePriority = 99， UserBlockingPriority = 98， NormalPriority = 97， LowPriority = 96， IdlePriority = 95
  // 就。。。。。。换了个值？ 啥意义呢？

  // 不管上面的疑问， 这里在初次渲染时为 NormalPriority = 97
  const priorityLevel = getCurrentPriorityLevel();

  // 初次渲染， lane === SyncLane
  if (lane === SyncLane) {
    // 初次渲染， executionContext = 8， 也就是 LegacyUnbatchedContext
    if (
      // Check if we're inside unbatchedUpdates
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // Check if we're not already rendering
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // Register pending interactions on the root to avoid losing traced interaction data.
      // 跟踪需要同步执行的updates，并计数、检测它们是否会报错
      schedulePendingInteractions(root, lane);

      // This is a legacy edge case. The initial mount of a ReactDOM.render-ed
      // root inside of batchedUpdates should be synchronous, but layout updates
      // should be deferred until the end of the batch.

      // 准备进入render阶段??
      performSyncWorkOnRoot(root);
    } else {
      ensureRootIsScheduled(root, eventTime);
      schedulePendingInteractions(root, lane);
      if (executionContext === NoContext) {
        // Flush the synchronous work now, unless we're already working or inside
        // a batch. This is intentionally inside scheduleUpdateOnFiber instead of
        // scheduleCallbackForFiber to preserve the ability to schedule a callback
        // without immediately flushing it. We only do this for user-initiated
        // updates, to preserve historical behavior of legacy mode.
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    }
  } else {
    // Schedule a discrete update but only if it's not Sync.
    if (
      (executionContext & DiscreteEventContext) !== NoContext &&
      // Only updates at user-blocking priority or greater are considered
      // discrete, even inside a discrete event.
      (priorityLevel === UserBlockingSchedulerPriority ||
        priorityLevel === ImmediateSchedulerPriority)
    ) {
      // This is the result of a discrete event. Track the lowest priority
      // discrete update per root so we can flush them early, if needed.
      if (rootsWithPendingDiscreteUpdates === null) {
        rootsWithPendingDiscreteUpdates = new Set([root]);
      } else {
        rootsWithPendingDiscreteUpdates.add(root);
      }
    }
    // Schedule other updates after in case the callback is sync.
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, lane);
  }

  // We use this when assigning a lane for a transition inside
  // `requestUpdateLane`. We assume it's the same as the root being updated,
  // since in the common case of a single root app it probably is. If it's not
  // the same root, then it's not a huge deal, we just might batch more stuff
  // together more than necessary.
  mostRecentlyUpdatedRoot = root;
}

// This is split into a separate function so we can mark a fiber with pending
// work without treating it as a typical update that originates from an event;
// e.g. retrying a Suspense boundary isn't an update, but it does schedule work
// on a fiber.
function markUpdateLaneFromFiberToRoot(sourceFiber, lane) {
  // Update the source fiber's lanes
  // 嗯哼， 按位或， (就是把传进来的跑道赋值给当前fiber的lanes字段)并不是
  // 这个merge应该理解成合并跑道， 合并后并没有丢失之前的lane信息
  // 初次渲染时， 这里的sourceFiber就是host rootFiber, 原始的lanes是NoLanes(0) 新的lane是SyncLane(1);
  sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane);

  // 这里第一次看到了"双fiber树"的一角
  // 那初次渲染的时候， 肯定没有另外一颗树(我们在初次渲染的此时此刻甚至都没有第一棵树呢， 就光秃秃的一个host root fiber)
  let alternate = sourceFiber.alternate;
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }

  // Walk the parent path to the root and update the child expiration time.
  let node = sourceFiber;
  // 第一次渲染时， sourceFiber是 host root fiber, 这个fiber没有return
  // host root fiber的stateNode是fiber root node， fiber root node的current是 host root fiber
  let parent = sourceFiber.return;

  // 第一次渲染时， 跳过这个循环（没有父级）
  // 若存在parent（fiber.return）
  while (parent !== null) {
    // 更新childLanes, 这个值应该就是当前fiber， 或者说parent.child的lanes
    parent.childLanes = mergeLanes(parent.childLanes, lane);
    // 同样更新双子树的对应节点
    alternate = parent.alternate;
    if (alternate !== null) {
      alternate.childLanes = mergeLanes(alternate.childLanes, lane);
    }
    node = parent;
    // 向上查找
    parent = parent.return;
  }

  // 初次渲染时， node.tag === HostRoot
  // 其他情况下， node.tag也应该是HostRoot(经过上面的while循环)
  if (node.tag === HostRoot) {
    const root = node.stateNode;
    return root;
  } else {
    return null;
  }
}
