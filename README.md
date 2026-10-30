# 浅景 · Anime Wallpaper Tool

把喜欢的图片，调成舒服的壁纸。开源、无需账号、无需 API 密钥，图片在自己的设备上处理。

**[在线使用](https://softwall-studio-quiet-1030.newbowl10.chatgpt.site/)** · **[下载源码 ZIP](https://github.com/YouMingKaMi/anime-wallpaper-tool/archive/refs/heads/main.zip)**

## 能做什么

- 上传、拖入或粘贴 PNG / JPG / WebP。
- 实时调整饱和度、明暗反差、暗部提亮、浅淡程度、亮度与锐化。
- 四种预设、左右对比、100% 细节查看、浏览器搜索框效果预览。
- 原比例或 16:9 居中裁剪，导出原尺寸、长边 2560 或 4K，保存 PNG / JPG。
- **浏览器轻量增强**：ESRGAN Slim，在浏览器运行，无需安装本地 AI 引擎。
- **动漫精细增强**：Real-ESRGAN `RealESRGAN_x4plus_anime_6B`，在自己的电脑运行，支持进度、取消与撤回结果。

在线版可以直接调色、使用浏览器轻量增强和下载。动漫精细增强需要启动下面的本地版。

## 下载后启动

先安装 **[Python 3.10 或更新版本](https://www.python.org/downloads/)**。Windows 安装时勾选 “Add Python to PATH”。

1. 下载本仓库 ZIP 并完整解压，也可以 `git clone`。
2. 按系统启动：

| 系统 | 启动入口 | 本机动漫引擎 |
| --- | --- | --- |
| macOS Apple Silicon / Intel | 双击 `start.command`；若 ZIP 丢失执行权限，在终端运行 `python3 start.py` | 支持 |
| Windows x64 | 双击 `start.bat` | 支持；需要 Vulkan 兼容显卡与驱动 |
| Linux x64 | 终端运行 `sh start.sh` | 支持；需要 Vulkan 兼容显卡与驱动 |

3. 首次启动自动从 Real-ESRGAN 官方 GitHub 下载对应系统的引擎及动漫模型（约 50 MB）；Windows / Linux 还会在项目 `.venv` 内安装 Pillow。需要联网，之后无需重复下载。
4. 浏览器自动打开 **http://127.0.0.1:8839/**。保留启动窗口；关闭它即停止服务。

命令行启动：

```bash
python3 start.py
```

Windows 也可以使用 `py -3 start.py`。**不需要 GitHub、ChatGPT 或其他账号登录。**

本机端到端处理已在 Apple M2 / macOS 上验证。Windows、Linux 的启动与平台选择有自动检查，但尚未在对应实机上验证。

## 其他运行方式

仅使用本地调色网页和浏览器增强，不下载本机引擎：

```bash
python3 start.py --web-only
```

其他端口、不自动打开浏览器：

```bash
python3 start.py --port 8840 --no-open
```

使用自己已经从官方下载的对应平台压缩包：

```bash
python3 start.py --archive /path/to/realesrgan-ncnn-vulkan-20220424-macos.zip
```

只部署网页：`dist/` 是完整静态站点，可部署到任意静态托管服务，没有登录系统或私有平台依赖。浏览器增强的组件与模型已随源码提供；本机动漫引擎首次启动时单独下载。

## 效果和限制

- **4K 是输出尺寸，不保证能还原原本不存在的真实细节。** AI 可能改变细线条、纹理，建议先选“原色”，用 100% 视图检查，再调色。
- 动漫模型原生 4 倍增强，再用高质量缩放生成长边 3840 的结果。例如 1920 × 1200 → 7680 × 4800 → 3840 × 2400。
- 动漫精细增强支持原图不超过 **800 万像素**，一次处理一张，可能需要数分钟。
- 网页一般导入上限为 40 MB / 3200 万像素。浏览器增强需要 WebGL。
- 保留比例的 4K 可能是 3840 × 2400；16:9 输出为 3840 × 2160。
- 若本机 GPU 不兼容、首次下载失败或系统架构不受支持，可以使用 `--web-only`。

## 图片和数据

图片不会上传云端。网页调色、浏览器轻量增强都在浏览器执行；动漫增强只把图片传给自己电脑的 `127.0.0.1` 本地程序。

本地程序只监听回环地址，校验请求来源、主机名和每次启动随机产生的请求校验值。输入图与 4 倍中间图处理后删除，临时增强结果在服务退出时删除。没有分析埋点，也没有持久化图片历史。

## 开源组件与许可

应用代码使用 [MIT](LICENSE) 许可。第三方组件及模型保留各自许可证：

- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) / [官方动漫模型](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/anime_model.md)：模型与运行程序许可见 `licenses/`。
- [Real-ESRGAN ncnn Vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan)：使用官方 v0.2.5.0 / 20220424 各平台发行版。
- [UpscalerJS](https://upscalerjs.com/) 1.0.0、ESRGAN Slim 1.0.0：MIT。
- TensorFlow.js 4.11.0：Apache 2.0。
- Pillow：使用其自身开源许可，Windows / Linux 安装在隔离环境内。

前端组件许可见 `dist/vendor/`。示例中的两张动漫壁纸由项目发起者提供，作品权利归原作者，不随应用代码以 MIT 重新授权。

## 开发与检查

无需 Node 构建或前端依赖安装。

```bash
python3 -m unittest discover -s tests
node --check dist/app.js
node --check dist/local-engine.js
```
