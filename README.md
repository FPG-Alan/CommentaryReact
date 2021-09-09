# CommentaryReact

React Source Code with comments, for source code study

# 执行流程大纲（同步版本）

1. ReactDOMLegacy, render->legacyRenderSubtreeIntoContainer,

   主要是生成 fiber root 和 host root fiber, 初始化 host root fiber 的更新队列 updateQueue

   ```
   fiber_root.current = host_root_fiber;
   host_root_fiber.stateNode = fiber_root;
   host_root_fiber.updateQueue = {
       baseState: fiber.memoizedState,
       firstBaseUpdate: null,
       lastBaseUpdate: null,
       shared: {
           pending: null,
       },
       effects: null,
   };
   ```

   最后调用 updateContainer

2. ReactFiberReconciler, updateContainer

   lanes, concurrent 模式这些先略过的话, 这里主要是创建了 update 对象, 并压入 host_root_fiber 的 updateQueue 字段

   ```
   update =  {
       eventTime
       lane
       tag： UpdateState， // UpdateState = 0， ReplaceState = 1， ForceUpdate = 2， CaptureUpdate = 3
       payload: { elements }, // jsx, 也是ReactDOM.render函数的第一个参数
       callback: null,
       next: null
   }


   // 这里还需要强调 updateQueue 的循环链表模式
   update.next = update;
   host_root_fiber.updateQueue.shared.pending = update;
   ```

3. ReactFiberWorkLoop, scheduleUpdateOnFiber

   render 阶段的起点， 主要都是对 lanes 的操作， 这里我暂时不想详细去理解

4. ReactFiberWorkLoop, performSyncWorkOnRoot -> renderRootSync

   render 阶段主要执行函数, 包括

   1. 建立 WIP 根节点
   2. 深度优先循环整个 fiber 树
