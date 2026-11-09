/** 辅助技能图标按金色、蓝色及粉红色边框定位，再与现有游戏原图比对。 */
export interface Tile {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface IconHit {
    name: string;
    score: number;
    box: Tile;
}

const MATCH_FLOOR = 0.6;
const MATCH_MARGIN = 0.06;
const SHIFT = 2;

export function findTiles(image: ImageData): Tile[] {
    const { width, height, data } = image;
    const colored = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const red = r - Math.max(g, b) > 45;
        const gold = r - b > 45 && g - b > 25 && r > 90 && g > 60;
        const blue = b - r > 35 && g - r > 20 && b > 85;
        colored[p] = red || gold || blue ? 1 : 0;
    }

    const seen = new Uint8Array(width * height);
    const tiles: Tile[] = [];
    const minSide = Math.max(12, Math.round(Math.min(width, height) * 0.025));
    const maxSide = Math.round(Math.min(width, height) * 0.25);
    const stack: number[] = [];

    for (let start = 0; start < colored.length; start += 1) {
        if (!colored[start] || seen[start]) continue;
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
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            // 金色图标边框较细，角点按八邻域连接，避免拆成四条边。
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const next = ny * width + nx;
                    if (!colored[next] || seen[next]) continue;
                    seen[next] = 1;
                    stack.push(next);
                }
            }
        }

        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
        if (w / h < 0.8 || w / h > 1.25) continue;
        if (count < w * h * 0.12) continue;
        // 客户端图标是正方形；暗色底边会被颜色掩码漏掉，不能把剩余部分拉伸比对。
        const side = Math.max(w, h);
        if (x0 + side > width || y0 + side > height) continue;
        tiles.push({ x: x0, y: y0, width: side, height: side });
    }
    return tiles;
}

interface Appearance {
    color?: boolean;
    inset?: number;
    ignoreTopLeft?: number;
}

export function iconSignature(
    image: ImageData,
    tile: Tile,
    size: number,
    appearance: Appearance = {},
): Float32Array {
    const out = new Float32Array(size * size * (appearance.color ? 3 : 1));
    let length = 0;
    const { width, data } = image;
    const inset = Math.max(0, Math.min(0.25, appearance.inset ?? 0));
    for (let y = 0; y < size; y += 1) {
        const py = inset + (y / size) * (1 - inset * 2);
        const sy = tile.y + Math.min(tile.height - 1, Math.floor(py * tile.height));
        for (let x = 0; x < size; x += 1) {
            const px = inset + (x / size) * (1 - inset * 2);
            if (px < (appearance.ignoreTopLeft ?? 0) && py < (appearance.ignoreTopLeft ?? 0))
                continue;
            const sx = tile.x + Math.min(tile.width - 1, Math.floor(px * tile.width));
            const at = (sy * width + sx) * 4;
            if (appearance.color) {
                out[length++] = data[at];
                out[length++] = data[at + 1];
                out[length++] = data[at + 2];
            } else out[length++] = data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
        }
    }
    if (appearance.color && length) {
        // 每个通道分别去掉底色，避免共同的金色背景压过蓝 / 红技能图案的差异。
        const means = [0, 0, 0];
        for (let i = 0; i < length; i++) means[i % 3] += out[i];
        for (let channel = 0; channel < 3; channel++) means[channel] /= length / 3;
        for (let i = 0; i < length; i++) out[i] -= means[i % 3];
    }
    return out.subarray(0, length);
}

export function correlation(a: Float32Array, b: Float32Array): number {
    const n = Math.min(a.length, b.length);
    if (!n) return 0;
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

const templateCache = new Map<string, Promise<Float32Array>>();

function loadTemplate(url: string, size: number, appearance: Appearance): Promise<Float32Array> {
    const key = `${url}@${size}:${JSON.stringify(appearance)}`;
    const cached = templateCache.get(key);
    if (cached) return cached;
    const pending = (async () => {
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
        const pixels = context.getImageData(0, 0, size, size);
        return iconSignature(pixels, { x: 0, y: 0, width: size, height: size }, size, appearance);
    })().catch((error) => {
        templateCache.delete(key);
        throw error;
    });
    templateCache.set(key, pending);
    return pending;
}

export async function matchIcons(
    image: ImageData,
    candidates: readonly { name: string; url: string }[],
    options: {
        tiles?: Tile[];
        floor?: number;
        margin?: number;
        sampleSize?: number;
        appearance?: Appearance;
    } = {},
): Promise<IconHit[]> {
    const tiles = options.tiles ?? findTiles(image);
    if (!tiles.length || !candidates.length) return [];
    const hits: IconHit[] = [];
    const appearance = options.appearance ?? {};
    for (const tile of tiles) {
        const size = Math.min(tile.width, tile.height, options.sampleSize ?? Infinity);
        const loaded = await Promise.allSettled(
            candidates.map(async (candidate) => ({
                name: candidate.name,
                gray: await loadTemplate(candidate.url, size, appearance),
            })),
        );
        const templates = loaded.flatMap((one) => (one.status === 'fulfilled' ? [one.value] : []));
        const scores = new Map<string, number>();
        const center = iconSignature(image, tile, size, appearance);
        for (const template of templates) {
            scores.set(template.name, correlation(center, template.gray));
        }
        if (![...scores.values()].some((score) => score >= 0.35)) continue;

        for (let dy = -SHIFT; dy <= SHIFT; dy += 1) {
            for (let dx = -SHIFT; dx <= SHIFT; dx += 1) {
                const moved = { ...tile, x: tile.x + dx, y: tile.y + dy };
                if (moved.x < 0 || moved.y < 0) continue;
                if (moved.x + moved.width > image.width) continue;
                if (moved.y + moved.height > image.height) continue;
                const patch =
                    dx === 0 && dy === 0 ? center : iconSignature(image, moved, size, appearance);
                for (const template of templates) {
                    const score = correlation(patch, template.gray);
                    scores.set(template.name, Math.max(scores.get(template.name) ?? 0, score));
                }
            }
        }
        const ranked = [...scores].sort((a, b) => b[1] - a[1]);
        const best = ranked[0];
        if (!best || best[1] < (options.floor ?? MATCH_FLOOR)) continue;
        // 两个图案过于接近时不猜，避免把一个技能的等级写给另一个技能。
        if (ranked[1] && best[1] - ranked[1][1] < (options.margin ?? MATCH_MARGIN)) continue;
        hits.push({ name: best[0], score: best[1], box: tile });
    }
    const used = new Set<string>();
    return hits
        .sort((a, b) => b.score - a.score)
        .filter((hit) => {
            if (used.has(hit.name)) return false;
            used.add(hit.name);
            return true;
        });
}
