/** 完整绘图区的默认高度，含坐标与标签、不含图例；微型走势图保留独立尺寸。 */
export const CHART_HEIGHT = 220;

/** 图形与图例共用半透明浅染配方，保留系列原色与主题高光，不降低文字透明度。 */
export function chartColor(color: string): string {
    const tint = `color-mix(in srgb, ${color} 82%, var(--bevel-hi))`;
    return `color-mix(in srgb, ${tint} 65%, transparent)`;
}
