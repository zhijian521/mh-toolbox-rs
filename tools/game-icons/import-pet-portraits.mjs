/** 从客户端图鉴及 THX/WPK 导入召唤兽头像，保留原始像素。
 * node tools/game-icons/import-pet-portraits.mjs [客户端目录] [game-icon-extract目录] [具名头像目录] [--download-missing]
 * 解码器使用既有只读提取工程；不执行客户端 Python，只读静态名录和资源。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const load = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const game = args[0] || 'E:/zhijian/mhxy';
const extractor = args[1] || 'E:/zhijian/mh-tool/.workbuddy/game-icon-extract';
const namedSource = args[2] || 'E:/zhijian/梦幻西游端游素材/梦幻西游端游素材/头像';
const download = process.argv.includes('--download-missing');
const sharp = load(path.resolve(extractor, '../../node_modules/sharp'));
const { staticAssignments } = load(path.join(extractor, 'skill-probe.cjs'));
const { walkMarshal } = load(path.join(extractor, 'mapping-probe.cjs'));
const { readManifest } = load(path.join(extractor, 'resource-audit.cjs'));
const { resourcePathHash } = load(path.join(extractor, 'hash-probe.cjs'));
const { decodeContainer } = load(path.join(extractor, 'container.cjs'));
const { decodeVariant } = load(path.join(extractor, 'was-variants.cjs'));
const root = path.resolve(directory, '../..');

async function main() {
    const modules = JSON.parse(
        fs.readFileSync(path.join(extractor, 'mapping-probe.json')),
    ).filenames;
    function readModule(entry) {
        const index = fs.readFileSync(path.join(game, 'res/mhimage.idx'));
        let record;
        for (let i = 0; i < index.readUInt32LE(12); i++) {
            const at = 32 + i * 28;
            if (index.subarray(at, at + 16).toString('hex') === entry.id) {
                record = index.subarray(at, at + 28);
                break;
            }
        }
        if (!record) throw new Error(`客户端缺少静态表：${entry.filename}`);
        const file = path.join(game, `res/mhimage${record.readUInt16LE(24)}.wpk`);
        const bytes = Buffer.alloc(record.readUInt32LE(16));
        const fd = fs.openSync(file, 'r');
        try {
            fs.readSync(fd, bytes, 0, bytes.length, record.readUInt32LE(20));
        } finally {
            fs.closeSync(fd);
        }
        const decoded = decodeContainer(bytes).value;
        if (crypto.createHash('md5').update(decoded).digest('hex') !== entry.id)
            throw new Error('静态表摘要不符');
        const data = Buffer.from(decoded);
        for (let i = 0; i < Math.min(100, data.length); i++) data[i] ^= 0x53;
        data.reverse();
        const parsed = walkMarshal(data);
        if (parsed.error || parsed.offset !== data.length) throw new Error('静态表读取不完整');
        return parsed;
    }
    function table(file, offset = 0) {
        const parsed = readModule(modules.find((entry) => entry.filename?.endsWith('\\' + file)));
        const code = parsed.codeObjects[0];
        return staticAssignments({
            ...code,
            bytecodeHex: code.code.raw.subarray(offset).toString('hex'),
        }).names;
    }
    const guide = table('datasumguide2022.py');
    const names = new Map(
        [...guide.SumInfo].filter(
            ([shape]) => guide.SumInfoEx.get(shape)?.[guide.gName2Idx.get('CarryType')] !== '孩子',
        ),
    );
    // infophoto 的前导部分是 import，首个 BUILD_MAP 开始才是纯静态 PhotoMap。
    const photoModule = readModule(
        modules.find((entry) => entry.filename?.endsWith('\\infophoto.py')),
    );
    const photoCode = photoModule.codeObjects[0];
    const start = photoCode.code.raw.indexOf(Buffer.from('8100670367049801', 'hex'));
    if (start < 0 || names.size < 1) throw new Error('客户端名录或头像映射格式已改变');
    const photoMap = table('infophoto.py', start).PhotoMap;
    const resources = new Map();
    for (const dir of ['thd', 'client0/thd', 'thdext1']) {
        const file = path.join(game, dir, 'wzife.thx');
        if (!fs.existsSync(file)) continue;
        const { value } = readManifest(file);
        for (let i = 0; i < value.readUInt32LE(0); i++) {
            const at = 4 + i * 24;
            const hash = value.readUInt32LE(at);
            const md5 = value.subarray(at + 8, at + 24).toString('hex');
            if (!resources.has(hash)) resources.set(hash, []);
            resources.get(hash).push(md5);
        }
    }
    const local = new Map();
    for (const dir of ['res', 'client0/res']) {
        for (const filename of fs
            .readdirSync(path.join(game, dir))
            .filter((file) => file.endsWith('.idx'))) {
            const index = fs.readFileSync(path.join(game, dir, filename));
            if (index.toString('latin1', 0, 4) !== 'SKPW') continue;
            for (let i = 0; i < index.readUInt32LE(12); i++) {
                const at = 32 + i * 28;
                const md5 = index.subarray(at, at + 16).toString('hex');
                if (local.has(md5)) continue;
                const packFile = path.join(
                    game,
                    dir,
                    filename.replace('.idx', index.readUInt16LE(at + 24) + '.wpk'),
                );
                if (!fs.existsSync(packFile)) continue;
                local.set(md5, {
                    size: index.readUInt32LE(at + 16),
                    offset: index.readUInt32LE(at + 20),
                    file: packFile,
                });
            }
        }
    }
    // 流式客户端更新 idx 后，旧 WPK 中仍留有已解包资源；只接受校验过的历史位置。
    const audit = JSON.parse(fs.readFileSync(path.join(extractor, 'package-audit.json')));
    for (const pkg of audit.packages) {
        for (const entry of pkg.entries || []) {
            const file = path.join(game, entry.source);
            if (!local.has(entry.id) && entry.contentVerified && fs.existsSync(file)) {
                local.set(entry.id, { file, offset: entry.offset, size: entry.size });
            }
        }
    }
    const out = path.join(root, 'public/game/icons/pet-portrait');
    fs.mkdirSync(out, { recursive: true });
    const cache = path.join(root, '.runtime/pet-portrait-resources');
    fs.mkdirSync(cache, { recursive: true });
    const pending = new Map();
    let downloaded = 0;
    function resource(md5) {
        if (pending.has(md5)) return pending.get(md5);
        const task = (async () => {
            const decode = (raw, origin) => {
                try {
                    const value = decodeContainer(raw).value;
                    if (crypto.createHash('md5').update(value).digest('hex') !== md5) return null;
                    return { value, origin };
                } catch {
                    return null;
                }
            };
            const entry = local.get(md5);
            if (entry) {
                const fd = fs.openSync(entry.file, 'r');
                const bytes = Buffer.alloc(entry.size);
                try {
                    fs.readSync(fd, bytes, 0, bytes.length, entry.offset);
                } finally {
                    fs.closeSync(fd);
                }
                const result = decode(bytes, '本地客户端');
                if (result) return result;
            }
            const file = path.join(cache, md5);
            if (fs.existsSync(file)) {
                const result = decode(fs.readFileSync(file), '官方客户端资源');
                if (result) return result;
            }
            if (!download) return null;
            // 地址来自客户端 cloud.json；路径格式来自客户端下载日志，不通过名称猜图。
            const url = `https://xyq.gsf.netease.com/xyq_all/dynamic/${md5.slice(0, 2)}/${md5.slice(2)}`;
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
                if (!response.ok) return null;
                const bytes = Buffer.from(await response.arrayBuffer());
                const result = decode(bytes, '官方客户端资源');
                if (!result) return null;
                fs.writeFileSync(file, bytes);
                downloaded++;
                if (downloaded % 50 === 0) console.log(`已补齐 ${downloaded} 份官方头像资源`);
                return result;
            } catch {
                return null;
            }
        })();
        pending.set(md5, task);
        return task;
    }
    const icons = [],
        missing = [];
    const queue = names.entries();
    await Promise.all(
        Array.from({ length: 4 }, async () => {
            for (const [shape, name] of queue) {
                if (shape < 2000) continue; // 孩子有单独系统，不混入召唤兽头像选择。
                let mapped = shape;
                if (shape >= 2500 && shape < 3000 && shape !== 2508) mapped -= 500;
                if (shape >= 12000 && shape < 17000 && shape % 1000 >= 500) mapped -= 500;
                mapped = photoMap?.get(mapped) ?? mapped;
                for (const variant of ['', '_1']) {
                    let found = false;
                    const seen = new Set();
                    for (const id of [shape, mapped]) {
                        if (seen.has(id)) continue;
                        seen.add(id);
                        for (const family of [
                            'newphoto/npc50',
                            'photo/facesmall',
                            'photo/sum',
                            'newphoto/npc44',
                            'newphoto/npc',
                            'photo/npc',
                        ]) {
                            const resourcePath = `${family}/${String(id).padStart(4, '0')}${variant}.tcp`;
                            const hashes = resources.get(resourcePathHash(resourcePath)) || [];
                            for (const md5 of hashes) {
                                const result = await resource(md5);
                                if (!result) continue;
                                const { value, origin } = result;
                                let image;
                                if (value.toString('latin1', 0, 2) === 'RP') {
                                    const png = value.indexOf(
                                        Buffer.from('89504e470d0a1a0a', 'hex'),
                                    );
                                    if (png < 0) continue;
                                    const decoded = await sharp(value.subarray(png))
                                        .ensureAlpha()
                                        .raw()
                                        .toBuffer({ resolveWithObject: true });
                                    image = {
                                        rgba: decoded.data,
                                        width: decoded.info.width,
                                        height: decoded.info.height,
                                    };
                                } else image = decodeVariant(value);
                                const key = `pet-${shape}${variant.replace('_', '-')}`;
                                await sharp(image.rgba, {
                                    raw: { width: image.width, height: image.height, channels: 4 },
                                })
                                    .png()
                                    .toFile(path.join(out, key + '.png'));
                                icons.push({
                                    id: key,
                                    name: name + (variant ? '·进阶' : ''),
                                    species: name,
                                    img: key + '.png',
                                    width: image.width,
                                    height: image.height,
                                    resourcePath,
                                    resourceMd5: md5,
                                    origin,
                                });
                                found = true;
                                break;
                            }
                            if (found) break;
                        }
                        if (found) break;
                    }
                    if (!found && !variant) missing.push({ shape, name });
                }
            }
        }),
    );
    // 已具名的解包立绘补充老客户端没有缓存的小头像。裁透明画布，保留原始画稿。
    const normalize = (name) =>
        name
            .replace(/^[^\p{Script=Han}]+/u, '')
            .replace(/超级|经典|默认|半身像|\d|\s/g, '')
            .replace(/[（(].*?[）)]/g, '');
    const species = [...new Set([...names.values()].filter((name) => !name.startsWith('变异')))];
    if (fs.existsSync(namedSource)) {
        for (const file of fs.readdirSync(namedSource).filter((name) => /\.png$/i.test(name))) {
            const label = normalize(path.parse(file).name);
            const advanced = label.startsWith('进阶');
            const matches = species.filter(
                (name) => normalize(name) === label.replace(/^进阶/, ''),
            );
            if (matches.length !== 1) continue;
            const name = matches[0];
            const input = fs.readFileSync(path.join(namedSource, file));
            const id = `portrait-${crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)}`;
            const image = await sharp(input)
                .trim({ background: '#00000000', threshold: 1 })
                .png()
                .toBuffer({ resolveWithObject: true });
            fs.writeFileSync(path.join(out, id + '.png'), image.data);
            icons.push({
                id,
                name: name + (advanced ? '·进阶立绘' : '·立绘'),
                species: name,
                img: id + '.png',
                width: image.info.width,
                height: image.info.height,
                source: `已解包素材/头像/${file}`,
            });
        }
    }
    const unavailable = missing.filter(
        (entry) => !icons.some((icon) => icon.species === entry.name),
    );
    const files = new Set(icons.map((icon) => icon.img));
    for (const file of fs.readdirSync(out)) {
        if (/^(?:pet-[\d-]+|portrait-[a-f\d]+)\.png$/.test(file) && !files.has(file)) {
            fs.unlinkSync(path.join(out, file));
        }
    }
    fs.writeFileSync(
        path.join(root, 'public/game/data/pet-portraits.json'),
        JSON.stringify(
            {
                schemaVersion: 1,
                'generated-by': 'tools/game-icons/import-pet-portraits.mjs',
                sources: [
                    'datasumguide2022.py / SumInfo',
                    'infophoto.py / PhotoMap',
                    'wzife.thx / 本地 WPK',
                    'https://xyq.gsf.netease.com/xyq_all/dynamic/ / 客户端 cloud.json',
                    '已具名解包头像',
                ],
                icons: icons.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
                missing: unavailable.sort((a, b) => a.shape - b.shape),
            },
            null,
            4,
        ) + '\n',
    );
    console.log(`已导入 ${icons.length} 张头像；${unavailable.length} 个名录条目缺本地资源`);
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
