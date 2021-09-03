const TotalLanes = 31;

export const NoLanePriority = 0;

export const NoLanes = /*                         */ 0b0000000000000000000000000000000;
export const NoLane = /*                          */ 0b0000000000000000000000000000000;
export const SyncLane = /*                        */ 0b0000000000000000000000000000001;
export const NoTimestamp = -1;

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
