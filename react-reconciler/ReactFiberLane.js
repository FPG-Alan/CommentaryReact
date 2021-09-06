export const SyncLanePriority = 15;
export const SyncBatchedLanePriority = 14;

const InputDiscreteHydrationLanePriority = 13;
export const InputDiscreteLanePriority = 12;

const InputContinuousHydrationLanePriority = 11;
export const InputContinuousLanePriority = 10;

const DefaultHydrationLanePriority = 9;
export const DefaultLanePriority = 8;

const TransitionHydrationPriority = 7;
export const TransitionPriority = 6;

const RetryLanePriority = 5;

const SelectiveHydrationLanePriority = 4;

const IdleHydrationLanePriority = 3;
const IdleLanePriority = 2;

const OffscreenLanePriority = 1;

export const NoLanePriority = 0;

const TotalLanes = 31;

export const NoLanePriority = 0;

export const NoLanes = /*                         */ 0b0000000000000000000000000000000;
export const NoLane = /*                          */ 0b0000000000000000000000000000000;
export const SyncLane = /*                        */ 0b0000000000000000000000000000001;
export const SyncBatchedLane = /*                 */ 0b0000000000000000000000000000010;

export const InputDiscreteHydrationLane = /*      */ 0b0000000000000000000000000000100;
const InputDiscreteLanes = /*                     */ 0b0000000000000000000000000011000;

const InputContinuousHydrationLane = /*           */ 0b0000000000000000000000000100000;
const InputContinuousLanes = /*                   */ 0b0000000000000000000000011000000;

export const DefaultHydrationLane = /*            */ 0b0000000000000000000000100000000;
export const DefaultLanes = /*                    */ 0b0000000000000000000111000000000;

const TransitionHydrationLane = /*                */ 0b0000000000000000001000000000000;
const TransitionLanes = /*                        */ 0b0000000001111111110000000000000;

const RetryLanes = /*                             */ 0b0000011110000000000000000000000;

export const SomeRetryLane = /*                   */ 0b0000010000000000000000000000000;

export const SelectiveHydrationLane = /*          */ 0b0000100000000000000000000000000;

const NonIdleLanes = /*                           */ 0b0000111111111111111111111111111;

export const IdleHydrationLane = /*               */ 0b0001000000000000000000000000000;
const IdleLanes = /*                              */ 0b0110000000000000000000000000000;

export const OffscreenLane = /*                   */ 0b1000000000000000000000000000000;
export const NoTimestamp = -1;

let currentUpdateLanePriority = NoLanePriority;
// "Registers" used to "return" multiple values
// Used by getHighestPriorityLanes and getNextLanes:
let return_highestLanePriority = DefaultLanePriority;
function getHighestPriorityLanes(lanes) {
  if ((SyncLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncLanePriority;
    return SyncLane;
  }
  if ((SyncBatchedLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncBatchedLanePriority;
    return SyncBatchedLane;
  }
  if ((InputDiscreteHydrationLane & lanes) !== NoLanes) {
    return_highestLanePriority = InputDiscreteHydrationLanePriority;
    return InputDiscreteHydrationLane;
  }
  const inputDiscreteLanes = InputDiscreteLanes & lanes;
  if (inputDiscreteLanes !== NoLanes) {
    return_highestLanePriority = InputDiscreteLanePriority;
    return inputDiscreteLanes;
  }
  if ((lanes & InputContinuousHydrationLane) !== NoLanes) {
    return_highestLanePriority = InputContinuousHydrationLanePriority;
    return InputContinuousHydrationLane;
  }
  const inputContinuousLanes = InputContinuousLanes & lanes;
  if (inputContinuousLanes !== NoLanes) {
    return_highestLanePriority = InputContinuousLanePriority;
    return inputContinuousLanes;
  }
  if ((lanes & DefaultHydrationLane) !== NoLanes) {
    return_highestLanePriority = DefaultHydrationLanePriority;
    return DefaultHydrationLane;
  }
  const defaultLanes = DefaultLanes & lanes;
  if (defaultLanes !== NoLanes) {
    return_highestLanePriority = DefaultLanePriority;
    return defaultLanes;
  }
  if ((lanes & TransitionHydrationLane) !== NoLanes) {
    return_highestLanePriority = TransitionHydrationPriority;
    return TransitionHydrationLane;
  }
  const transitionLanes = TransitionLanes & lanes;
  if (transitionLanes !== NoLanes) {
    return_highestLanePriority = TransitionPriority;
    return transitionLanes;
  }
  const retryLanes = RetryLanes & lanes;
  if (retryLanes !== NoLanes) {
    return_highestLanePriority = RetryLanePriority;
    return retryLanes;
  }
  if (lanes & SelectiveHydrationLane) {
    return_highestLanePriority = SelectiveHydrationLanePriority;
    return SelectiveHydrationLane;
  }
  if ((lanes & IdleHydrationLane) !== NoLanes) {
    return_highestLanePriority = IdleHydrationLanePriority;
    return IdleHydrationLane;
  }
  const idleLanes = IdleLanes & lanes;
  if (idleLanes !== NoLanes) {
    return_highestLanePriority = IdleLanePriority;
    return idleLanes;
  }
  if ((OffscreenLane & lanes) !== NoLanes) {
    return_highestLanePriority = OffscreenLanePriority;
    return OffscreenLane;
  }
  // This shouldn't be reachable, but as a fallback, return the entire bitmask.
  return_highestLanePriority = DefaultLanePriority;
  return lanes;
}

// 本质上， 这个函数就是将lanes上， 所以值为1的位中， 除了最高位， 其他都设为0
// 0b0000000001111111110000000000000 => 0b0000000001000000000000000000000
// 0b0000000000000000000111000000000 => 0b0000000000000000000100000000000
// ...
function getLowestPriorityLane(lanes) {
  // This finds the most significant non-zero bit.
  const index = 31 - Math.clz32(lanes);

  //
  return index < 0 ? NoLanes : 1 << index;
}

/**
 * (中文输入法会导致后面的二进制对不齐...)
 * 1. if lanes = SyncBatchedLane & SyncLanes, said                   0b0000000000000000000000000000011
 *  result of getLowestPriorityLane(lanes) is SyncBatchedLane, said  0b0000000000000000000000000000010
 *  << 1                                                             0b0000000000000000000000000000100
 *  - 1                                                              0b0000000000000000000000000000011
 *
 * 2. if lanes = SyncLanes, said                                     0b0000000000000000000000000000001
 *  result of getLowestPriorityLane(SyncLanes) is SyncLanes, said    0b0000000000000000000000000000001
 *  << 1                                                             0b0000000000000000000000000000010
 *  - 1                                                              0b0000000000000000000000000000001
 *
 * 3. if lanes = TransitionLanes, said
 * 0b0000000001111111110000000000000
 * 0b0000000001000000000000000000000
 * 0b0000000010000000000000000000000
 * 0b0000000001111111111111111111111
 *
 *
 * 所以这个函数本质上是先找到lanes中值为1的最高位， 这位设置为0， 其后所有位都设为1
 */
function getEqualOrHigherPriorityLanes(lanes) {
  return (getLowestPriorityLane(lanes) << 1) - 1;
}

export function createLaneMap(initial) {
  return new Array(TotalLanes).fill(initial);
}

export function mergeLanes(a, b) {
  return a | b;
}
function pickArbitraryLaneIndex(lanes) {
  return 31 - Math.clz32(lanes);
}

function laneToIndex(lane) {
  return pickArbitraryLaneIndex(lane);
}
export function includesSomeLane(a, b) {
  return (a & b) !== NoLanes;
}

export function markRootUpdated(root, updateLane, eventTime) {
  // 当前更新的lane， 与fiber root node.pendingLanes字段merge
  root.pendingLanes |= updateLane;

  // TODO: Theoretically, any update to any lane can unblock any other lane. But
  // it's not practical to try every single possible combination. We need a
  // heuristic to decide which lanes to attempt to render, and in which batches.
  // For now, we use the same heuristic as in the old ExpirationTimes model:
  // retry any lane at equal or lower priority, but don't try updates at higher
  // priority without also including the lower priority updates. This works well
  // when considering updates across different priority levels, but isn't
  // sufficient for updates within the same priority, since we want to treat
  // those updates as parallel.

  // Unsuspend any update at equal or lower priority.
  // 对于
  //   任何 [suspend] 的， [优先级比当前updateLane低或持平]的update
  // 这里会取消他们的暂停状态？
  const higherPriorityLanes = updateLane - 1; // Turns 0b1000 into 0b0111

  // 这里还是不懂， 关于lane的按位与， 按位或的逻辑运算
  // 太抽象了...
  root.suspendedLanes &= higherPriorityLanes;
  root.pingedLanes &= higherPriorityLanes;

  const eventTimes = root.eventTimes;
  const index = laneToIndex(updateLane);
  // We can always overwrite an existing timestamp because we prefer the most
  // recent event, and we assume time is monotonically increasing（单调递增）.
  eventTimes[index] = eventTime;
}

export function getNextLanes(root, wipLanes) {
  // 首次渲染时， 在本文件27行， 设置了root上的pendingLanes为1
  const pendingLanes = root.pendingLanes;
  // Early bailout if there's no pending work left.
  if (pendingLanes === NoLanes) {
    return_highestLanePriority = NoLanePriority;
    return NoLanes;
  }

  let nextLanes = NoLanes;
  let nextLanePriority = NoLanePriority;

  // 初次渲染时， 以下几个lanes均为0
  const expiredLanes = root.expiredLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;

  // Check if any work has expired.
  // 如果有过期的lane， 下一个lane即为这个过期的lane， 下一个lane优先级就是同步lane优先级 = 15
  // 初次渲染时不应该有过期lanes
  if (expiredLanes !== NoLanes) {
    nextLanes = expiredLanes;
    nextLanePriority = return_highestLanePriority = SyncLanePriority;
  } else {
    // Do not work on any idle work until all the non-idle work has finished,
    // even if the work is suspended.
    // 按位与运算取出所有正在进行中的， 且不在idle lanes上的lanes
    const nonIdlePendingLanes = pendingLanes & NonIdleLanes;
    if (nonIdlePendingLanes !== NoLanes) {
      // 如果存在工作
      // 跟按位取反的suspendedLanes按位与运算， 也就是从非idle任务中再过滤掉所有挂起的lanes
      const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;
      if (nonIdleUnblockedLanes !== NoLanes) {
        // 正如变量名所示的， 现在的lanes是所有的非idle， 非blocked的lanes了
        // getHighestPriorityLanes使用一系列if， 找到在这些lanes中， 优先级最高的lanes
        // SyncLane > SyncBatchedLane > InputDiscreteHydrationLane > inputDiscreteLanes > ... > idleLanes >  OffscreenLane

        // 初次渲染应该是这条分路
        nextLanes = getHighestPriorityLanes(nonIdleUnblockedLanes);
        nextLanePriority = return_highestLanePriority;
      } else {
        // 若所有的非idle lanes都是suspendedLanes
        const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes;
        if (nonIdlePingedLanes !== NoLanes) {
          // 再看这些lanes里面有没有pingedLanes
          // 如果有， 从这些lanes中找到最高优先级的lanes
          nextLanes = getHighestPriorityLanes(nonIdlePingedLanes);
          nextLanePriority = return_highestLanePriority;
        }
      }
    } else {
      // The only remaining work is Idle.
      // 如果只存在idle lanes
      // 和上面一样， 从这些lanes里面先选择所有的非suspended Lanes中优先级最高的，
      const unblockedLanes = pendingLanes & ~suspendedLanes;
      if (unblockedLanes !== NoLanes) {
        nextLanes = getHighestPriorityLanes(unblockedLanes);
        nextLanePriority = return_highestLanePriority;
      } else {
        // 这里有个小细节， 不再用pending lanes和pinged lanes做按位与了
        // 其实到了这个分支， 我们已经可以判定， 剩下的lanes 都是 pinged lanes, 所以无需再做一次位运算了
        if (pingedLanes !== NoLanes) {
          nextLanes = getHighestPriorityLanes(pingedLanes);
          nextLanePriority = return_highestLanePriority;
        }
      }
    }
  }

  // 只有在被挂起时才会出现这种状态
  if (nextLanes === NoLanes) {
    // This should only be reachable if we're suspended
    // TODO: Consider warning in this path if a fallback timer is not scheduled.
    return NoLanes;
  }

  // If there are higher priority lanes, we'll include them even if they
  // are suspended.
  // getEqualOrHigherPriorityLanes 先在nextLanes上找到优先级最低的lane， 然后左移1位再减1
  // 首次渲染时此处没有影响， 结果依然时 nextLanes = SyncLane
  // 换句话说， 没有比SyncLane优先级更高的lane了
  nextLanes = pendingLanes & getEqualOrHigherPriorityLanes(nextLanes);

  // If we're already in the middle of a render, switching lanes will interrupt
  // it and we'll lose our progress. We should only do this if the new lanes are
  // higher priority.
  // 初次渲染时， wipLanes应该是0， 因为此时还没有任何“work in progress”工作呀
  // 若不在初次渲染， 且wipLanes不是NoLanes, 这说明现在正在render阶段, 如果此时重新选择lanes会导致
  // 这个在进行的render工作被打断， 所以我们仅当新的工作优先级高于正在进行的工作时才重新选择lanes
  // 否则返回正在进行中的lanes
  if (
    wipLanes !== NoLanes &&
    wipLanes !== nextLanes &&
    // If we already suspended with a delay, then interrupting is fine. Don't
    // bother waiting until the root is complete.
    (wipLanes & suspendedLanes) === NoLanes
  ) {
    getHighestPriorityLanes(wipLanes);
    const wipLanePriority = return_highestLanePriority;
    // 在这里判断新工作的优先级是否高于正在进行中的工作的优先级
    if (nextLanePriority <= wipLanePriority) {
      return wipLanes;
    } else {
      return_highestLanePriority = nextLanePriority;
    }
  }

  // Check for entangled lanes and add them to the batch.
  //
  // A lane is said to be entangled with another when it's not allowed to render
  // in a batch that does not also include the other lane. Typically we do this
  // when multiple updates have the same source, and we only want to respond to
  // the most recent event from that source.
  //
  // Note that we apply entanglements *after* checking for partial work above.
  // This means that if a lane is entangled during an interleaved event while
  // it's already rendering, we won't interrupt it. This is intentional, since
  // entanglement is usually "best effort": we'll try our best to render the
  // lanes in the same batch, but it's not worth throwing out partially
  // completed work in order to do it.
  //
  // For those exceptions where entanglement is semantically important, like
  // useMutableSource, we should ensure that there is no partial work at the
  // time we apply the entanglement.
  // 这段暂时不懂， 跳过
  // 首次渲染时， entangledLanes为0
  const entangledLanes = root.entangledLanes;
  if (entangledLanes !== NoLanes) {
    const entanglements = root.entanglements;
    let lanes = nextLanes & entangledLanes;
    while (lanes > 0) {
      const index = pickArbitraryLaneIndex(lanes);
      const lane = 1 << index;

      nextLanes |= entanglements[index];

      lanes &= ~lane;
    }
  }

  return nextLanes;
}
