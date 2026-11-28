# 聊天窗口 OCR 工作进程

Windows x64，基于 RapidAI/RapidOcrNcnn 1.2.0 的 Project_RapidOcrNcnn-1.2.0 发布源码包，沿用其中的 ncnn Vulkan、OpenCV 4.6 静态库及 PP-OCRv3 模型。识别参数和边框换算统一在 worker.cpp。进程只通过标准输入输出接收图像宽高、调用方指定的 1～6 倍倍率和 BGRA 像素（OCR2 协议），返回 UTF-8 文字和坐标。

在 x64 MSVC 开发环境中配置 Vulkan SDK，将源码包完整解开后执行：

```powershell
cmake -S tools/chat-ocr -B .runtime/chat-worker -G Ninja -DCMAKE_BUILD_TYPE=Release -DRAPID_SOURCE=C:/path/to/Project_RapidOcrNcnn-1.2.0
cmake --build .runtime/chat-worker --parallel 4
```

将 chat-ocr.exe、源码包 models 中的 .bin 和 .param、Visual C++ x64 OpenMP 可再分发目录中的 vcomp140.dll 放入 src-tauri/models/chat-ncnn。词典复用上一级 models/ppocr_keys_v1.txt。归属与许可证随资源提供。
