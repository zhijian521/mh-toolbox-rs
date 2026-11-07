import type { IconHit } from './skill-panel';

/**
 * 在截图里找「技能图标格子」，把它们与图标库比对。
 *
 * ---- 为什么需要这一步 ----
 * 「主技能」那个版式（米黄菱形七格）**一个技能名都没有**：没点中任何一格，
 * 右侧说明区是空的，屏幕上只有七枚图标 + 七个等级数。等级 OCR 能读到，
 * 但「这个数属于哪一项技能」只能靠图案。
 *
 * ---- 判据为什么不看亮度 ----
 * 面板有两种皮肤：米黄底（亮，图标暗）与深蓝底（暗，图标也暗）。用「比背景暗」
 * 会在深蓝那张上失效——图标与底只差二十几级，稍微换个压缩就糊在一起。
 *
 * 换成**红色占比**：图标一律是红棕/朱红系，`R − max(G, B)` 常年 60~90；
 * 而米黄底是 `(230, 205, 160)`（差 25）、深蓝底是 `(40, 50, 70)`（差 −30）。
 * 这条判据与亮度无关，两张皮肤一次通过。
 *
 * ---- 为什么还要比对图案 ----
 * 红色判据只能找出「红色的方块」，特技那一排空槽也是红棕的。**尺寸与方形都筛不掉
 * 它们**——所以真正的筛子是最后的图案比对：空槽与任何技能图标都不像（实测 < 0.4），
 * 于是自然出局，不必为它写第二套判据。
 */

/** 一个候选方块（截图坐标）。 */
export interface Tile {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 红棕判据的门槛。米黄底 25、深蓝底 −30，图标 60~90，取中间偏下的 45。 */
const RED_MARGIN = 45;
/** 方块内「红」像素占比的下限：图标整块都是红的，空槽也是，文字不是。 */
const FILL_RATIO = 0.5;
/** 与图案比对的最低分。实测正确匹配 0.63~0.81、同门派第二名最高 0.60。 */
const MATCH_FLOOR = 0.5;
/**
 * 对齐搜索的半径（像素）。
 *
 * 必须有这一步：方块的外接框是按「红像素」求的，而图标最外一圈常是暗色描边、
 * 不够红，于是框会**内缩一像素**。图标内部是细密纹样，错一个像素 NCC 就从
 * 0.73 掉到 0.42（实测「周易学」在 `y+1` 上是 0.726、在 `y` 上是 0.418）——
 * 阈值 0.5 正好卡在中间，于是那一项被判成「没认到」。
 *
 * 反过来**不能用外扩代替对齐**：外扩 2px 是 0.370、4px 是 0.268，越扩越差。
 * 正确的做法是原地挪，取最好的那一格。
 */
const SHIFT = 2;
/** 粗筛门槛：0 位移下低于这个分的方块是空槽，不必进位移搜索（省 25 倍工作量）。 */
const SHIFT_FLOOR = 0.35;

/**
 * 找出图里的候选方块。
 *
 * 尺寸不写死：图标在不同截图里是 41×41 到 80×80 不等，所以按**相对图宽**筛
 * （3%~20%），再加两条形状约束（接近方形、内部大部分是红的）。
 */
export function findTiles(image: ImageData): Tile[] {
    const { width, height, data } = image;
    const red = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const r = data[i];
        const max = Math.max(data[i + 1], data[i + 2]);
        red[p] = r - max > RED_MARGIN ? 1 : 0;
    }

    const seen = new Uint8Array(width * height);
    const tiles: Tile[] = [];
    const minSide = Math.max(12, Math.round(width * 0.03));
    const maxSide = Math.round(width * 0.2);
    const stack: number[] = [];

    for (let start = 0; start < red.length; start += 1) {
        if (!red[start] || seen[start]) continue;
        stack.length = 0;
        stack.push(start);
        seen[start] = 1;
        let x0 = width;
        let x1 = -1;
        let y0 = height;
        let y1 = -1;
        let count = 0;
        while (stack.length) {
            const at = stack.pop() as number;
            const x = at % width;
            const y = (at - x) / width;
            count += 1;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
            if (x > 0 && red[at - 1] && !seen[at - 1]) {
                seen[at - 1] = 1;
                stack.push(at - 1);
            }
            if (x + 1 < width && red[at + 1] && !seen[at + 1]) {
                seen[at + 1] = 1;
                stack.push(at + 1);
            }
            if (y > 0 && red[at - width] && !seen[at - width]) {
                seen[at - width] = 1;
                stack.push(at - width);
            }
            if (y + 1 < height && red[at + width] && !seen[at + width]) {
                seen[at + width] = 1;
                stack.push(at + width);
            }
        }

        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
        if (w / h < 0.7 || w / h > 1.4) continue;
        if (count < w * h * FILL_RATIO) continue;
        tiles.push({ x: x0, y: y0, width: w, height: h });
    }
    return tiles;
}

/** 灰度化一小块（最近邻缩放，块本来就是方的，不折腾插值）。 */
function patchGray(image: ImageData, tile: Tile, size: number): Float32Array {
    const out = new Float32Array(size * size);
    const { width, data } = image;
    for (let y = 0; y < size; y += 1) {
        const sy = tile.y + Math.min(tile.height - 1, Math.floor((y * tile.height) / size));
        for (let x = 0; x < size; x += 1) {
            const sx = tile.x + Math.min(tile.width - 1, Math.floor((x * tile.width) / size));
            const at = (sy * width + sx) * 4;
            out[y * size + x] = data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
        }
    }
    return out;
}

/** 归一化互相关（去均值）。0 表示毫无关系，1 表示逐像素一致。 */
export function correlation(a: Float32Array, b: Float32Array): number {
    const n = Math.min(a.length, b.length);
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < n; i += 1) {
        ma += a[i];
        mb += b[i];
    }
    ma /= n;
    mb /= n;
    let dot = 0;
    let aa = 0;
    let bb = 0;
    for (let i = 0; i < n; i += 1) {
        const va = a[i] - ma;
        const vb = b[i] - mb;
        dot += va * vb;
        aa += va * va;
        bb += vb * vb;
    }
    const denom = Math.sqrt(aa * bb);
    return denom > 0 ? dot / denom : 0;
}

/* 模板图缓存：同一个技能在一次识别里只解码一次。
 * 用 Promise 而不是图本身——两块同尺寸的方块会同时要同一张图，存图会解码两遍。 */
const templateCache = new Map<string, Promise<ImageData>>();

async function loadTemplate(url: string, size: number): Promise<Float32Array> {
    const key = `${url}@${size}`;
    let pending = templateCache.get(key);
    if (!pending) {
        pending = (async () => {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('取不到模板像素');
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, 0, 0, size, size);
            return context.getImageData(0, 0, size, size);
        })();
        templateCache.set(key, pending);
    }
    const data = (await pending).data;
    const out = new Float32Array(size * size);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        out[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return out;
}

/**
 * 把图里的图标与「该门派的七项」比对。
 *
 * 只比这七张而不是全部 147 张：门派是从卡上取的（面板上不写门派），147 张里
 * 有大量图案相近的同族图标，只比七张错得少、也快得多。
 *
 * 交给上层的 `IconHit[]` 可能少于七项：认不出的那一格**宁可不给**，
 * 让它显示成「没认到」，也不要拿第二三名去凑。
 */
export async function matchIcons(
    image: ImageData,
    candidates: readonly { name: string; url: string }[],
): Promise<IconHit[]> {
    const tiles = findTiles(image);
    if (!tiles.length || !candidates.length) return [];

    /* 一格一项：同一项技能在一张面板里只出现一次，认出来的两格若指向同一项，
     * 说明至少错了一格，第二格丢弃（`parseSkillPanel` 那边也取分高的那一份）。 */
    const hits: IconHit[] = [];
    const used = new Set<string>();
    for (const tile of tiles) {
        const size = Math.min(tile.width, tile.height);
        const templates = await Promise.all(
            candidates.map(async (candidate) => ({
                name: candidate.name,
                gray: await loadTemplate(candidate.url, size),
            })),
        );

        /* 粗筛：空槽与任何图标都不像（实测 < 0.35），不必再花 25 倍去做对齐搜索。 */
        const center = patchGray(image, tile, size);
        let quick = 0;
        for (const template of templates)
            quick = Math.max(quick, correlation(center, template.gray));
        if (quick < SHIFT_FLOOR) continue;

        let best: { name: string; score: number } | undefined;
        for (let dy = -SHIFT; dy <= SHIFT; dy += 1) {
            for (let dx = -SHIFT; dx <= SHIFT; dx += 1) {
                const moved = {
                    x: tile.x + dx,
                    y: tile.y + dy,
                    width: tile.width,
                    height: tile.height,
                };
                if (moved.x < 0 || moved.y < 0) continue;
                if (moved.x + moved.width > image.width) continue;
                if (moved.y + moved.height > image.height) continue;
                const patch = dx === 0 && dy === 0 ? center : patchGray(image, moved, size);
                for (const template of templates) {
                    const score = correlation(patch, template.gray);
                    if (!best || score > best.score) best = { name: template.name, score };
                }
            }
        }
        if (!best || best.score < MATCH_FLOOR || used.has(best.name)) continue;
        used.add(best.name);
        hits.push({ ...best, box: tile });
    }
    return hits;
}
