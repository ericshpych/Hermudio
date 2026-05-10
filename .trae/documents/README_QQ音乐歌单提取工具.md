# QQ音乐歌单提取工具

## 📋 简介

这是一个用于从 Mac 版 QQ音乐 自动提取歌单数据的工具。可以将你收藏的歌单和自建的歌单整理成文本格式，方便用于 AI Agent 的音乐喜好学习。

## 🎯 功能特性

- ✅ 自动提取收藏歌单（foldertype=2）
- ✅ 自动提取自建歌单（foldertype=1）
- ✅ 自动提取系统歌单（foldertype=0 - 最近播放等）
- ✅ 生成格式化报告（易于阅读）
- ✅ 生成AI训练数据（简洁格式）
- ✅ 保留歌曲名称、歌手、专辑信息

## 📁 文件说明

### 脚本文件

1. **extract_qqmusic_playlists.sh** - Bash脚本版本
   - 依赖：`sqlite3`
   - 使用方法：`./extract_qqmusic_playlists.sh`

2. **extract_qqmusic.py** - Python脚本版本（推荐）
   - 依赖：Python 3.6+
   - 使用方法：`python3 extract_qqmusic.py`

### 输出文件

生成的歌单文件保存在 `./qqmusic_playlists/` 目录下：

- **歌单汇总_YYYYMMDD_HHMMSS.txt** - 详细报告
  - 包含所有歌单的完整信息
  - 格式美观，便于阅读
  - 包含统计信息

- **AI训练数据_YYYYMMDD_HHMMSS.txt** - AI训练格式
  - 简洁的文本格式
  - 每首歌一行：`歌曲名称 - 歌手`
  - 适合投喂给AI Agent进行音乐喜好分析

## 🚀 快速开始

### 方式一：使用Python脚本（推荐）

```bash
# 进入工具目录
cd /Users/bytedance/Hermudio

# 运行脚本
python3 extract_qqmusic.py

# 查看输出
ls -lh qqmusic_playlists/
```

### 方式二：使用Bash脚本

```bash
# 给脚本添加执行权限
chmod +x extract_qqmusic_playlists.sh

# 运行脚本
./extract_qqmusic_playlists.sh
```

## 📊 数据统计

运行脚本后，你会看到类似这样的统计信息：

```
✅ 提取完成！
══════════════════════════════════════════════════════════════════════
📄 详细报告: qqmusic_playlists/歌单汇总_20260503_102456.txt
📄 AI训练数据: qqmusic_playlists/AI训练数据_20260503_102456.txt

📊 统计:
   • 总歌单数: 41个
   • 总歌曲数: 3796首
```

## 📝 输出格式示例

### 详细报告格式

```
════════════════════════════════════════════════════════════════════
                      📀 QQ音乐歌单整理报告
                      提取时间: 2026-05-03 10:24:56
════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────────
🎵 收藏的歌单
说明: 你在QQ音乐中收藏的他人创建的歌单
────────────────────────────────────────────────────────────────────

  📁 歌单 #1: 咖啡厅专用背景音乐
     歌曲数量: 532首

     ┌─────────────────────────────────────────────────────────────┐
     │ 序号 | 歌曲名称                              | 歌手                │
     ├─────────────────────────────────────────────────────────────┤
     │   1  │ Samba Para Bean                │ Coleman Hawkins     │
     │   2  │ Pure Thoughts                  │ Kondor              │
     └─────────────────────────────────────────────────────────────┘
```

### AI训练数据格式

```
QQ音乐歌单整理 - 2026-05-03

歌单1: 咖啡厅专用背景音乐 (532首)
  - Samba Para Bean - Coleman Hawkins
  - Pure Thoughts - Kondor
  - Casar - Mulo Francel & Tango Lyrico
  - ...

歌单2: 好声音2018 (198首)
  - 让我一次爱个够 - 周杰伦/谢霆锋/李健/庾澄庆
  - 黄河谣 - 王朝
  - ...
```

## ⚙️ 技术细节

### 数据源

工具从 Mac 版 QQ音乐 的 SQLite 数据库中提取数据：
- 数据库路径：`~/Library/Containers/com.tencent.QQMusicMac/Data/Library/Application Support/QQMusicMac/qqmusic.sqlite`

### 数据库表结构

- **NEWFOLDERS** - 歌单信息表
  - `folderid` - 歌单ID
  - `folderName` - 歌单名称
  - `foldertype` - 歌单类型（0=系统, 1=自建, 2=收藏）
  - `foldercount` - 歌曲数量

- **NEWFOLDERSONGS** - 歌单歌曲关联表
  - `seq` - 歌曲序号
  - `id` - 歌曲ID

- **SONGS** - 歌曲信息表
  - `name` - 歌曲名称
  - `singer` - 歌手
  - `album` - 专辑

### 歌单类型说明

- **foldertype=2 (收藏的歌单)**：你在QQ音乐中收藏的他人创建的歌单
- **foldertype=1 (自建的歌单)**：你亲自创建和管理的歌单
- **foldertype=0 (系统歌单)**：QQ音乐自动生成的功能性列表（如最近播放、下载管理等）

## 💡 使用场景

1. **AI音乐推荐系统训练**：将歌单数据投喂给AI Agent，学习用户的音乐偏好
2. **音乐品味分析**：了解自己常听的歌曲类型和歌手
3. **歌单备份**：创建歌单的文本备份
4. **跨平台迁移**：将歌单信息导出为通用文本格式

## 🛠️ 故障排除

### 问题1：找不到数据库文件

**原因**：QQ音乐可能未安装或未运行过

**解决方案**：
1. 确保 Mac 版 QQ音乐 已安装并至少运行过一次
2. 检查数据库路径是否存在

```bash
ls ~/Library/Containers/com.tencent.QQMusicMac/Data/Library/Application\ Support/QQMusicMac/qqmusic.sqlite
```

### 问题2：权限被拒绝

**原因**：数据库文件权限不足

**解决方案**：
```bash
chmod 644 ~/Library/Containers/com.tencent.QQMusicMac/Data/Library/Application\ Support/QQMusicMac/qqmusic.sqlite
```

### 问题3：Python脚本运行失败

**原因**：Python版本不兼容或缺少依赖

**解决方案**：
1. 检查Python版本（需要3.6+）
```bash
python3 --version
```

2. 使用Bash脚本版本代替

## 📌 注意事项

- ⚠️ 提取过程中不会修改原始数据库，只读取数据
- 💾 建议定期运行脚本备份歌单数据
- 🔒 数据库文件包含个人隐私信息，请妥善保管
- ⏰ 每次运行脚本会生成新的文件，不会覆盖旧文件
- 📊 生成的报告文件较大（通常几百KB），请注意磁盘空间

## 🔄 更新日志

### v1.0 (2026-05-03)
- ✨ 初始版本发布
- ✅ 支持提取收藏歌单、自建歌单、系统歌单
- ✅ 生成格式化报告和AI训练数据
- ✅ 支持Bash和Python两种脚本版本

## 📧 反馈与支持

如果遇到问题或有改进建议，请随时反馈！

## 🎵 最后

祝你使用愉快！希望这个工具能帮助你更好地管理和学习自己的音乐偏好！
