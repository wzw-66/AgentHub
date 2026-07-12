# Docker Exec 底层原理

> 本文档解释 `docker exec` 在容器内执行命令时，从系统调用到应用层的完整数据流，
> 帮助理解沙箱（Sandbox）中命令执行结果如何从容器传回 Agent。

## 前提认知

**容器不是虚拟机，是加了 namespace 隔离的 Linux 进程。**

```
虚拟机：Hypervisor → 完整 Guest OS Kernel → 进程
容器：  Docker     → namespace/cgroup    → 进程（共用宿主机内核）
```

所以容器内进程和宿主机进程共享同一个 Linux 内核，只是"看不见"对方。

---

## 一、全链路概览

```
你的程序（Node.js）
  docker exec({Cmd: ["npm", "install"]})
    │
    ▼ HTTP POST /containers/{id}/exec
┌─────────────── dockerd ───────────────┐
│  API 网关：解析请求、权限校验、路由     │
└──────────┬────────────────────────────┘
           │ gRPC
           ▼
┌────────── containerd ─────────────────┐
│  容器状态查询、镜像管理               │
└──────────┬────────────────────────────┘
           │ 调用 runc
           ▼
┌────────── runc ───────────────────────┐
│  真正的"干活层"                       │
│  - pipe(2) 创建管道                   │
│  - setns 进入容器 namespace           │
│  - fork/exec 启动进程                 │
│  - waitpid 收尸                       │
└──────────┬────────────────────────────┘
           │
           ▼
┌────────── containerd-shim ────────────┐
│  常驻监护进程                         │
│  - 持有 pipe 读端                     │
│  - 等 runc 退出后继续读 pipe          │
│  - 通过 UNIX socket 暴露给 containerd │
└───────────────────────────────────────┘
```

---

## 二、核心机制：pipe(2)

### 2.1 什么是 pipe(2)

`pipe(2)` 是 Linux 系统调用，在内核空间创建一个**环形缓冲区**（默认 64KB）和两个文件描述符：

```c
int fd[2];
pipe(fd);
// fd[0] = 读端（从管道取数据）
// fd[1] = 写端（往管道写数据）
```

```
内核空间
┌─────────────────────────────────┐
│  pipe 环形缓冲区 (64KB)          │
│  ┌───┬───┬───┬───┬───┬───┬───┐ │
│  │ a │ d │ d │ e │ d │ │ │ │ │ │
│  └───┴───┴───┴───┴───┴───┴───┘ │
│   ↑写指针               ↑读指针  │
└─────────────────────────────────┘
     fd[1] ← 子进程写          fd[0] → 父进程读
```

**关键特性：**

- 纯内存操作，不经过磁盘
- 读端没数据时 `read()` 阻塞
- 写端关闭后读端 `read()` 返回 0（EOF）
- 内核自动同步，无需用户态锁

### 2.2 pipe(2) 发生在什么时候

```c
// runc 的核心逻辑——伪代码

// 第 1 步：创建管道
int stdout_fd[2], stderr_fd[2];
pipe(stdout_fd);   // 创建 stdout 管道
pipe(stderr_fd);   // 创建 stderr 管道

// 第 2 步：fork 子进程
pid_t child = fork();

if (child == 0) {
    // ── 子进程（即将进入容器 namespace）──
    
    // 关闭读端，子进程只写
    close(stdout_fd[0]);
    close(stderr_fd[0]);
    
    // 把 stdout 重定向到 pipe 写端
    dup2(stdout_fd[1], STDOUT_FILENO);
    dup2(stderr_fd[1], STDERR_FILENO);
    
    // 进入容器的 namespace
    setns(container_ns, CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET);
    
    // 替换成目标程序
    exec("npm", ["install"]);
    // 这之后，npm 的所有 stdout 都写到 pipe 写端
}

// ── 父进程（宿主机）──

// 关闭写端，父进程只读
close(stdout_fd[1]);
close(stderr_fd[1]);

// 把读端传给 shim
send_to_shim(stdout_fd[0], stderr_fd[0]);
```

**pipe 在 fork 之前创建。** fork 后子进程自动继承这两个 fd，然后父子分别关闭不需要的那一端。

---

## 三、核心机制：waitpid(2)

### 3.1 什么是 waitpid(2)

`waitpid(2)` 是父进程用来等待子进程结束的系统调用：

```c
int status;
pid_t exited_pid = waitpid(child_pid, &status, 0);

if (WIFEXITED(status)) {
    int exit_code = WEXITSTATUS(status);
    // exit_code = npm 的退出码
}
```

**waitpid 阻塞**——子进程没结束，waitpid 不会返回。

### 3.2 pipe(2) 和 waitpid(2) 的关系

```
时间线                        npm              shim
───                          ───              ────
t0: pipe(2) 创建管道
t1: fork()
t2: setns + exec             启动 npm
t3:                           write("added 124 packages\n")
t4:                                                  read() → "added 124 packages"  ← 实时读到
t5:                           write("added 847 packages\n")
t6:                                                  read() → "added 847 packages"  ← 实时读到
t7:                           exit(0)
                              ├── 内核关闭 pipe 写端
                              └── 内核记录退出码
t8:                                                  read() → 0 (EOF)  ← "没有新数据了"
t9:                                                  waitpid() 返回 exitCode = 0
```

**关键规律：** read 到 EOF ≈ 进程已退出 ≈ waitpid 不会阻塞。所以通常先读完 pipe，再 waitpid 收退出码。

---

## 四、从系统调用到应用层

### 4.1 shim 的桥接作用

runc 只存在几毫秒（创建完进程就退出了），谁来持续读 pipe？—— **containerd-shim**。

```
runc 创建完进程后：
    - 把 stdout_fd[0] 传给 shim
    - 自己 exit(0)

shim 进程（常驻）：
    - 持有 stdout_fd[0]（pipe 读端）
    - 在一个事件循环里 read(fd)
    - 读到的数据写 UNIX socket
    - 等 waitpid 返回后，把退出码也写 UNIX socket

shim 暴露的路径：
    /run/containerd/io.containerd.runtime.v2.task/default/<容器ID>/init
    └── 这是一个 UNIX domain socket
```

### 4.2 数据转发链

```
npm stdout ──pipe──→ shim ──UNIX socket──→ containerd ──gRPC──→ dockerd ──HTTP──→ 你的程序

       内核空间          宿主机进程间             内存           进程内          网络
       (64KB buffer)   (同进程文件的 socket)   (protobuf)   (HTTP/1.1)    (localhost)
```

每一层只是**拷贝数据**，不改变内容：

```
npm write (pipe) → 内核 copy → shim read
shim write (UNIX socket) → 内核 copy → containerd read
containerd → protobuf 序列化 → dockerd 解析
dockerd → 编码成 Docker 复用帧 → HTTP 流
```

### 4.3 Docker 复用帧格式

Docker 的 HTTP 流不是纯 stdout/stderr——它用了一个简单的帧格式区分 stdout 和 stderr：

```
┌────────┬───────────────────┬─────────────────────────┐
│ 1 byte  │ 3 bytes padding   │   4 bytes payload length │
│ stream  │                  │                         │
├────────┼───────────────────┼─────────────────────────┤
│ 0x01    │      0x00 0x00 0x00 │    0x00 0x00 0x00 0x10  │  ← stdout, 16 字节
├────────┴───────────────────┴─────────────────────────┤
│ payload: "added 124 packa"                           │
├────────┬───────────────────┬─────────────────────────┤
│ 0x02    │      0x00 0x00 0x00 │    0x00 0x00 0x00 0x06  │  ← stderr, 6 字节
├────────┴───────────────────┴─────────────────────────┤
│ payload: "warn: ..."                                 │
└──────────────────────────────────────────────────────┘

stream 类型: 0x01 = stdin, 0x01 = stdout, 0x02 = stderr
```

这就是 dockerode 帮你解析的东西——你拿到的是纯内容，不用管帧头。

---

## 五、命令结束的判断

```typescript
// 应用层用 dockerode
const stream = await exec.start();
const output: Buffer[] = [];

stream.on("data", (chunk: Buffer) => {
  // npm 实时输出，逐帧涌过来
  output.push(chunk);
});

stream.on("end", () => {
  // ── 这表示 HTTP 流结束 ──
  // → 底层 pipe 读到了 EOF
  // → 子进程已经退出
  // → 可以查退出码了
  exec.inspect().then(info => {
    console.log("ExitCode:", info.ExitCode);
    // 把 output 和 exitCode 打包返回给 Agent
  });
});
```

`stream.on("end")` 的底层链条：

```
npm exit(0)
  → 内核关闭 pipe 写端
    → shim 的 read() 返回 0（EOF）
      → shim 关闭 UNIX socket 连接
        → containerd 知道流结束
          → dockerd 关闭 HTTP response
            → 你的 stream.on("end") 触发
```

---

## 六、execSync 的底层差异

你的 `LocalSandbox` 用的是 `execSync`，它的底层逻辑完全等价：

| | `execSync("npm install")` | `docker exec npm install` |
|--|---------------------------|--------------------------|
| pipe 创建 | Node.js 内部 `pipe(2)` | runc 的 `pipe(2)` |
| 进程创建 | `fork()` 直接在宿主机 | `fork()` + `setns()` 进容器 |
| 退出码获取 | waitpid 拿到 | exec.inspect().ExitCode |
| stdout/stderr | Node.js 缓冲后返回 | HTTP 流帧解包 |
| 阻塞方式 | 同步阻塞主线程 | await 异步阻塞 |

**本质一样，只是多了一层 namespace 隔离和一串网络转发。**

---

## 七、总结

| 问题 | 答案 |
|------|------|
| 谁创建了 pipe？ | **runc**，在 fork 之前调用 `pipe(2)` |
| 我们怎么获取 pipe？ | 不直接获取，通过 Docker API 读 HTTP 流 |
| 数据怎么从容器传到宿主机？ | **pipe(2)**——一块内核内存缓冲区，两端在同一个内核的 namespace 两边 |
| 怎么知道命令结束了？ | HTTP 流关闭 → 底层 pipe 读到 EOF → 子进程已退出 |
| exit code 从哪里来？ | **waitpid(2)** 从内核拿到，经过 exec.inspect() 暴露 |
| 为什么需要 shim？ | runc 创建完进程就退出了，shim 常驻读 pipe 和收 waitpid |
