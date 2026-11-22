# 梦幻养老助手

梦幻西游端游的日常工作台，集中管理角色养成、游戏收益和账号收支。基于 Rust + Tauri 2 + Vue 3 + SQLite，支持 Windows 10 2004 及以上 / Windows 11 x64。

[下载安装](https://github.com/zhijian521/mh-toolbox-rs/releases) · [发布说明](docs/RELEASE.md) · [开发文档](docs/README.md) · [架构说明](docs/ARCHITECTURE.md)

## 预览

<table>
    <tr>
        <td width="33%" align="center"><a href="docs/screenshots/overview.png"><img src="docs/screenshots/overview.png" alt="总览：近一周概况、近一个月双币种收支与常用功能" width="100%"></a><br>总览</td>
        <td width="33%" align="center"><a href="docs/screenshots/characters.png"><img src="docs/screenshots/characters.png" alt="角色：属性、技能、修炼与装备管理" width="100%"></a><br>角色</td>
        <td width="33%" align="center"><a href="docs/screenshots/income.png"><img src="docs/screenshots/income.png" alt="收益：物品速记、点卡与统计图表" width="100%"></a><br>收益</td>
    </tr>
</table>

演示数据，点击图片查看大图。

## 功能

- **工作台**：近一周速记、在线时长与点卡消耗，近一个月梦幻币和人民币的收入、支出，以及可自定义的常用功能入口。
- **角色与目标**：属性、师门、辅助、修炼、装备和召唤兽统一管理；离线截图识别、识别改动摘要、成长历史，支持单角色或多角色养成目标。阴阳玉魄可同图识别，命魂之玉属性单独记录。
- **收益与记账**：物品图标速记、多人上线计时、点卡成本、角色分账、物价追踪与统计图表；账号账本按梦幻币和人民币分别汇总，卖币支持扣除藏宝阁手续费后计算实得。
- **日常与外观**：捉鬼助手、活动日历、提前五分钟提醒的闹钟，装备、技能与召唤兽头像图鉴；六种主题、明暗切换、独立字体与字号设置。

无需注册账号，日常记账与截图识别均在本机完成。账本目录为 `%APPDATA%\mh-tool-rs`，支持 JSON 导入、导出，自动保留最近 5 份备份（日常与替换前合计），可在设置页恢复；导入或恢复前另存当前账本，卸载不删除数据。主题、字体、字号、闹钟与首页入口属于本机偏好，不随账本导出。设置页支持手动检查正式版本更新。

## 开发

需要 Node.js 22、Rust stable（最低 1.90）、Visual Studio C++ Build Tools 与 Windows SDK，环境配置见 [AGENTS.md](AGENTS.md)。

```bash
git clone https://github.com/zhijian521/mh-toolbox-rs.git
cd mh-toolbox-rs
npm ci
npm run dev            # 浏览器预览，桌面能力需启动 Tauri
npm run desktop        # Tauri 开发窗口
npm run desktop:build  # Windows 安装包
```

本机也可使用 `start.bat` 补齐编译环境并启动。打包与发布流程见[发布说明](docs/RELEASE.md)，改动记录见 [RECORD.md](docs/RECORD.md)。

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)，仅限非商业用途。字体许可见[字体说明](assets/fonts/README.md)。本项目为非官方工具，游戏资源与名称的版权归原权利人。
