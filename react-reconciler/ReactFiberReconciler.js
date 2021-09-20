import { getPublicInstance } from "../react-dom/ReactDOMHostConfig";
import { createFiberRoot } from "./ReactFiberRoot";
import { scheduleUpdateOnFiber } from "./ReactFiberWorkLoop";
import { createUpdate, enqueueUpdate } from "./ReactUpdateQueue";
import { HostComponent } from "./ReactWokTags";

export function createContainer(containerInfo, tag) {
  return createFiberRoot(containerInfo, tag);
}

/**
 * 1. 获得 eventTime
 * 2. 获得 update lane
 * 3. 创建 update 对象
 * 4. update 对象进入fiber.updateQueue.pending
 * 5. 调用 scheduleUpdateOnFiber, 开始调度更新
 */
export function updateContainer(element, container, parentComponent, callback) {
  // 这里的current应该是HostFiberRoot
  const current = container.current;
  // 首次渲染的话， 这里应该是now();
  // now()函数来自于独立库 scheduler, 最终调用的情况是

  // 若window.performance存在， 则返回 window.performance.now();
  // 这个API返回的是从"time origin" 到当前的时间, 精度比Date.now()更高, 可以到微秒级。
  // 而"time origin"即当前document生命周期的起始时间, 这个时间具体的计算方法参考[DOMHighResTimeStamp](https://developer.mozilla.org/en-US/docs/Web/API/DOMHighResTimeStamp#the_time_origin)

  // 若window.performance不存在， 则返回 Date.now() - initialTime, 其中initialTime为scheduler库初始化时获取的Date.now()

  //   const eventTime = requestEventTime();
  const eventTime = window.performance.now();

  // 初次渲染, 在SyncLane
  // 现在还不懂Lane, 这个SyncLane数值为1， 也许就意味着
  // 1. 在最内圈？(按照跑道模型理解)
  // 2. 只有一个？（按照道路分道模型理解）
  const lane = requestUpdateLane(current);

  // context相关， 暂时没看
  // 但初次渲染为 emptyContext = {}
  // const context = getContextForSubtree(parentComponent);
  // if (container.context === null) {
  //   container.context = context;
  // } else {
  //   container.pendingContext = context;
  // }

  /**
   * 创建一个update对象：
   * {
   *    eventTime
   *    lane
   *    tag： UpdateState， // UpdateState = 0， ReplaceState = 1， ForceUpdate = 2， CaptureUpdate = 3
   *    payload: null,
   *    callback: null,
   *    next: null
   * }
   *
   */
  const update = createUpdate(eventTime, lane);
  // Caution: React DevTools currently depends on this property
  // being called "element".
  // 这里的element就是children, jsx
  update.payload = { element };

  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    update.callback = callback;
  }

  // 排队排队
  // 把update对象放到current（目前的current是host rootFiber）的updateQueue.shared.pedning上
  // 并 **update对象的next指向自身**， 形成一个循环链表
  // 循环链表似乎可以一个指针就拿到链表开头和结尾...还不是很清楚
  enqueueUpdate(current, update);

  // 来了来了， 奔向未来
  // 调度（current这个）fiber上的更新， 跑道(疑)跟之前拿的时间一起传过去
  scheduleUpdateOnFiber(current, lane, eventTime);

  return lane;
}

export function getPublicRootInstance(fiberRoot) {
  const containerFiber = fiberRoot.current;
  if (!containerFiber.child) {
    return null;
  }
  switch (containerFiber.child.tag) {
    case HostComponent:
      return getPublicInstance(containerFiber.child.stateNode);
    default:
      return containerFiber.child.stateNode;
  }
}
