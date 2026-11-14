/** 无损压缩现有头像；node tools/game-icons/optimize-pet-portraits.mjs [sharp模块路径]。 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** 保留原尺寸，PNG / 无损 WebP 中取较小者；解码 RGBA 必须逐字节相同。 */
export async function encodePortrait(sharp, image) {
    const png = await image
        .clone()
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    const webp = await image.clone().webp({ lossless: true, effort: 6 }).toBuffer();
    if (webp.length < png.length) {
        const original = await image.clone().ensureAlpha().raw().toBuffer();
        const decoded = await sharp(webp).ensureAlpha().raw().toBuffer();
        if (original.equals(decoded)) return { data: webp, extension: '.webp' };
    }
    return { data: png, extension: '.png' };
}

async function main() {
    const load = createRequire(import.meta.url);
    const sharp = load(process.argv[2] ? path.resolve(process.argv[2]) : 'sharp');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const directory = path.join(root, 'public/game/icons/pet-portrait');
    const manifest = path.join(root, 'public/game/data/pet-portraits.json');
    const catalogue = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const obsolete = [];
    let before = 0;
    let after = 0;
    let converted = 0;
    for (const icon of catalogue.icons) {
        const source = path.join(directory, icon.img);
        const input = fs.readFileSync(source);
        const encoded = await encodePortrait(sharp, sharp(input));
        before += input.length;
        if (encoded.data.length >= input.length) {
            after += input.length;
            continue;
        }
        const img = icon.id + encoded.extension;
        fs.writeFileSync(path.join(directory, img), encoded.data);
        if (icon.img !== img) obsolete.push(source);
        icon.img = img;
        after += encoded.data.length;
        converted++;
    }
    fs.writeFileSync(manifest, JSON.stringify(catalogue, null, 4) + '\n');
    // 新资源和清单都已写完，才删被替代的原文件；稳定编号与来源元数据不变。
    for (const file of obsolete) fs.unlinkSync(file);
    console.log(JSON.stringify({ images: catalogue.icons.length, converted, before, after }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
