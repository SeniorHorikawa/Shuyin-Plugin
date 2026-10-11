<div align="center">

# 原神插件 · Yuanshen-Plugin

**一个跑在云崽（Yunzai）上的「小说 + 酷狗」全能小助手**

搜书、整本下载，扫码登录、提交刷歌——一个插件全搞定。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![Yunzai](https://img.shields.io/badge/Yunzai-TRSS%20%2F%20Miao-ff69b4.svg)](https://github.com/TimeRainStarSky/Yunzai)
[![GitHub](https://img.shields.io/github/stars/SeniorHorikawa/Yuanshen-Plugin?style=social)](https://github.com/SeniorHorikawa/Yuanshen-Plugin)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/SeniorHorikawa/Yuanshen-Plugin/pulls)

<sub>番茄 / 七猫 搜索 · 起点 / 七猫 / 番茄 整书下载 · 酷狗扫码登录与刷歌</sub>

</div>

---

## 📖 目录

- [✨ 功能一览](#-功能一览)
- [📦 安装](#-安装)
- [⚙️ 配置](#️-配置)
- [🎮 使用指令](#-使用指令)
- [🔌 后端接口](#-后端接口)
- [🤝 致谢](#-致谢)
- [⚠️ 免责声明](#️-免责声明)

---

## ✨ 功能一览

| 模块 | 能力 |
| :-- | :-- |
| 📚 **小说搜索** | 一次关键词同时搜番茄 + 七猫，合并转发成卡片列表，含作者 / 章节数 / 状态 / 评分 / 简介 |
| 📥 **整书下载** | 起点、七猫、番茄三站整本抓取，导出为 `.zip` 直接发文件；支持限量下载与断点式缓存 |
| 🔗 **链接直下** | 直接发起点 / 七猫 / 番茄分享链接（含短链）即可识别书号并下载 |
| 🎵 **酷狗登录** | 二维码扫码登录，轮询确认、可取消，ck + 设备信息本地持久化 |
| ⏱️ **酷狗刷歌** | 提交指定时长刷歌，自动计算预计耗时并在完成后回报今日听歌增量 |
| 👤 **账号信息** | 查询昵称、听歌等级、今日 / 累计听歌时长、地区、注册时间等 |

---

## 📦 安装

> 前置：已部署 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) 或 [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai)，Node.js ≥ 18。

```bash
# 进入云崽插件目录
cd Yunzai/plugins

# 克隆本插件
git clone https://github.com/SeniorHorikawa/Yuanshen-Plugin.git

# 安装依赖（插件本体近乎零依赖，仅格式化工具）
cd Yuanshen-Plugin && pnpm install
```

重启云崽即可自动注册使用。

---

## ⚙️ 配置

配置文件位于**插件目录**下，首次加载时若不存在会自动生成模板：

```text
Yunzai/plugins/Yuanshen-Plugin/config/novel.yaml
```

| 字段 | 类型 | 说明 |
| :-- | :-- | :-- |
| `api_url` | string | 后端网关地址（番茄 / 七猫 / 起点 / 酷狗 action 共用），默认 `http://127.0.0.1:2017` |
| `QIDIAN_CK` | string | 起点读书完整请求头（含 `QDInfo` 等），仅在下载起点书籍时需要 |
| `search_count` | number | 每个来源返回的搜索结果条数 |
| `cache_minutes` | number | 搜索缓存有效分钟数，缓存期内可用「序号」直接下载 |
| `download_timeout_sec` | number | 整书下载 HTTP 超时（秒），大部头可调大 |
| `max_chapters` | number | 番茄整书默认最大章节数，`0` 表示全本 |
| `size_warn_mb` | number | 发送前超过该大小（MB）时提示 |

> 🔐 `config/novel.yaml` 含敏感信息，已在 `.gitignore` 中忽略，请勿提交到仓库。

---

## 🎮 使用指令

### 📚 小说

| 指令 | 说明 |
| :-- | :-- |
| `#搜小说 <关键词>` | 同时搜索番茄 + 七猫 |
| `#搜番茄 <关键词>` / `#搜七猫 <关键词>` | 指定单一来源搜索 |
| `#小说下载 <序号> [章节数]` | 下载搜索结果（限量仅番茄支持） |
| `#小说下载 番茄:<书号> [章节数]` | 指定来源 + 书号下载 |
| `#小说下载 七猫:<书号>` / `#小说下载 起点:<书号>` | 同上 |
| `#起点下载 <书号>` / `#七猫下载 <书号>` / `#番茄下载 <书号>` | 快捷下载 |
| `<分享链接>` | 直接发起点 / 七猫 / 番茄链接即可下载整本 |
| `#小说帮助` | 查看指令菜单 |

### 🎵 酷狗

| 指令 | 说明 |
| :-- | :-- |
| `#酷狗登录` | 生成二维码，扫码并确认登录 |
| `#酷狗取消登录` | 取消进行中的扫码登录 |
| `#酷狗提交刷歌 <分钟> [歌名]` | 提交刷歌任务，歌名不填默认《晴天》 |
| `#酷狗停止刷歌` | 提前停止当前刷歌任务 |
| `#酷狗刷新` | 刷新 ck 并返回账号信息 |
| `#我的酷狗` | 查看等级、今日 / 累计听歌时长等 |
| `#酷狗帮助` | 查看指令菜单 |

---

---

## 🤝 致谢

- [Yunzai-Bot](https://github.com/TimeRainStarSky/Yunzai) —— 强大的云崽框架
- 所有贡献者与使用者 🌟

---

## ⚠️ 免责声明

本项目仅供**学习与个人交流**使用，所有内容均来自第三方公开接口。请勿用于商业用途或任何违反相关平台服务条款的行为。使用产生的一切后果由使用者自行承担。

---

<div align="center">

**如果这个插件帮到了你，点个 ⭐ Star 就是最好的支持。**

Made with ❤️ by Senior Horikawa

</div>
