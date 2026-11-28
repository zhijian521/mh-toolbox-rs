import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertX64Binary, validateWindowsResources } from './windows-runtime.mjs';

const names = [
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
    'msvcp140.dll',
    'msvcp140_1.dll',
    'vcruntime140.dll',
    'vcruntime140_1.dll',
];

function pe(machine = 0x8664) {
    const data = Buffer.alloc(128);
    data.write('MZ');
    data.writeUInt32LE(64, 0x3c);
    data.writeUInt32LE(0x4550, 64);
    data.writeUInt16LE(machine, 68);
    return data;
}

describe('Windows 安装资源', () => {
    let dir;
    let resources;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-runtime-'));
        resources = {};
        for (const name of names) {
            const file = path.join(dir, name);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, /\.(dll|exe)$/.test(name) ? pe() : 'model');
            resources[file] = name;
        }
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('接受完整资源和 x64 DLL', () => {
        expect(() => validateWindowsResources(resources)).not.toThrow();
    });

    it.each(names)('阻止漏包：%s', (name) => {
        delete resources[path.join(dir, name)];
        expect(() => validateWindowsResources(resources)).toThrow(`缺少必需资源：${name}`);
    });

    it('阻止空模型文件', () => {
        fs.writeFileSync(path.join(dir, names[0]), '');
        expect(() => validateWindowsResources(resources)).toThrow('安装资源为空');
    });

    it.each(['msvcp140.dll', 'models/chat-ncnn/chat-ocr.exe'])(
        '阻止错带 x86 二进制：%s',
        (name) => {
            fs.writeFileSync(path.join(dir, name), pe(0x14c));
            expect(() => validateWindowsResources(resources)).toThrow('不是有效的 Windows x64');
        },
    );

    it.each([Buffer.alloc(0), Buffer.from('MZ'), Buffer.alloc(80, 255)])(
        '截断或损坏的 PE 应正常报错',
        (data) => {
            const file = path.join(dir, 'app.exe');
            fs.writeFileSync(file, data);
            expect(() => assertX64Binary(file)).toThrow('不是有效的 Windows x64');
        },
    );

    it('Windows 路径不区分大小写，目标重名不能悄悄覆盖', () => {
        const file = path.join(dir, 'other.dll');
        fs.writeFileSync(file, pe());
        resources[file] = 'DIRECTML.DLL';
        expect(() => validateWindowsResources(resources)).toThrow('安装资源目标重名');
    });
});
