import {
  noTimeout,
  prepareForCommit,
  resetAfterCommit,
} from "../react-dom/ReactDOMHostConfig";
import { createWorkInProgress } from "./ReactFiber";
import { beginWork } from "./ReactFiberBeginWork";
import { completeWork } from "./ReactFiberCompleteWork";
import { Incomplete, PerformedWork, Update } from "./ReactFiberFlags";
import { getNextLanes, mergeLanes, NoLanes, SyncLane } from "./ReactFiberLane";
import { BlockingMode, ConcurrentMode, NoMode } from "./ReactTypeOfMode";
import { LegacyHiddenComponent, OffscreenComponent } from "./ReactWokTags";

import {
  scheduleCallback,
  cancelCallback,
  getCurrentPriorityLevel,
  runWithPriority,
  shouldYield,
  requestPaint,
  now,
  NoPriority as NoSchedulerPriority,
  ImmediatePriority as ImmediateSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  flushSyncCallbackQueue,
  scheduleSyncCallback,
} from "./SchedulerWithReactIntegration";

import {
  commitBeforeMutationLifeCycles as commitBeforeMutationEffectOnFiber,
  commitLifeCycles as commitLayoutEffectOnFiber,
} from "./ReactFiberCommitWork";

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

let pendingPassiveEffectsRenderPriority = NoPriority; // 90

// A fatal error, if one is thrown
let workInProgressRootFatalError = null;
// Whether to root completed, errored, suspended, etc.
let workInProgressRootExitStatus = RootIncomplete;

// "Included" lanes refer to lanes that were worked on during this render. It's
// slightly different than `renderLanes` because `renderLanes` can change as you
// enter and exit an Offscreen tree. This value is the combination of all render
// lanes for the entire render phase.
let workInProgressRootIncludedLanes = NoLanes;

// The work left over by components that were visited during this render. Only
// includes unprocessed updates, not work in bailed out children.
let workInProgressRootSkippedLanes = NoLanes;
// Lanes that were updated (in an interleaved event) during this render.
let workInProgressRootUpdatedLanes = NoLanes;
// Lanes that were pinged (in an interleaved event) during this render.
let workInProgressRootPingedLanes = NoLanes;

// Stack that allows components to change the render lanes for its subtree
// This is a superset of the lanes we started working on at the root. The only
// case where it's different from `workInProgressRootRenderLanes` is when we
// enter a subtree that is hidden and needs to be unhidden: Suspense and
// Offscreen component.
//
// Most things in the work loop should deal with workInProgressRootRenderLanes.
// Most things in begin/complete phases should deal with subtreeRenderLanes.
let subtreeRenderLanes = NoLanes;

// Fiber | null
let nextEffect = null;

let rootDoesHavePassiveEffects = false;
// FiberRoot | null
let rootWithPendingPassiveEffects = null;
let pendingPassiveEffectsRenderPriority = NoSchedulerPriority;
let pendingPassiveEffectsLanes = NoLanes;
let pendingPassiveHookEffectsMount = [];
let pendingPassiveHookEffectsUnmount = [];
let pendingPassiveProfilerEffects = [];
// Set<FiberRoot> | null
let rootsWithPendingDiscreteUpdates = null;

// null | Fiber
let focusedInstanceHandle = null;
let shouldFireAfterActiveInstanceBlur = false;

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
      // concurrent mode 相关
      flushSyncCallbackQueue();
    }
  }
}

export function requestEventTime() {
  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    // We're inside React, so it's fine to read the actual time.
    return window.performance.now();
  }
  // We're not inside React, so we may be in the middle of a browser event.
  if (currentEventTime !== NoTimestamp) {
    // Use the same start time for all updates until we enter React again.
    return currentEventTime;
  }
  // This is the first update since React yielded. Compute a new start time.
  currentEventTime = window.performance.now;
  return currentEventTime;
}

export function requestUpdateLane(fiber) {
  // Special cases
  const mode = fiber.mode;
  // legacy 模式下， mode 为 NoMode = 0b00000
  // NoMode和任何其他模式按位与的结果都应为NoMode
  if ((mode & BlockingMode) === NoMode) {
    return SyncLane;
  } else if (
    !deferRenderPhaseUpdateToNextBatch &&
    (executionContext & RenderContext) !== NoContext &&
    workInProgressRootRenderLanes !== NoLanes
  ) {
    // This is a render phase update. These are not officially supported. The
    // old behavior is to give this the same "thread" (expiration time) as
    // whatever is currently rendering. So if you call `setState` on a component
    // that happens later in the same render, it will flush. Ideally, we want to
    // remove the special case and treat them as if they came from an
    // interleaved event. Regardless, this pattern is not officially supported.
    // This behavior is only a fallback. The flag only exists until we can roll
    // out the setState warning, since existing code might accidentally rely on
    // the current behavior.
    return pickArbitraryLane(workInProgressRootRenderLanes);
  }

  // The algorithm for assigning an update to a lane should be stable for all
  // updates at the same priority within the same event. To do this, the inputs
  // to the algorithm must be the same. For example, we use the `renderLanes`
  // to avoid choosing a lane that is already in the middle of rendering.
  //
  // However, the "included" lanes could be mutated in between updates in the
  // same event, like if you perform an update inside `flushSync`. Or any other
  // code path that might call `prepareFreshStack`.
  //
  // The trick we use is to cache the first of each of these inputs within an
  // event. Then reset the cached values once we can be sure the event is over.
  // Our heuristic for that is whenever we enter a concurrent work loop.
  //
  // We'll do the same for `currentEventPendingLanes` below.
  if (currentEventWipLanes === NoLanes) {
    currentEventWipLanes = workInProgressRootIncludedLanes;
  }

  const isTransition = requestCurrentTransition() !== NoTransition;
  if (isTransition) {
    if (currentEventPendingLanes !== NoLanes) {
      currentEventPendingLanes =
        mostRecentlyUpdatedRoot !== null
          ? mostRecentlyUpdatedRoot.pendingLanes
          : NoLanes;
    }
    return findTransitionLane(currentEventWipLanes, currentEventPendingLanes);
  }

  // TODO: Remove this dependency on the Scheduler priority.
  // To do that, we're replacing it with an update lane priority.
  const schedulerPriority = getCurrentPriorityLevel();

  // The old behavior was using the priority level of the Scheduler.
  // This couples React to the Scheduler internals, so we're replacing it
  // with the currentUpdateLanePriority above. As an example of how this
  // could be problematic, if we're not inside `Scheduler.runWithPriority`,
  // then we'll get the priority of the current running Scheduler task,
  // which is probably not what we want.
  let lane;
  if (
    // TODO: Temporary. We're removing the concept of discrete updates.
    (executionContext & DiscreteEventContext) !== NoContext &&
    schedulerPriority === UserBlockingSchedulerPriority
  ) {
    lane = findUpdateLane(InputDiscreteLanePriority, currentEventWipLanes);
  } else {
    const schedulerLanePriority =
      schedulerPriorityToLanePriority(schedulerPriority);

    if (decoupleUpdatePriorityFromScheduler) {
      // In the new strategy, we will track the current update lane priority
      // inside React and use that priority to select a lane for this update.
      // For now, we're just logging when they're different so we can assess.
      const currentUpdateLanePriority = getCurrentUpdateLanePriority();

      lane = findUpdateLane(schedulerLanePriority, currentEventWipLanes);
    }
  }

  return lane;
}

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
      // 应该是dev tools用的东西， 跳过
      // schedulePendingInteractions(root, lane);

      // This is a legacy edge case. The initial mount of a ReactDOM.render-ed
      // root inside of batchedUpdates should be synchronous, but layout updates
      // should be deferred until the end of the batch.

      // 准备进入render阶段
      performSyncWorkOnRoot(root);
    } else {
      ensureRootIsScheduled(root, eventTime);
      // schedulePendingInteractions(root, lane);
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
    // schedulePendingInteractions(root, lane);
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

export function markSkippedUpdateLanes(lane) {
  workInProgressRootSkippedLanes = mergeLanes(
    lane,
    workInProgressRootSkippedLanes
  );
}

// This is the entry point for synchronous tasks that don't go
// through Scheduler
// 这里的root是fiber root
function performSyncWorkOnRoot(root) {
  // 初次渲染时，什么都不做
  flushPassiveEffects();

  let lanes;
  let exitStatus;
  // 初次渲染时， workInProgressRoot为null, 跳过
  if (
    root === workInProgressRoot &&
    includesSomeLane(root.expiredLanes, workInProgressRootRenderLanes)
  ) {
    // There's a partial tree, and at least one of its lanes has expired. Finish
    // rendering it before rendering the rest of the expired work.
    lanes = workInProgressRootRenderLanes;
    exitStatus = renderRootSync(root, lanes);
    if (
      includesSomeLane(
        workInProgressRootIncludedLanes,
        workInProgressRootUpdatedLanes
      )
    ) {
      // The render included lanes that were updated during the render phase.
      // For example, when unhiding a hidden tree, we include all the lanes
      // that were previously skipped when the tree was hidden. That set of
      // lanes is a superset of the lanes we started rendering with.
      //
      // Note that this only happens when part of the tree is rendered
      // concurrently. If the whole tree is rendered synchronously, then there
      // are no interleaved events.
      lanes = getNextLanes(root, lanes);
      exitStatus = renderRootSync(root, lanes);
    }
  } else {
    // 根据当前的lanes得到下一个lane， 这个函数主要是要找到当前优先级最高的那个lane
    // 初次渲染时当前lane为SyncLane, nextLanes也是SyncLane
    lanes = getNextLanes(root, NoLanes);
    exitStatus = renderRootSync(root, lanes);
  }

  // render 阶段后的错误处理
  if (root.tag !== LegacyRoot && exitStatus === RootErrored) {
    executionContext |= RetryAfterError;

    // If something threw an error, try rendering one more time. We'll render
    // synchronously to block concurrent data mutations, and we'll includes
    // all pending updates are included. If it still fails after the second
    // attempt, we'll give up and commit the resulting tree.
    lanes = getLanesToRetrySynchronouslyOnError(root);
    if (lanes !== NoLanes) {
      exitStatus = renderRootSync(root, lanes);
    }
  }

  // 正常退出应该是 RootCompleted = 5
  if (exitStatus === RootFatalErrored) {
    const fatalError = workInProgressRootFatalError;
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, lanes);
    ensureRootIsScheduled(root, now());
    throw fatalError;
  }

  // We now have a consistent tree. Because this is a sync render, we
  // will commit it even if something suspended.
  const finishedWork = root.current.alternate;
  root.finishedWork = finishedWork;
  root.finishedLanes = lanes;

  // 最后一步， 最后，他妈的， 一步
  // commit 阶段
  commitRoot(root);

  // Before exiting, make sure there's a callback scheduled for the next
  // pending level.
  ensureRootIsScheduled(root, now());

  return null;
}

function renderRootSync(root, lanes) {
  // 初次渲染时 executionContext 为 LegacyUnbatchedContext = 8
  // 这个值是在最开始， 调用updateContainer之前的那个函数里设置的
  const prevExecutionContext = executionContext;
  // RenderContext = 16， 因此在按位或运算之后， executionContext为24
  executionContext |= RenderContext;
  // 暂时不懂， 跳过不看
  const prevDispatcher = pushDispatcher();

  // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.
  // 第一次渲染时， workInProgressRoot 为null, workInProgressRootRenderLanes 为NoLanes = 0, 执行这个分支
  // 主要是生成workInProgress, 另外设置root上的一些属性
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    prepareFreshStack(root, lanes);

    // 暂时不懂
    startWorkOnPendingInteractions(root, lanes);
  }

  // 这里没懂， 感觉workLoopSync就执行一次啊， 用do...while循环干嘛？
  do {
    try {
      workLoopSync();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);

  // render阶段结束
  // 重置上下文相关的一些参数
  // ==================================================================
  resetContextDependencies();

  executionContext = prevExecutionContext;
  popDispatcher(prevDispatcher);

  if (workInProgress !== null) {
    // This is a sync render, so we should have finished the whole tree.
    invariant(
      false,
      "Cannot commit an incomplete root. This error is likely caused by a " +
        "bug in React. Please file an issue."
    );
  }
  // Set this to null to indicate there's no in-progress render.
  workInProgressRoot = null;
  workInProgressRootRenderLanes = NoLanes;

  return workInProgressRootExitStatus;
}

function workLoopSync() {
  // Already timed out, so perform work without checking if we need to yield.
  // sync lane, 也可以说是一个超时的任务， 所以这里就不去检查是不是应该暂停了
  // 下面的while循环就是一个同步任务
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork) {
  // The current, flushed, state of this fiber is the alternate. Ideally
  // nothing should rely on this, but relying on it here means that we don't
  // need an additional field on the work in progress.
  // 在第一次渲染的过程中， 每一次current都为null
  const current = unitOfWork.alternate;

  // next 应该是 unitOfWork.child
  let next = beginWork(current, unitOfWork, subtreeRenderLanes);

  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // If this doesn't spawn new work, complete the current work.

    // 没有 child 节点了, 深度优先搜索触底了
    // (completeUnitOfWork 还有可能产生新的工作)...
    completeUnitOfWork(unitOfWork);
  } else {
    // 循环， 第一次到达这里时， next应该是 host fiber root 的child, 事实上是我们的应用的根节点对应的fiber节点，
    // 对应学习的例子里， 这个fiber节点对应 <App>...</App>
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
}

// 因为是深度优先搜索, 首次渲染时, 第一个到达这里的 unitOfWork 应该是fiber最深层的节点
// 在我用于学习的例子里， 这个fiber节点是一个tag = HostText = 6 文本节点 ("count is: ")
function completeUnitOfWork(unitOfWork) {
  // Attempt to complete the current unit of work, then move to the next
  // sibling. If there are no more siblings, return to the parent fiber.
  // 完成当前节点的工作
  // 移动到sibling, 若sibling不存在则移动到当前节点的父级
  let completedWork = unitOfWork;
  do {
    // The current, flushed, state of this fiber is the alternate. Ideally
    // nothing should rely on this, but relying on it here means that we don't
    // need an additional field on the work in progress.
    // 如果是首次渲染， 这里的completedWork.alternate应该为null
    const current = completedWork.alternate;
    // 父级， 应该存在
    const returnFiber = completedWork.return;

    // Check if the work completed or if something threw.
    // 正常情况下应该是NoFlags = 0, 按位与后应该是NoFlags
    if ((completedWork.flags & Incomplete) === NoFlags) {
      let next;
      // 生成dom的， 并挂载到fiber.stateNode上
      // 对于tag = IndeterminateComponent / FunctionComponent / ClassComponent 之类的 “非宿主环境提供的组件”， 基本就是什么都不做
      next = completeWork(current, completedWork, subtreeRenderLanes);

      // 上面说completeUnitOfWork可能会产生新的工作就是这里了
      if (next !== null) {
        // Completing this fiber spawned new work. Work on that next.
        workInProgress = next;
        return;
      }

      // 重置fiber.childLanes, 具体为啥暂时不懂
      resetChildLanes(completedWork);

      if (
        returnFiber !== null &&
        // Do not append effects to parents if a sibling failed to complete
        // 判断父级是否在Incomplete状态(父级在这个状态说明有个兄弟节点没有完成)
        (returnFiber.flags & Incomplete) === NoFlags
      ) {
        // Append all the effects of the subtree and this fiber onto the effect
        // list of the parent. The completion order of the children affects the
        // side-effect order.
        // 在父级上append当前节点的副作用
        // 这是一个链表
        if (returnFiber.firstEffect === null) {
          returnFiber.firstEffect = completedWork.firstEffect;
        }
        if (completedWork.lastEffect !== null) {
          if (returnFiber.lastEffect !== null) {
            returnFiber.lastEffect.nextEffect = completedWork.firstEffect;
          }
          returnFiber.lastEffect = completedWork.lastEffect;
        }

        // If this fiber had side-effects, we append it AFTER the children's
        // side-effects. We can perform certain side-effects earlier if needed,
        // by doing multiple passes over the effect list. We don't want to
        // schedule our own side-effect on our own list because if end up
        // reusing children we'll schedule this effect onto itself since we're
        // at the end.
        const flags = completedWork.flags;

        // Skip both NoWork and PerformedWork tags when creating the effect
        // list. PerformedWork effect is read by React DevTools but shouldn't be
        // committed.
        // 如果当前fiber节点的flags不是NoFlags或PerformedWork， 代表这个节点需要在commit阶段做一些事情(暂时的理解， 副作用？)
        // 这里把这个节点加到父级的effect链表中
        if (flags > PerformedWork) {
          if (returnFiber.lastEffect !== null) {
            returnFiber.lastEffect.nextEffect = completedWork;
          } else {
            returnFiber.firstEffect = completedWork;
          }
          returnFiber.lastEffect = completedWork;
        }
      }
    } else {
      // 初次渲染时不会走这条分支
      // 暂时略过
      // This fiber did not complete because something threw. Pop values off
      // the stack without entering the complete phase. If this is a boundary,
      // capture values if possible.
      const next = unwindWork(completedWork, subtreeRenderLanes);

      // Because this fiber did not complete, don't reset its expiration time.

      if (next !== null) {
        // If completing this work spawned new work, do that next. We'll come
        // back here again.
        // Since we're restarting, remove anything that is not a host effect
        // from the effect tag.
        next.flags &= HostEffectMask;
        workInProgress = next;
        return;
      }

      if (returnFiber !== null) {
        // Mark the parent fiber as incomplete and clear its effect list.
        returnFiber.firstEffect = returnFiber.lastEffect = null;
        returnFiber.flags |= Incomplete;
      }
    }

    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // If there is more work to do in this returnFiber, do that next.
      workInProgress = siblingFiber;
      return;
    }
    // Otherwise, return to the parent
    completedWork = returnFiber;
    // Update the next thing we're working on in case something throws.
    // 这里没有return， 因此还在complete过程中
    workInProgress = completedWork;
  } while (completedWork !== null);

  // We've reached the root.
  // 所有节点的completeWork的完成(begin work 当然也完成了)
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootCompleted;
  }
}

function commitRoot(root) {
  const renderPriorityLevel = getCurrentPriorityLevel();
  // ImmediateSchedulerPriority
  // 等价于直接运行 commitRootImpl
  runWithPriority(
    ImmediateSchedulerPriority,
    commitRootImpl.bind(null, root, renderPriorityLevel)
  );
  return null;
}

function commitRootImpl(root, renderPriorityLevel) {
  // 暂时不清楚具体什么作用
  // 反正初次 commit 时 rootWithPendingPassiveEffects === null, 跳过这个循环
  do {
    // `flushPassiveEffects` will call `flushSyncUpdateQueue` at the end, which
    // means `flushPassiveEffects` will sometimes result in additional
    // passive effects. So we need to keep flushing in a loop until there are
    // no more pending effects.
    // TODO: Might be better if `flushPassiveEffects` did not automatically
    // flush synchronous work at the end, to avoid factoring hazards like this.
    flushPassiveEffects();
  } while (rootWithPendingPassiveEffects !== null);

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    "Should not already be working."
  );

  const finishedWork = root.finishedWork;
  const lanes = root.finishedLanes;

  if (finishedWork === null) {
    return null;
  }
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  invariant(
    finishedWork !== root.current,
    "Cannot commit the same tree as before. This error is likely caused by " +
      "a bug in React. Please file an issue."
  );

  // commitRoot never returns a continuation; it always finishes synchronously.
  // So we can clear these now to allow a new callback to be scheduled.
  root.callbackNode = null;

  // Update the first and last pending times on this root. The new first
  // pending time is whatever is left on the root fiber.
  // 这边。。。暂时也不明白, lanes相关的东西主要没看到应用， 只有设置， 所以一头雾水。。。也正常。。。吧
  let remainingLanes = mergeLanes(finishedWork.lanes, finishedWork.childLanes);
  markRootFinished(root, remainingLanes);

  // Clear already finished discrete updates in case that a later call of
  // `flushDiscreteUpdates` starts a useless render pass which may cancels
  // a scheduled timeout.
  // 离散的更新？？
  if (rootsWithPendingDiscreteUpdates !== null) {
    if (
      !hasDiscreteLanes(remainingLanes) &&
      rootsWithPendingDiscreteUpdates.has(root)
    ) {
      rootsWithPendingDiscreteUpdates.delete(root);
    }
  }

  // workInProgressRoot 应该是在 renderRootSync 结束之前被重置为了 null
  if (root === workInProgressRoot) {
    // We can reset these now that they are finished.
    workInProgressRoot = null;
    workInProgress = null;
    workInProgressRootRenderLanes = NoLanes;
  } else {
    // This indicates that the last root we worked on is not the same one that
    // we're committing now. This most commonly happens when a suspended root
    // times out.
  }

  // Get the list of effects.
  let firstEffect;

  // finishedWork是Host Root Fiber, 在complete阶段， 其上的flags被设置成了 Snapshot = 256
  if (finishedWork.flags > PerformedWork) {
    // A fiber's effect list consists only of its children, not itself. So if
    // the root has an effect, we need to add it to the end of the list. The
    // resulting list is the set that would belong to the root's parent, if it
    // had one; that is, all the effects in the tree including the root.
    // lastEffect 应该是第一个Host Root Fiber的child节点， 在我学习的例子里就是App函数组件的fiber节点
    if (finishedWork.lastEffect !== null) {
      // 这里 finishedWork （Host Root Fiber）放到自己的 App fiber 的 nextEffect 上。。。。
      // 就是说无论怎么样， host root fiber都会是commitBeforeMutationEffects循环的最后一个effect
      finishedWork.lastEffect.nextEffect = finishedWork;
      firstEffect = finishedWork.firstEffect;
    } else {
      firstEffect = finishedWork;
    }
  } else {
    // There is no effect on the root.
    firstEffect = finishedWork.firstEffect;
  }

  if (firstEffect !== null) {
    const prevExecutionContext = executionContext;

    // 执行上下文切换为 CommitContext
    executionContext |= CommitContext;

    // 不懂
    // const prevInteractions = pushInteractions(root);

    // Reset this to null before calling lifecycles
    ReactCurrentOwner.current = null;

    // The commit phase is broken into several sub-phases. We do a separate pass
    // of the effect list for each phase: all mutation effects come before all
    // layout effects, and so on.

    // The first phase a "before mutation" phase. We use this phase to read the
    // state of the host tree right before we mutate it. This is where
    // getSnapshotBeforeUpdate is called.
    // 没啥用， 忽略忽略
    focusedInstanceHandle = prepareForCommit(root.containerInfo);
    shouldFireAfterActiveInstanceBlur = false;

    nextEffect = firstEffect;
    do {
      try {
        commitBeforeMutationEffects();
      } catch (error) {
        invariant(nextEffect !== null, "Should be working on an effect.");
        captureCommitPhaseError(nextEffect, error);
        nextEffect = nextEffect.nextEffect;
      }
    } while (nextEffect !== null);

    // We no longer need to track the active instance fiber
    focusedInstanceHandle = null;

    if (enableProfilerTimer) {
      // Mark the current commit time to be shared by all Profilers in this
      // batch. This enables them to be grouped later.
      recordCommitTime();
    }

    // The next phase is the mutation phase, where we mutate the host tree.
    // host tree, react dom 做宿主的时候就是dom tree
    // nextEffect重新移动到第一个Effect, 换个姿势再来一次
    nextEffect = firstEffect;
    do {
      try {
        commitMutationEffects(root, renderPriorityLevel);
      } catch (error) {
        invariant(nextEffect !== null, "Should be working on an effect.");
        captureCommitPhaseError(nextEffect, error);
        nextEffect = nextEffect.nextEffect;
      }
    } while (nextEffect !== null);

    if (shouldFireAfterActiveInstanceBlur) {
      afterActiveInstanceBlur();
    }
    resetAfterCommit(root.containerInfo);

    // The work-in-progress tree is now the current tree. This must come after
    // the mutation phase, so that the previous tree is still current during
    // componentWillUnmount, but before the layout phase, so that the finished
    // work is current during componentDidMount/Update.
    // 切 换 fiber 树了！！！！！
    // 上面是解释为何切换fiber树只能在commit mutation 和 commit layout effects 之间
    // 大概的意思呢是为了
    // 1. componentWillUnmount 生命周期时， current还是旧的树
    // 2. componentDidMount/Update 时， current是新的树
    //
    // 嗯... componentWillUnmount 应该是在commit mutation期间， classComponent组件， flag = Deletion时调用的
    // componentDidMount/Update 则是在commit layout effect期间执行的
    // 所以就是这么回事， 不知道你懂不懂， 我是懂了
    root.current = finishedWork;

    // The next phase is the layout phase, where we call effects that read
    // the host tree after it's been mutated. The idiomatic use case for this is
    // layout, but class component lifecycles also fire here for legacy reasons.
    nextEffect = firstEffect;
    do {
      try {
        commitLayoutEffects(root, lanes);
      } catch (error) {
        invariant(nextEffect !== null, "Should be working on an effect.");
        captureCommitPhaseError(nextEffect, error);
        nextEffect = nextEffect.nextEffect;
      }
    } while (nextEffect !== null);

    nextEffect = null;

    // Tell Scheduler to yield at the end of the frame, so the browser has an
    // opportunity to paint.
    requestPaint();
    executionContext = prevExecutionContext;

    if (decoupleUpdatePriorityFromScheduler && previousLanePriority != null) {
      // Reset the priority to the previous non-sync value.
      setCurrentUpdateLanePriority(previousLanePriority);
    }
  } else {
    // No effects.
    root.current = finishedWork;
    // Measure these anyway so the flamegraph explicitly shows that there were
    // no effects.
    // TODO: Maybe there's a better way to report this.
  }

  const rootDidHavePassiveEffects = rootDoesHavePassiveEffects;

  if (rootDoesHavePassiveEffects) {
    // This commit has passive effects. Stash a reference to them. But don't
    // schedule a callback until after flushing layout work.
    rootDoesHavePassiveEffects = false;
    rootWithPendingPassiveEffects = root;
    pendingPassiveEffectsLanes = lanes;
    pendingPassiveEffectsRenderPriority = renderPriorityLevel;
  } else {
    // We are done with the effect chain at this point so let's clear the
    // nextEffect pointers to assist with GC. If we have passive effects, we'll
    // clear this in flushPassiveEffects.
    nextEffect = firstEffect;
    while (nextEffect !== null) {
      const nextNextEffect = nextEffect.nextEffect;
      nextEffect.nextEffect = null;
      if (nextEffect.flags & Deletion) {
        detachFiberAfterEffects(nextEffect);
      }
      nextEffect = nextNextEffect;
    }
  }

  // Read this again, since an effect might have updated it
  remainingLanes = root.pendingLanes;

  // Check if there's remaining work on this root
  if (remainingLanes !== NoLanes) {
    if (enableSchedulerTracing) {
      if (spawnedWorkDuringRender !== null) {
        const expirationTimes = spawnedWorkDuringRender;
        spawnedWorkDuringRender = null;
        for (let i = 0; i < expirationTimes.length; i++) {
          scheduleInteractions(
            root,
            expirationTimes[i],
            root.memoizedInteractions
          );
        }
      }
      schedulePendingInteractions(root, remainingLanes);
    }
  } else {
    // If there's no remaining work, we can clear the set of already failed
    // error boundaries.
    legacyErrorBoundariesThatAlreadyFailed = null;
  }

  if (enableSchedulerTracing) {
    if (!rootDidHavePassiveEffects) {
      // If there are no passive effects, then we can complete the pending interactions.
      // Otherwise, we'll wait until after the passive effects are flushed.
      // Wait to do this until after remaining work has been scheduled,
      // so that we don't prematurely signal complete for interactions when there's e.g. hidden work.
      finishPendingInteractions(root, lanes);
    }
  }

  if (remainingLanes === SyncLane) {
    // Count the number of times the root synchronously re-renders without
    // finishing. If there are too many, it indicates an infinite update loop.
    if (root === rootWithNestedUpdates) {
      nestedUpdateCount++;
    } else {
      nestedUpdateCount = 0;
      rootWithNestedUpdates = root;
    }
  } else {
    nestedUpdateCount = 0;
  }

  // Always call this before exiting `commitRoot`, to ensure that any
  // additional work on this root is scheduled.
  ensureRootIsScheduled(root, now());

  if (hasUncaughtError) {
    hasUncaughtError = false;
    const error = firstUncaughtError;
    firstUncaughtError = null;
    throw error;
  }

  if ((executionContext & LegacyUnbatchedContext) !== NoContext) {
    if (enableSchedulingProfiler) {
      markCommitStopped();
    }

    // This is a legacy edge case. We just committed the initial mount of
    // a ReactDOM.render-ed root inside of batchedUpdates. The commit fired
    // synchronously, but layout updates should be deferred until the end
    // of the batch.
    return null;
  }

  // If layout work was scheduled, flush it now.
  flushSyncCallbackQueue();

  if (enableSchedulingProfiler) {
    markCommitStopped();
  }

  return null;
}

/**
 * commit 第一阶段
 * 1. 对classComponent,  commitBeforeMutationEffectOnFiber 将调用 getSnapshotBeforeUpdate 生命周期函数
 * 2. 调度useEffect
 */
function commitBeforeMutationEffects() {
  while (nextEffect !== null) {
    const current = nextEffect.alternate;

    // 这一坨暂时不管
    if (!shouldFireAfterActiveInstanceBlur && focusedInstanceHandle !== null) {
      if ((nextEffect.flags & Deletion) !== NoFlags) {
        if (doesFiberContain(nextEffect, focusedInstanceHandle)) {
          shouldFireAfterActiveInstanceBlur = true;
          beforeActiveInstanceBlur();
        }
      } else {
        // TODO: Move this out of the hot path using a dedicated effect tag.
        if (
          nextEffect.tag === SuspenseComponent &&
          isSuspenseBoundaryBeingHidden(current, nextEffect) &&
          doesFiberContain(nextEffect, focusedInstanceHandle)
        ) {
          shouldFireAfterActiveInstanceBlur = true;
          beforeActiveInstanceBlur();
        }
      }
    }

    // 第一次循环的时候找的是 host root fiber.child, flags = Placement | PerformedWork = 3
    // 第二次循环时是 host root fiber, flags = NoFlags | Snapshot = 256
    // Placement | PerformedWork = 3
    const flags = nextEffect.flags;
    // 检测是否有 Snapshot flags
    if ((flags & Snapshot) !== NoFlags) {
      // 此时， nextEffect 就是 host root fiber， current 也存在
      // 对于 host root fiber, 这个函数就是清除了fiber root.container的文本信息(textContent)
      // 暂时不知道这样做是为了啥
      commitBeforeMutationEffectOnFiber(current, nextEffect);
    }

    // 检测是否存在 Passive flags
    // 这里的 Passive flag 跟 useEffect 相关
    if ((flags & Passive) !== NoFlags) {
      // If there are passive effects, schedule a callback to flush at
      // the earliest opportunity.
      if (!rootDoesHavePassiveEffects) {
        rootDoesHavePassiveEffects = true;

        // 那么这个就是异步调用的 useEffect
        scheduleCallback(NormalSchedulerPriority, () => {
          flushPassiveEffects();
          return null;
        });
      }
    }
    nextEffect = nextEffect.nextEffect;
  }
}
/**
 * commit 第二阶段
 * 1. 解绑ref
 * 2. 根据 fiber flags对dom进行操作(插入/更新/删除)
 * 3. 上一步 fiber flags == Update = 4 时会执行useLayoutEffect hook的销毁函数
 */
function commitMutationEffects(root, renderPriorityLevel) {
  // TODO: Should probably move the bulk of this function to commitWork.
  while (nextEffect !== null) {
    const flags = nextEffect.flags;

    if (flags & ContentReset) {
      commitResetTextContent(nextEffect);
    }

    if (flags & Ref) {
      const current = nextEffect.alternate;
      if (current !== null) {
        commitDetachRef(current);
      }
      if (enableScopeAPI) {
        // TODO: This is a temporary solution that allowed us to transition away
        // from React Flare on www.
        if (nextEffect.tag === ScopeComponent) {
          commitAttachRef(nextEffect);
        }
      }
    }

    // The following switch statement is only concerned about placement,
    // updates, and deletions. To avoid needing to add a case for every possible
    // bitmap value, we remove the secondary effects from the effect tag and
    // switch on that value.
    const primaryFlags = flags & (Placement | Update | Deletion);
    switch (primaryFlags) {
      case Placement: {
        commitPlacement(nextEffect);
        // Clear the "placement" from effect tag so that we know that this is
        // inserted, before any life-cycles like componentDidMount gets called.
        // TODO: findDOMNode doesn't rely on this any more but isMounted does
        // and isMounted is deprecated anyway so we should be able to kill this.
        nextEffect.flags &= ~Placement;
        break;
      }
      case PlacementAndUpdate: {
        // Placement
        commitPlacement(nextEffect);
        // Clear the "placement" from effect tag so that we know that this is
        // inserted, before any life-cycles like componentDidMount gets called.
        nextEffect.flags &= ~Placement;

        // Update
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }

      case Update: {
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }
      case Deletion: {
        commitDeletion(root, nextEffect, renderPriorityLevel);
        break;
      }
    }

    nextEffect = nextEffect.nextEffect;
  }
}

/**
 * commit 第三阶段, 此时dom操作已经做完了
 * 1. 赋值给ref
 * 2. 根据fiber.tag执行对应生命周期函数(componentDidMount / Update)或者useLayoutEffect回调
 */
function commitLayoutEffects(root, committedLanes) {
  // TODO: Should probably move the bulk of this function to commitWork.
  while (nextEffect !== null) {
    const flags = nextEffect.flags;

    if (flags & (Update | Callback)) {
      const current = nextEffect.alternate;
      // 根据fiber.tag调用commit阶段的生命周期函数
      // classCompnenet: componentDidMount / Update
      // functionComponenet: useLayoutEffect
      commitLayoutEffectOnFiber(root, current, nextEffect, committedLanes);
    }

    if (enableScopeAPI) {
      // TODO: This is a temporary solution that allowed us to transition away
      // from React Flare on www.
      if (flags & Ref && nextEffect.tag !== ScopeComponent) {
        commitAttachRef(nextEffect);
      }
    } else {
      if (flags & Ref) {
        commitAttachRef(nextEffect);
      }
    }
    nextEffect = nextEffect.nextEffect;
  }
}

function resetChildLanes(completedWork) {
  // 这一段暂时不看
  if (
    // TODO: Move this check out of the hot path by moving `resetChildLanes`
    // to switch statement in `completeWork`.
    (completedWork.tag === LegacyHiddenComponent ||
      completedWork.tag === OffscreenComponent) &&
    completedWork.memoizedState !== null &&
    !includesSomeLane(subtreeRenderLanes, OffscreenLane) &&
    (completedWork.mode & ConcurrentMode) !== NoLanes
  ) {
    // The children of this component are hidden. Don't bubble their
    // expiration times.
    return;
  }

  let newChildLanes = NoLanes;

  let child = completedWork.child;
  while (child !== null) {
    newChildLanes = mergeLanes(
      newChildLanes,
      mergeLanes(child.lanes, child.childLanes)
    );
    child = child.sibling;
  }

  completedWork.childLanes = newChildLanes;
}

export function flushPassiveEffects() {
  // Returns whether passive effects were flushed.
  // 如果进行中的xxx的优先级不是最低的（NoSchedulerPriority = NoPriority = 90）
  // 就sss
  if (pendingPassiveEffectsRenderPriority !== NoSchedulerPriority) {
    const priorityLevel =
      pendingPassiveEffectsRenderPriority > NormalSchedulerPriority
        ? NormalSchedulerPriority
        : pendingPassiveEffectsRenderPriority;
    pendingPassiveEffectsRenderPriority = NoSchedulerPriority;
    if (decoupleUpdatePriorityFromScheduler) {
      const previousLanePriority = getCurrentUpdateLanePriority();
      try {
        setCurrentUpdateLanePriority(
          schedulerPriorityToLanePriority(priorityLevel)
        );
        return runWithPriority(priorityLevel, flushPassiveEffectsImpl);
      } finally {
        setCurrentUpdateLanePriority(previousLanePriority);
      }
    } else {
      return runWithPriority(priorityLevel, flushPassiveEffectsImpl);
    }
  }

  // 初次渲染时， pendingPassiveEffectsRenderPriority为默认值， 90， 应该走这条分路
  return false;
}

export function enqueuePendingPassiveHookEffectMount(fiber, effect) {
  pendingPassiveHookEffectsMount.push(effect, fiber);
  if (!rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = true;
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

export function enqueuePendingPassiveHookEffectUnmount(fiber, effect) {
  pendingPassiveHookEffectsUnmount.push(effect, fiber);

  if (!rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = true;
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

function flushPassiveEffectsImpl() {
  if (rootWithPendingPassiveEffects === null) {
    return false;
  }

  const root = rootWithPendingPassiveEffects;
  const lanes = pendingPassiveEffectsLanes;
  rootWithPendingPassiveEffects = null;
  pendingPassiveEffectsLanes = NoLanes;

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    "Cannot flush passive effects while already rendering."
  );

  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  const prevInteractions = pushInteractions(root);

  // It's important that ALL pending passive effect destroy functions are called
  // before ANY passive effect create functions are called.
  // Otherwise effects in sibling components might interfere with each other.
  // e.g. a destroy function in one component may unintentionally override a ref
  // value set by a create function in another component.
  // Layout effects have the same constraint.

  // First pass: Destroy stale passive effects.
  const unmountEffects = pendingPassiveHookEffectsUnmount;
  pendingPassiveHookEffectsUnmount = [];
  for (let i = 0; i < unmountEffects.length; i += 2) {
    const effect = unmountEffects[i];
    const fiber = unmountEffects[i + 1];
    const destroy = effect.destroy;
    effect.destroy = undefined;

    if (typeof destroy === "function") {
      try {
        destroy();
      } catch (error) {
        invariant(fiber !== null, "Should be working on an effect.");
        captureCommitPhaseError(fiber, error);
      }
    }
  }
  // Second pass: Create new passive effects.
  const mountEffects = pendingPassiveHookEffectsMount;
  pendingPassiveHookEffectsMount = [];
  for (let i = 0; i < mountEffects.length; i += 2) {
    const effect = mountEffects[i];
    const fiber = mountEffects[i + 1];
    try {
      const create = effect.create;
      effect.destroy = create();
    } catch (error) {
      invariant(fiber !== null, "Should be working on an effect.");
      captureCommitPhaseError(fiber, error);
    }
  }

  // Note: This currently assumes there are no passive effects on the root fiber
  // because the root is not part of its own effect list.
  // This could change in the future.
  let effect = root.current.firstEffect;
  while (effect !== null) {
    const nextNextEffect = effect.nextEffect;
    // Remove nextEffect pointer to assist GC
    effect.nextEffect = null;
    if (effect.flags & Deletion) {
      detachFiberAfterEffects(effect);
    }
    effect = nextNextEffect;
  }

  executionContext = prevExecutionContext;

  flushSyncCallbackQueue();

  // If additional passive effects were scheduled, increment a counter. If this
  // exceeds the limit, we'll fire a warning.
  nestedPassiveUpdateCount =
    rootWithPendingPassiveEffects === null ? 0 : nestedPassiveUpdateCount + 1;

  return true;
}

// 设置root上的一些属性
// 设置该文件内的全局属性， 包括workInProgress等
function prepareFreshStack(root, lanes) {
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  const timeoutHandle = root.timeoutHandle;
  // 如果root上的timeoutHandler不是noTimeout, 说明这个root之前被挂起过，且调度了一个timeout来commit一个后备状态
  // 此时我们有了其他工作， 直接取消这个timeout
  // 此处没有理解
  if (timeoutHandle !== noTimeout) {
    // The root previous suspended and scheduled a timeout to commit a fallback
    // state. Now that we have additional work, cancel the timeout.
    root.timeoutHandle = noTimeout;
    // $FlowFixMe Complains noTimeout is not a TimeoutID, despite the check above
    window.clearTimeout(timeoutHandle);
  }

  // 如果当前有工作正在进行
  if (workInProgress !== null) {
    let interruptedWork = workInProgress.return;
    while (interruptedWork !== null) {
      // 循环fiber树， 对每个fiber节点， 处理被打断的工作
      // 处理细节暂时略过， 后面再看
      unwindInterruptedWork(interruptedWork);
      interruptedWork = interruptedWork.return;
    }
  }
  workInProgressRoot = root;
  // 创建wip fiber， 基本就是复制root.current
  workInProgress = createWorkInProgress(root.current, null);
  workInProgressRootRenderLanes =
    subtreeRenderLanes =
    workInProgressRootIncludedLanes =
      lanes;
  workInProgressRootExitStatus = RootIncomplete;
  workInProgressRootFatalError = null;
  workInProgressRootSkippedLanes = NoLanes;
  workInProgressRootUpdatedLanes = NoLanes;
  workInProgressRootPingedLanes = NoLanes;
}
