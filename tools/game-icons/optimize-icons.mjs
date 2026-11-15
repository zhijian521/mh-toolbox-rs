/** 无损重编码现有图标；node tools/game-icons/optimize-icons.mjs [sharp模块路径] [--only=目录,...]。 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const digest = (data) => createHash('sha256').update(data).digest('hex');
// 这四张有独立的纠错来源摘要，其余原图继续由 resourceMd5 / provenance 追溯。
const CORRECTED_IDS = new Set(['302', '310', '402', '410']);

/** 只采用更小且解码 RGBA 与尺寸完全一致的同格式静态图片。 */
export async function encodeIcon(sharp, input) {
    const image = sharp(input);
    const metadata = await image.metadata();
    if (
        !['png', 'webp'].includes(metadata.format) ||
        (metadata.pages ?? 1) > 1 ||
        (metadata.depth && metadata.depth !== 'uchar') ||
        metadata.orientation ||
        metadata.icc
    )
        return input;
    const candidates =
        metadata.format === 'png'
            ? [
                  await image
                      .clone()
                      .png({ compressionLevel: 9, adaptiveFiltering: true })
                      .toBuffer(),
                  await image
                      .clone()
                      .png({
                          compressionLevel: 9,
                          palette: true,
                          colours: 256,
                          dither: 0,
                          effort: 10,
                      })
                      .toBuffer(),
              ]
            : [await image.clone().webp({ lossless: true, effort: 6 }).toBuffer()];
    const smaller = candidates
        .filter((candidate) => candidate.length < input.length)
        .sort((a, b) => a.length - b.length);
    if (!smaller.length) return input;
    const original = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const candidate of smaller) {
        const decoded = await sharp(candidate)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        if (
            original.info.width === decoded.info.width &&
            original.info.height === decoded.info.height &&
            original.info.channels === decoded.info.channels &&
            original.data.equals(decoded.data)
        )
            return candidate;
    }
    return input;
}

/** 头像沿用独立工具；先完成全部编码与像素比对，再替换图标及文件摘要。 */
export async function optimizeIcons(sharp, root, only = []) {
    const directory = path.join(root, 'public/game/icons');
    const manifest = path.join(root, 'public/game/data/pet-skills.json');
    const catalogue = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const skills = new Map(
        catalogue.icons.map((icon) => {
            const category = catalogue.categories.find((one) => one.id === icon.categoryId);
            return [`${category.iconDir}/${icon.img}`, icon];
        }),
    );
    const directories = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'pet-portrait');
    for (const name of only) {
        if (!directories.some((entry) => entry.name === name))
            throw new Error(`未知图标目录：${name}`);
    }
    const changes = [];
    const groups = {};
    let manifestChanged = false;
    for (const entry of directories) {
        if (only.length && !only.includes(entry.name)) continue;
        const group = (groups[entry.name] = { images: 0, changed: 0, before: 0, after: 0 });
        for (const file of fs.readdirSync(path.join(directory, entry.name))) {
            if (!/\.(png|webp|gif)$/i.test(file)) continue;
            const relative = `${entry.name}/${file}`;
            const target = path.join(directory, relative);
            const input = fs.readFileSync(target);
            const skill = skills.get(relative);
            if (skill && skill.sha256 !== digest(input))
                throw new Error(`文件摘要不符，停止压缩：${relative}`);
            // GIF 保持原字节；PNG / WebP 内部的多帧文件由编码器跳过。
            const output = /\.gif$/i.test(file) ? input : await encodeIcon(sharp, input);
            group.images++;
            group.before += input.length;
            group.after += output.length;
            if (skill) {
                if (CORRECTED_IDS.has(skill.id) && !skill.sourceSha256) {
                    skill.sourceSha256 = skill.sha256;
                    manifestChanged = true;
                }
                if (output !== input) {
                    skill.sha256 = digest(output);
                    manifestChanged = true;
                }
            }
            if (output === input) continue;
            group.changed++;
            changes.push({ target, output });
        }
    }
    for (const { target, output } of changes) fs.writeFileSync(target, output);
    if (manifestChanged)
        fs.writeFileSync(
            manifest,
            (JSON.stringify(catalogue, null, 4) + '\n').replace(/\n/g, '\r\n'),
        );
    return {
        ...Object.values(groups).reduce(
            (total, group) => {
                for (const key of Object.keys(total)) total[key] += group[key];
                return total;
            },
            { images: 0, changed: 0, before: 0, after: 0 },
        ),
        groups,
    };
}

async function main() {
    const args = process.argv.slice(2);
    const modulePath = args.find((arg) => !arg.startsWith('--'));
    const load = createRequire(import.meta.url);
    const sharp = load(modulePath ? path.resolve(modulePath) : 'sharp');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const only =
        args
            .find((arg) => arg.startsWith('--only='))
            ?.slice(7)
            .split(',') ?? [];
    const result = await optimizeIcons(sharp, root, only);
    fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });
    fs.writeFileSync(
        path.join(root, '.runtime/icon-optimization.json'),
        JSON.stringify(result, null, 4),
    );
    console.log(JSON.stringify(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
