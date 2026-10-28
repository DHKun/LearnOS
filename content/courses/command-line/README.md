# 命令行与文件系统：在服务器上动手（`command-line`）

**版本**：`1.0.0` · **格式**：Manifest `schemaVersion: 3` · **学习路线**：《计算机基础入门》第 4 门（前一门《HTTP 实战》，后一门《Git 版本控制》）

## 设计思路

**一个世界**：library.test 网站所在的那台服务器。前三门课里它一直在远处，这门课学生以值班管理员 `ops` 的身份登录进去。网站在 `/srv/library`，日志在 `/var/log/library`，机器上还有网站进程（www-data）、数据库（postgres）、部署账号 deploy 和实习生 guest。每章处理这台机器上的一个故障。

**一个比喻**：办公楼。shell 是前台，目录是房间，`/` 是大门，路径是问路，权限是门禁（主人 / 本部门 / 外人），管道是流水线，进程是员工，信号是递给员工的纸条，PATH 是楼层索引。

**在路线中的位置**：第 4 章的访问日志就是《HTTP 实战》里的请求；第 7 章的端口占用接着《网络基础》的端口一章；第 8 章提到的 git 留给下一门。

## 模拟 shell

`simulation/shell.ts` 是一个确定性的 bash 子集，前端和服务端校验器共用：

- 虚拟文件树（主人、组、权限位、大小），用户与组，进程、端口与 systemd 服务，磁盘占用（含“已删除但仍被打开”的文件）。
- 引号、`$变量`、`~` / `~user`、`*` / `?` 通配符、`|`、`>`、`>>`、`2>`、`2>&1`、`<`、`&&`、`;`、alias、`source`。
- 白名单命令：`ls cat head tail grep wc sort uniq cut awk touch mkdir rmdir rm cp mv chmod truncate find du df ps kill ss systemctl sudo curl which type env printenv export echo whoami id hostname date` 等。
- **不执行任何真实命令**，没有 eval。命令替换、后台运行、`||` 直接拒绝。`grep` 只做文字匹配（支持 `^`、`$`），不接受正则，服务端重放时不会出现回溯爆炸。`sudo` 只放行 `systemctl`。
- 报错信息保持真实系统的英文原文（`No such file or directory`、`Permission denied`、`command not found`），练习机自己的限制用中文说明。
- 上限：每条命令 300 字符（提交时 200），记录 40 条，单个文件 400 KB，管道 8 段。

`simulation/server.ts` 搭出各章开始时的机器；`simulation/labs.ts` 是实验数据和判分规则。

## 章节

| # | slug | 内容 | 实验工单 | 实验类型 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 01 | `what-is-shell` | 命令、选项、参数；shell 怎么执行一行命令；三句常见报错 | — | — | 手动 |
| 02 | `paths` | 文件树、`pwd`/`cd`/`ls`、绝对与相对路径、`~` | 部署配置改成定时任务运行后四个路径指错，要在两种运行方式下都对 | 一份配置满足多个场景 | 实验 + 检查 |
| 03 | `files` | `mkdir`/`cp`/`mv`/`rm`、通配符、隐藏文件 | 整理上传目录：两份同名报告、子目录里的临时文件、必须留下的 `.htaccess` | 工作台 + 服务端重放 | 实验 |
| 04 | `reading` | `cat`/`head`/`tail`/`wc`、日志格式、`grep` | 查出第一次 500 的时间、地址、次数和原因 | 从制品里读答案 | 实验 + 检查 |
| 05 | `pipes` | 管道、`cut`/`sort`/`uniq -c`、重定向 | 统计访问前三的 IP，追加到周报 | 工作台 + 服务端重放 | 实验 |
| 06 | `permissions` | `ls -l`、rwx、目录的 x、数字写法、`chmod` | 首页打不开、上传失败、脚本不能运行、密码泄露 | 一份配置满足多个场景 | 实验 + 检查 |
| 07 | `processes` | `ps`、`ss -ltnp`、`kill` 与信号、systemd | 发布新版本时 80 端口被昨晚手动启动的旧进程占着 | 工作台 + 服务端重放 | 实验 |
| 08 | `environment` | 环境变量、PATH 查找顺序、`which`、`~/.bashrc` | 新版 node 和 libctl 装好了却找不到，下次登录也要能用 | 工作台 + 服务端重放（含时间维度） | 实验 + 检查 |
| 09 | `disk-full` | `df`/`du`/`find`、删除仍被打开的文件 | 凌晨三点磁盘写满、网站 500 | 综合任务（无实时提示） | 实验 |
| 10 | `final` | 结业测验 | 20 道情景题，80 分及格 | — | 结业测验 |

规模：10 章、9 个概念动画、8 个实验、36 道服务端计分题（结业 20 道）。积分：10 × 10 + 50 = 150。

## 几处刻意的设计

- **第 2 章**：初始的四个路径各错得不一样：两个只在定时任务下错（相对路径），一个两种方式都错（目录名拼错），一个只在手动运行时错（`~` 跟着用户变）。
- **第 3 章**：`inbox/report.pdf` 和 `inbox/old/report.pdf` 是两份不同的报告，直接 `mv` 进同一个目录会覆盖掉一份；`*.tmp` 匹配不到子目录里的临时文件；`rm -rf inbox` 会删掉必须保留的 `.htaccess`。
- **第 4 章**：日志里有大小正好 500 字节的响应和地址 `/books/500`，直接 `grep 500` 得到的“第一次”不是错误；原因要按时间去 `error.log` 对照，那里还混着更早的证书告警和慢查询。
- **第 5 章**：日志里的 IP 是打乱的，不先 `sort` 就 `uniq -c` 计数全错；不 `sort -rn` 而 `head` 会取到字母序前三；用 `>` 写会清空周报。
- **第 6 章**：要开够又不能多开：网站要读 `db.env`（600 不行），guest 不能读（644 不行）；`static/` 是 740，组有 r 没有 x，读不到里面的首页。`chmod 777` 判不通过。
- **第 7 章**：`systemctl restart` 停不掉手动启动的进程；`ps` 里有名字相近的 `library-worker`，误杀判不通过；`kill -9` 会让正在上传的两份文件停在 `.part`。
- **第 8 章**：表格分“现在”和“下次登录后”两列。`PATH=$PATH:新目录` 修得好 libctl、修不好 node；`export` 不写进 `~/.bashrc` 下次登录就失效；用 `>` 写 `.bashrc` 会丢掉原有设置。
- **第 9 章**：撑满磁盘的 `debug.log` 被网站进程开着，`rm` 之后 `df` 仍是 100%，要重启服务或改为清空内容；删掉全部备份或 `rm -rf /var/log/library/*` 判不通过。

## 判分

| 实验 | 提交内容 | 服务端怎么判 |
| --- | --- | --- |
| `paths-lab` | 四个路径字符串 | 分别以 ops@`/srv/library` 和 deploy@`/home/deploy` 解析，必须都指向目标且目录存在 |
| `logs-lab` | 四个答案 | 与日志数据算出的答案比较（时间、路径做归一化） |
| `perms-lab` | 六个三位八进制权限 | 用同一套权限引擎检查八个场景，任一权限格式不对则全部不通过 |
| 其余五个 | 命令记录 | 在全新机器上重放，按最终状态判分 |

## 目录

```text
simulation/shell.ts   模拟 shell：文件树、权限、进程、解析与命令
simulation/server.ts  library.test 服务器在各章开始时的样子
simulation/labs.ts    各实验的数据与判分规则
validators.ts         服务端校验器
activities/labs.tsx   八个实验组件与共用的终端
concepts/concepts.tsx 九个概念动画
assessments/*.server.json
```

## 测试

```bash
pnpm vitest run tests/unit/command-line.test.ts
pnpm test:e2e tests/e2e/command-line.spec.ts    # 10 章真实界面闭环，结课并核对 150 积分
```

## 修改须知

判分规则写在 `simulation/` 里，平台的冻结检查只看 `validators.ts`，发现不了对它们的修改。课程有学习记录后，改判分逻辑、各章初始机器或日志生成（`server.ts` 里的种子和访客分布决定了第 4、5 章的答案）都要发布新 slug。
