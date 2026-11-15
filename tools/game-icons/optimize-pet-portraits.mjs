/** 无损压缩现有头像；node tools/game-icons/optimize-pet-portraits.mjs [sharp模块路径]。 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** 每种召唤兽仅保留普通头像，旧编号随对应物种归并，不依赖玩家自定义名字。 */
export function selectPortraits(icons, previous = []) {
    const speciesOf = (icon) => icon.species.replace(/^变异/, '');
    const groups = new Map();
    for (const icon of icons) {
        const species = speciesOf(icon);
        if (!groups.has(species)) groups.set(species, []);
        groups.get(species).push(icon);
    }
    return [...groups].map(([species, entries]) => {
        const ordinary = entries.find(
            (icon) =>
                icon.species === species && icon.name === species && /^pet-\d+$/.test(icon.id),
        );
        if (!ordinary) throw new Error(`缺少普通头像，停止清理：${species}`);
        const aliases = new Set();
        for (const icon of [...entries, ...previous.filter((one) => speciesOf(one) === species)]) {
            aliases.add(icon.id);
            for (const id of icon.aliases ?? []) aliases.add(id);
        }
        aliases.delete(ordinary.id);
        return {
            ...ordinary,
            aliases: [...aliases].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
        };
    });
}

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
    const original = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const catalogue = { ...original, icons: selectPortraits(original.icons) };
    const kept = new Set(catalogue.icons.map((icon) => icon.img));
    const obsolete = original.icons
        .filter((icon) => !kept.has(icon.img))
        .map((icon) => path.join(directory, icon.img));
    const before = original.icons.reduce(
        (total, icon) => total + fs.statSync(path.join(directory, icon.img)).size,
        0,
    );
    let after = 0;
    let converted = 0;
    for (const icon of catalogue.icons) {
        const source = path.join(directory, icon.img);
        const input = fs.readFileSync(source);
        const encoded = await encodePortrait(sharp, sharp(input));
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
    console.log(
        JSON.stringify({
            images: catalogue.icons.length,
            removed: original.icons.length - catalogue.icons.length,
            converted,
            before,
            after,
        }),
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
