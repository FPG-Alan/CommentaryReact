/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { enableIsInputPending } from "../SchedulerFeatureFlags";

export let requestHostCallback;
export let cancelHostCallback;
export let requestHostTimeout;
export let cancelHostTimeout;
export let shouldYieldToHost;
export let requestPaint;
export let getCurrentTime;
export let forceFrameRate;

const hasPerformanceNow =
  typeof performance === "object" && typeof performance.now === "function";

if (hasPerformanceNow) {
  const localPerformance = performance;
  getCurrentTime = () => localPerformance.now();
} else {
  const localDate = Date;
  const initialTime = localDate.now();
  getCurrentTime = () => localDate.now() - initialTime;
}

// Capture local references to native APIs, in case a polyfill overrides them.
const setTimeout = window.setTimeout;
const clearTimeout = window.clearTimeout;

if (typeof console !== "undefined") {
  // TODO: Scheduler no longer requires these methods to be polyfilled. But
  // maybe we want to continue warning if they don't exist, to preserve the
  // option to rely on it in the future?
  const requestAnimationFrame = window.requestAnimationFrame;
  const cancelAnimationFrame = window.cancelAnimationFrame;

  if (typeof requestAnimationFrame !== "function") {
    // Using console['error'] to evade Babel and ESLint
    console["error"](
      "This browser doesn't support requestAnimationFrame. " +
        "Make sure that you load a " +
        "polyfill in older browsers. https://reactjs.org/link/react-polyfills"
    );
  }
  if (typeof cancelAnimationFrame !== "function") {
    // Using console['error'] to evade Babel and ESLint
    console["error"](
      "This browser doesn't support cancelAnimationFrame. " +
        "Make sure that you load a " +
        "polyfill in older browsers. https://reactjs.org/link/react-polyfills"
    );
  }
}

let isMessageLoopRunning = false;
let scheduledHostCallback = null;
let taskTimeoutID = -1;

// Scheduler periodically yields in case there is other work on the main
// thread, like user events. By default, it yields multiple times per frame.
// It does not attempt to align with frame boundaries, since most tasks don't
// need to be frame aligned; for those that do, use requestAnimationFrame.
let yieldInterval = 5;
let deadline = 0;

// TODO: Make this configurable
// TODO: Adjust this based on priority?
const maxYieldInterval = 300;
let needsPaint = false;

if (
  enableIsInputPending &&
  navigator !== undefined &&
  navigator.scheduling !== undefined &&
  navigator.scheduling.isInputPending !== undefined
) {
  const scheduling = navigator.scheduling;
  /**
   * 什么时候交出执行权给浏览器呢?
   * 首先肯定要是当前时间超过了设定的截止时间了, 也就是当前时间片用完了
   * 此时, 如果有用户输入, 或者程序主动请求页面绘制, 那就交出执行权
   * 如果以上都没有, 那看看当前时间是不是超过500ms了
   * 这里有点意思, 实际上的效果应该是, 在页面加载进来的前500ms, 如果
   * 1. 没有主动要求渲染
   * 2. 没有用户输入
   *
   * 那么react可以独占这300ms, 一直执行...
   * 不过这只在一切刚开始的前300ms, 在正常运行中, 我们可以忽略这个, currentTime >= maxYieldInterval 可以约等于 true
   */
  shouldYieldToHost = function () {
    const currentTime = getCurrentTime();
    if (currentTime >= deadline) {
      // There's no time left. We may want to yield control of the main
      // thread, so the browser can perform high priority tasks. The main ones
      // are painting and user input. If there's a pending paint or a pending
      // input, then we should yield. But if there's neither, then we can
      // yield less often while remaining responsive. We'll eventually yield
      // regardless, since there could be a pending paint that wasn't
      // accompanied by a call to `requestPaint`, or other main thread tasks
      // like network events.
      if (needsPaint || scheduling.isInputPending()) {
        // There is either a pending paint or a pending input.
        return true;
      }
      // There's no pending input. Only yield if we've reached the max
      // yield interval.
      // 这里maxYieldInterval是写死的不会变的
      return currentTime >= maxYieldInterval;
    } else {
      // There's still time left in the frame.
      return false;
    }
  };

  requestPaint = function () {
    needsPaint = true;
  };
} else {
  // `isInputPending` is not available. Since we have no way of knowing if
  // there's pending input, always yield at the end of the frame.
  shouldYieldToHost = function () {
    return getCurrentTime() >= deadline;
  };

  // Since we yield every frame regardless, `requestPaint` has no effect.
  requestPaint = function () {};

  forceFrameRate = function (fps) {
    if (fps < 0 || fps > 125) {
      // Using console['error'] to evade Babel and ESLint
      console["error"](
        "forceFrameRate takes a positive int between 0 and 125, " +
          "forcing frame rates higher than 125 fps is not supported"
      );
      return;
    }
    if (fps > 0) {
      yieldInterval = Math.floor(1000 / fps);
    } else {
      // reset the framerate
      yieldInterval = 5;
    }
  };

  /**
   * (虚假的)执行器
   */
  const performWorkUntilDeadline = () => {
    if (scheduledHostCallback !== null) {
      const currentTime = getCurrentTime();
      // Yield after `yieldInterval` ms, regardless of where we are in the vsync
      // cycle. This means there's always time remaining at the beginning of
      // the message event.
      // 分片分片， 一片5ms
      deadline = currentTime + yieldInterval;
      const hasTimeRemaining = true;
      try {
        // 调用真正的执行器， 这里的 scheduledHostCallback 是 flushWork
        const hasMoreWork = scheduledHostCallback(
          hasTimeRemaining,
          currentTime
        );
        if (!hasMoreWork) {
          isMessageLoopRunning = false;
          scheduledHostCallback = null;
        } else {
          // If there's more work, schedule the next message event at the end
          // of the preceding one.
          // 这里之后就让出了主线程， 浏览器会开始执行绘制页面的工作
          // 下一帧内， performWorkUntilDeadline 作为 postMessage 接收的回调函数会继续执行
          port.postMessage(null);
        }
      } catch (error) {
        // If a scheduler task throws, exit the current browser task so the
        // error can be observed.
        port.postMessage(null);
        throw error;
      }
    } else {
      isMessageLoopRunning = false;
    }
    // Yielding to the browser will give it a chance to paint, so we can
    // reset this.
    needsPaint = false;
  };

  // 不用RIC是因为其调用时机不固定
  // 不用rAF是因为其调用时机不稳定...
  // 不用 setTimeout(, 0) 是因为递归调用setTimeout, 除了第一个之外， 后续的setTimeout会延迟5ms执行, 这5ms就被浪费了
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  requestHostCallback = function (callback) {
    // 这边暂存到全局变量， 因为真正调用callback的地方在messageChannel.port.onmessage回调
    scheduledHostCallback = callback;
    if (!isMessageLoopRunning) {
      isMessageLoopRunning = true;

      // 开启一个宏任务
      // 这个宏任务执行完之后， 浏览器就可以去绘制页面了
      port.postMessage(null);
    }
  };

  cancelHostCallback = function () {
    scheduledHostCallback = null;
  };

  requestHostTimeout = function (callback, ms) {
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };

  cancelHostTimeout = function () {
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
  };
}
