# Star History 扩展（修复版）

基于 Chrome 商店 [Star History](https://chromewebstore.google.com/detail/iijibbcdddbhokfepbblglfgdglnccfn) v2.0 打包产物修复，上游 [star-history/star-history](https://github.com/star-history/star-history) 已不含扩展源码。

## 修复

| 问题 | 原表现 | 修复 |
|---|---|---|
| 仓库地址解析 | 地址带 `#readme`、`?tab=` 时取不到仓库 | `repoFromUrl` 只取 `owner/repo` |
| 星数历史 | 抽样 `/stargazers` 分页，大仓库不准 | 拉全 `/stargazers/history` 分页按周累加 |
| 请求头 | 无 token 也发空 `Authorization` | 有 token 才带，固定 `X-GitHub-Api-Version` |
| 最新点日期 | 东八区周日 0–8 点显示成周六 | 未结束的周用当前时间 |

## 使用

- 安装：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/`
- 测试：`node --test github.test.mjs`
- 改动入口：`extension/assets/github.js`（`popup.37f1d1d4.js` 只改了引用）
