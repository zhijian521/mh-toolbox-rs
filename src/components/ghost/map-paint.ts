import type { GhostPlan } from '../../services/ghost-model';

/**
 * 地图怎么画。
 *
 * 从 `MapCanvas.vue` 里拆出来的：那个组件原本 540 行，`draw()` 一个函数就 320 行，
 * 里面塞了取色、四种模式的绘制、标签避让。拆开之后责任很清楚——组件只管
 * **什么时候画**（尺寸、dpr、观察者、生命周期），这里只管**画出来什么**，
 * 而且这里不碰 Vue：入参进、像素出。加一个新模式不必读懂另外三个。
 *
 * 几何全部按**画布尺寸**重算，不复用 `ghost-model` 的像素结果——后者按底图原始
 * 尺寸算，而画布是等比缩放的，直接套会错位。唯一共用的是「坐标 → 比例」这一步。
 */

/** 底图坐标 → 画布坐标。`paintMap` 里每个模式都从这一份换算出发。 */
export interface Layout {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function project(layout: Layout, map: { maxX: number; maxY: number }, x: number, y: number) {
    return {
        px: layout.left + (x / map.maxX) * layout.width,
        // y 轴翻转：坐标系原点在左下角，画布原点在左上角。
        py: layout.top + layout.height - (y / map.maxY) * layout.height,
    };
}

const FONT_FAMILY = '"LXGW WenKai Screen", "Microsoft YaHei", sans-serif';

/**
 * 把 CSS 变量解析成 canvas 能用的颜色与字号。
 *
 * **不能直接 `getPropertyValue('--cinnabar')`**：`tokens.css` 里这些变量的值是
 * `light-dark(#a8322b, #d0755f)`，而 `getPropertyValue` 返回的是**原始 token 序列**，
 * 不做函数求值。把它塞给 `ctx.strokeStyle` 是个非法颜色，canvas 会**静默忽略**
 * ——保持上一次的样式，于是所有框线都画成了默认黑。这个坑很阴：不报错，只是颜色不对。
 *
 * 所以借一个不可见的探针元素：把变量当 `color` / `font-size` 用一次，浏览器才会真的
 * 求值（`light-dark()` 依赖元素继承到的 `color-scheme`），再从 computed style 读回。
 *
 * 字号同理走令牌：早先这里写死 `12px` / `13.5px`，于是设置页把字号调到「较大」时
 * 地图上的标签是唯一不跟着变的一块，看着像被落下了。
 */
export interface MapColors {
    cinnabar: string;
    mapSeal: string;
    mapSealInk: string;
    mapHalo: string;
    wash: string;
    washEdge: string;
    hot: string;
    hotEdge: string;
    paper: string;
    ink: string;
    rule: string;
    /** 标签字体串（`--fs-sm`），已含字体族，可直接赋给 `ctx.font`。 */
    fontLabel: string;
    /** 开眼坐标字体串（`--fs-base`），比标签大一档，理由见 `paintMap` 里那段。 */
    fontExact: string;
}

let colorCache: { key: string; colors: MapColors } | null = null;

export function resolveColors(dark: boolean): MapColors {
    // 缓存键要带 `--fs-scale`：只按主题缓存的话，用户把字号调大一档之后地图上的
    // 标签仍是旧字号，得等切一次主题才更新。
    const scale = getComputedStyle(document.documentElement).getPropertyValue('--fs-scale').trim();
    const key = `${dark ? 'dark' : 'light'}:${scale || '1'}`;
    if (colorCache?.key === key) return colorCache.colors;

    const probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.append(probe);
    const readColor = (name: string): string => {
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
    };
    /** computed 的 `font-size` 恒是 px，可以直接拼进 canvas 字体串。 */
    const readFont = (name: string): string => {
        probe.style.fontSize = `var(${name})`;
        return `${getComputedStyle(probe).fontSize} ${FONT_FAMILY}`;
    };
    const colors: MapColors = {
        cinnabar: readColor('--cinnabar'),
        mapSeal: readColor('--map-seal'),
        mapSealInk: readColor('--map-seal-ink'),
        mapHalo: readColor('--map-halo'),
        wash: readColor('--ghost-wash'),
        washEdge: readColor('--ghost-wash-edge'),
        hot: readColor('--ghost-hot'),
        hotEdge: readColor('--ghost-hot-edge'),
        paper: readColor('--paper'),
        ink: readColor('--ink'),
        rule: readColor('--rule-2'),
        fontLabel: readFont('--fs-sm'),
        fontExact: readFont('--fs-base'),
    };
    probe.remove();

    colorCache = { key, colors };
    return colors;
}

export interface PaintInput {
    plan: GhostPlan;
    layout: Layout;
    bitmap: HTMLImageElement;
    colors: MapColors;
    /** 暗色下两层红要更浓一点（见 `tint` 的 alpha），所以绘制要知道当前主题。 */
    dark: boolean;
}

/**
 * 一张地图：底图 + 底下那圈边 + 该模式要画的标记。
 *
 * 调用方负责「画布已按 dpr 缩放、已清空」，这里从画底图开始。
 */
export function paintMap(ctx: CanvasRenderingContext2D, input: PaintInput): void {
    const { plan, layout, bitmap, colors, dark } = input;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, layout.left, layout.top, layout.width, layout.height);

    // 底图外面那圈是自己加的底：地图边缘是深色地形，与同样深的面板看不出边界。
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.left + 0.5, layout.top + 0.5, layout.width - 1, layout.height - 1);

    // 画不出来时把地形留着、框全部不画：空白比「一张能看但没有标记的地图」更没用，
    // 而一个位置错误的框比两者都糟。原因由模板里的覆盖文字说明。
    if (plan.mode === 'invalid') return;

    const map = plan.map;
    const { cinnabar, mapSeal, mapSealInk, mapHalo, wash, washEdge, hot, hotEdge, paper, ink } =
        colors;
    const FONT = colors.fontLabel;
    /* 开眼时的坐标比标签大一档：它是这一屏唯一要照着走的数字，而且写在地形上、
     * 没有底板托着，小一号就压不住背景的杂色。 */
    const FONT_EXACT = colors.fontExact;
    const PAD_X = 4;
    const PAD_Y = 3;
    const BOX_H = 18;

    interface LabelBox {
        x: number;
        y: number;
        w: number;
        h: number;
    }

    /**
     * 落一个标签。
     *
     * 每个 plan 上最多一个标签（坐标，或「整层」那句话），所以不需要避让逻辑——
     * 早先范围框自带两枚说明文字时才需要。留着的只有「夹进地图矩形」这一步：
     * 坐标可以贴到图的最上沿或最右沿，标签按原样画会落到留白上，变成飘着的一行字。
     */
    const placeLabel = (
        text: string,
        x: number,
        y: number,
        w: number,
        color: string,
        border: boolean,
    ) => {
        const box: LabelBox = {
            x: Math.min(Math.max(x, layout.left + 2), layout.left + layout.width - w - 2),
            y: Math.min(Math.max(y, layout.top + 2), layout.top + layout.height - BOX_H - 2),
            w,
            h: BOX_H,
        };

        ctx.save();
        ctx.font = FONT;
        // 标签底：地图本身颜色杂，纯文字在任何位置都可能与地形撞色。
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = paper;
        ctx.fillRect(box.x, box.y, box.w, BOX_H);
        ctx.restore();

        if (border) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, BOX_H - 1);
        }
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(text, box.x + PAD_X, box.y + PAD_Y);
    };

    /** 带边框的说明标签：给一个锚点，自己量宽、自己找位置。 */
    const label = (text: string, x: number, y: number, color: string, align: 'left' | 'right') => {
        ctx.font = FONT;
        const w = ctx.measureText(text).width + PAD_X * 2;
        placeLabel(text, align === 'left' ? x : x - w, y - 12 - PAD_Y, w, color, true);
    };

    if (plan.mode === 'range') {
        const { official, likely } = plan.range;
        const topLeft = project(layout, map, official.x0, official.y1);
        const bottomRight = project(layout, map, official.x1, official.y0);
        const width = bottomRight.px - topLeft.px;
        const height = bottomRight.py - topLeft.py;

        /**
         * 半透明铺块。
         *
         * 不铺实色：这张图上真正用来缩小范围的是地形（洞口、通道、水陆分界），
         * 盖死等于把唯一的线索抹掉。原先给到 0.62 / 0.70，看着「有块红」，代价是
         * 整片地形只剩一团糊——而玩家要做的恰恰是照着地形走过去，范围只是入口。
         * 现在压到 0.24 / 0.42：**范围的边界交给 `edge` 的 2px 线，填充只表示
         * 「这一片」，不承担识别**。两层仍靠明度差区分，alpha 逐块控制。
         */
        const tint = (x: number, y: number, w: number, h: number, color: string, alpha: number) => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        };

        /**
         * 2px 实线边框。
         *
         * 填充压到两成出头之后，**这一圈线就是范围唯一的凭据**，所以从 1px 加到 2px：
         * 1px 在写实地形上会被树丛、山棱的线条吃掉，读起来像地图自带的一格。
         *
         * 两层都用实线、靠**颜色深浅**区分，不靠线型：虚线会与树丛、小路的纹理打架。
         */
        const edge = (x: number, y: number, w: number, h: number, color: string) => {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            // 2px 线沿着 0.5 偏移会糊到两个像素各一半，偏移 1 才是内外各占 1px 的实线。
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            ctx.restore();
        };

        // 官方 ±50：浅红底。这是「规则给的」那一层，只负责「这一片有鬼」。
        tint(topLeft.px, topLeft.py, width, height, wash, dark ? 0.3 : 0.24);
        edge(topLeft.px, topLeft.py, width, height, washEdge);

        if (likely) {
            const innerTop = project(layout, map, likely.x0, likely.y1);
            const innerBottom = project(layout, map, likely.x1, likely.y0);
            const innerWidth = innerBottom.px - innerTop.px;
            const innerHeight = innerBottom.py - innerTop.py;

            // 高概率区域：深红底。比浅红浓一倍，压在浅红里能读成「同一块地里的内芯」，
            // 而不是另一个不相干的框。
            tint(innerTop.px, innerTop.py, innerWidth, innerHeight, hot, dark ? 0.48 : 0.42);
            edge(innerTop.px, innerTop.py, innerWidth, innerHeight, hotEdge);
        }
    }

    if (plan.mode === 'whole') {
        // 没有坐标域：整层都是候选。
        //
        // 不铺满色。铺满会盖住地形，而这张图恰恰是全程唯一没有别的收敛手段的一张，
        // 图上的地形（洞口、通道、水陆分界）就是用户唯一能用来缩小范围的东西。
        // 改成「只描边 + 一句话」：边说明「范围是整幅」，话说明「为什么只能这样」。
        ctx.save();
        // 这道白线用纸白（`--map-halo`）而不是 `rgba(255,255,255,0.78)`：底图是截图、
        // 不随主题翻面，而纯白在这套暖纸语言里是唯一一处冷色。
        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = mapHalo;
        ctx.lineWidth = 4;
        ctx.strokeRect(layout.left + 2, layout.top + 2, layout.width - 4, layout.height - 4);
        ctx.restore();

        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = cinnabar;
        ctx.lineWidth = 2;
        ctx.strokeRect(layout.left + 2, layout.top + 2, layout.width - 4, layout.height - 4);
        ctx.restore();

        label(
            '整层都要找 · 没有坐标域',
            layout.left + layout.width - 5,
            layout.top + layout.height - 30,
            cinnabar,
            'right',
        );
    }

    if (plan.mode === 'range' || plan.mode === 'exact') {
        const rawX = plan.mode === 'range' ? plan.range.x.value : plan.x;
        const rawY = plan.mode === 'range' ? plan.range.y.value : plan.y;
        // 假坐标可以落在值域外：游戏按真实位置 ±50 随机，不按地图边界裁剪，
        // 所以真身贴边时提示坐标本身就越界（普陀山 96×72 读到 100,66）。
        // 按**贴边**画，并在数字后面标「图外」——画在边缘说的是「就在那条边上」，
        // 而丢掉这条任务或把标记画到图上外面，都是在丢信息。
        const outside = rawX > map.maxX || rawY > map.maxY;
        const { px, py } = project(
            layout,
            map,
            Math.min(Math.max(rawX, 0), map.maxX),
            Math.min(Math.max(rawY, 0), map.maxY),
        );

        // 裁到地图矩形：贴边时标记会有半个露在地图外，浮在纸面上读起来像一枚
        // 不相干的符号；裁掉之后半个符号正好读成「压在边界上」。
        ctx.save();
        ctx.beginPath();
        ctx.rect(layout.left, layout.top, layout.width, layout.height);
        ctx.clip();

        const text = outside ? `${rawX},${rawY} 图外` : `${rawX},${rawY}`;

        if (plan.mode === 'exact') {
            // 开眼之后任务栏给的是**真坐标**，没有范围可猜，所以这里不画任何框。
            //
            // 中心一枚朱红点、外面一圈纸白细环：环不是装饰，是为了在任何底色上
            // 都能读出点的边界——没有环，点会与深色的山地、水面融成一片。
            ctx.fillStyle = mapSeal;
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = mapHalo;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(px, py, 5.1, 0, Math.PI * 2);
            ctx.stroke();

            // 坐标是**写在地形上的**，没有底板、没有边框。范围模式那一层用纸色标签，
            // 因为它是一块「区域」，需要一个边界；这里是「一个点」，再套一个框
            // 就成了界面控件贴在地图上，与纸墨这一层语言不搭。
            //
            // 可读性靠纸白描边：写实地形从雪白到近黑都有，单靠朱色压不住。
            ctx.font = FONT_EXACT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            const textWidth = ctx.measureText(text).width;
            const gap = 11;
            // 默认写在点的右侧；贴到右边缘时翻到左侧。不翻会被裁在地图外，
            // 剩一个点什么信息都没有。
            const fitsRight = px + gap + textWidth <= layout.left + layout.width - 2;
            const textX = fitsRight ? px + gap : px - gap - textWidth;
            // 与点同高才读得出「这串数字属于这个点」，所以只能夹到不出图，
            // 不能像标签那样整体挪走。
            const textY = Math.min(Math.max(py, layout.top + 8), layout.top + layout.height - 8);

            // 先描边再填字。`strokeText` 的 lineWidth 骑在字形轮廓上、内外各一半，
            // 随后填字会把朝内那一半盖掉，净剩向外的 1px；反过来先填后描会
            // 把笔画本身吃细，小字号下直接糊。楷体在 13.5px 上笔画只有一像素宽，
            // 描边再粗一档，字口就被白色吃掉了（实测 1.2px 时「4」几乎读不出缺口）。
            ctx.strokeStyle = mapHalo;
            ctx.lineWidth = 2;
            ctx.strokeText(text, textX, textY);
            ctx.fillStyle = mapSealInk;
            ctx.fillText(text, textX, textY);
        } else {
            const size = 7;
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px - size, py);
            ctx.lineTo(px + size, py);
            ctx.moveTo(px, py - size);
            ctx.lineTo(px, py + size);
            ctx.stroke();

            ctx.fillStyle = paper;
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.font = FONT;
            const boxWidth = ctx.measureText(text).width + PAD_X * 2;
            const gap = size + 3;
            const fitsRight = px + gap + boxWidth <= layout.left + layout.width - 2;
            placeLabel(
                text,
                fitsRight ? px + gap : px - gap - boxWidth,
                py - BOX_H / 2,
                boxWidth,
                ink,
                false,
            );
        }

        ctx.restore();
    }
}
