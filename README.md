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

5. reactFiberBeginWork, beginWork -> reconcileChildFibers
   根据当前 wip 的 tag 分发处理函数:

   1. 若 tag = HostRoot = 3, 则执行 updateHostRoot
      1. 从 wip.current.updateQueue 复制更新队列到 wip 上
      2. 从 wip.updateQueue 上拿到 payload, 这一步会解开 updateQueue 的循环链表
      3. 调用 reconcileChildren -> reconcileChildFibers, 此后跳转到 ReactChildFiber, 创建 wip.child 节点
   2. 若 tag = IndeterminateComponent = 2, 这其实就是一个函数组件节点, 则执行 mountIndeterminateComponent

      1. 从 wip.type 拿到函数组件的函数体
      2. 执行函数组件, 获得 children
      3. 调用 reconcileChildren -> reconcileChildFibers, 此后跳转到 ReactChildFiber, 创建 wip.child 节点

      其实不管 wip 是什么 tag, 都是要想办法获取一个 children, 然后用 reconcileChildFibers 创建 child fiber 并返回作为下一个 wip fiber

      在 reconcileChildFibers 阶段, 大部分情况下, 接收到的就是一个 jsx object, 这个对象被组织为类似洋葱皮的嵌套模型, 每次创建 child 都是通过 jsx.tag 来确定分发具体的创建函数, 最终其实都是创建一个 fiber 对象, **并且**把 jsx.props 挂载到这个 fiber 对象的 pendingProps 属性上去
