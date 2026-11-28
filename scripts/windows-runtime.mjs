// 发布前检查已知原生依赖，避免开发机已有的运行库和模型掩盖漏包。
import fs from 'node:fs';

export const REQUIRED_CRT = [
    'msvcp140.dll',
    'msvcp140_1.dll',
    'vcruntime140.dll',
    'vcruntime140_1.dll',
];
const REQUIRED_RESOURCES = [
    'models/ch_PP-OCRv4_det_infer.onnx',
    'models/ch_ppocr_mobile_v2.0_cls_infer.onnx',
    'models/ch_PP-OCRv4_rec_infer.onnx',
    'models/ppocr_keys_v1.txt',
    'models/chat-ncnn/chat-ocr.exe',
    'models/chat-ncnn/vcomp140.dll',
    'models/chat-ncnn/ch_PP-OCRv3_det_infer.param',
    'models/chat-ncnn/ch_PP-OCRv3_det_infer.bin',
    'models/chat-ncnn/ch_ppocr_mobile_v2.0_cls_infer.param',
    'models/chat-ncnn/ch_ppocr_mobile_v2.0_cls_infer.bin',
    'models/chat-ncnn/ch_PP-OCRv3_rec_infer.param',
    'models/chat-ncnn/ch_PP-OCRv3_rec_infer.bin',
    'models/chat-ncnn/NOTICES.txt',
    'DirectML.dll',
    ...REQUIRED_CRT,
];

export function assertX64Binary(file) {
    const data = fs.readFileSync(file);
    const pe = data.length >= 64 ? data.readUInt32LE(0x3c) : -1;
    if (
        pe < 64 ||
        pe + 6 > data.length ||
        data.toString('ascii', 0, 2) !== 'MZ' ||
        data.readUInt32LE(pe) !== 0x4550 ||
        data.readUInt16LE(pe + 4) !== 0x8664
    ) {
        throw new Error(`不是有效的 Windows x64 程序或 DLL：${file}`);
    }
}

export function validateWindowsResources(resources) {
    const destinations = new Set();
    for (const [file, destination] of Object.entries(resources)) {
        const key = destination.replaceAll('\\', '/').toLowerCase();
        if (destinations.has(key)) throw new Error(`安装资源目标重名：${destination}`);
        destinations.add(key);
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size === 0) throw new Error(`安装资源为空或不是文件：${file}`);
        if (/\.(dll|exe)$/i.test(destination)) assertX64Binary(file);
    }
    for (const name of REQUIRED_RESOURCES) {
        if (!destinations.has(name.toLowerCase())) throw new Error(`安装包缺少必需资源：${name}`);
    }
}
