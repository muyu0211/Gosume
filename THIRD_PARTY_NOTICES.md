# Third-Party Notices / 第三方组件声明

Gosume 为专有软件（见 [LICENSE](LICENSE)），但其分发版本中包含若干第三方开源
组件。该等组件仍受其各自许可证约束，本文件按各许可证的署名要求予以列明。

Gosume is proprietary software (see [LICENSE](LICENSE)), but its distributed
binaries incorporate third-party open source components. Those components remain
subject to their own licenses and are attributed here as required.

---

## Go 直接依赖（已逐一核对模块内 LICENSE 文件）

| 模块 Module | 版本 Version | 许可证 License |
| --- | --- | --- |
| github.com/fsnotify/fsnotify | v1.10.1 | BSD-3-Clause |
| github.com/go-pdf/fpdf | v0.9.0 | MIT |
| github.com/go-rod/rod | v0.116.2 | MIT |
| github.com/google/uuid | v1.6.0 | BSD-3-Clause |
| github.com/wailsapp/wails/v3 | v3.0.0-alpha.85 | MIT |
| go.uber.org/zap | v1.28.0 | MIT |
| golang.org/x/sync | v0.22.0 | BSD-3-Clause |
| gopkg.in/yaml.v3 | v3.0.1 | MIT / Apache-2.0 |
| modernc.org/sqlite | v1.44.3 | BSD-3-Clause |
| resty.dev/v3 | v3.0.0-rc.3 | MIT |

上述均为宽松型许可证（MIT / BSD / Apache-2.0），**不含 GPL、LGPL 或 AGPL 组件**，
因此不会因「传染性」条款要求公开 Gosume 自身源码。

All of the above are permissive licenses (MIT / BSD / Apache-2.0). **No GPL, LGPL
or AGPL components are present**, so no copyleft obligation extends to Gosume's
own source code.

## Go 传递依赖与前端依赖

`go.mod` 的间接依赖（如 `go-git`、`golang.org/x/*`、`ysmood/*` 等）与
`frontend/` 的 npm 依赖同样需要署名。发行前请生成完整清单并合并到本文件：

```bash
# Go：生成包含传递依赖的完整许可证清单
go install github.com/google/go-licenses@latest
go-licenses csv ./... > go-licenses.csv

# 前端 npm 依赖
cd frontend && npx license-checker --production --csv --out npm-licenses.csv
```

> ⚠️ 若扫描结果中出现 GPL / LGPL / AGPL 组件，必须在发行前替换，否则闭源分发
> 将违反其许可证。请特别留意前端依赖（部分编辑器、图表、字体包为此类许可证）。

## 构建脚本中的第三方代码

`build/android/` 下的 `gradlew`、`gradlew.bat` 等文件来自上游项目脚手架，
分别采用 Apache-2.0 许可，其版权声明已保留在对应文件头部。
