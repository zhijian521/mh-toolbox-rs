/** 物价卡片的迷你柱图。统一从零起画，等价价格等高，零价不伪造最小高度。 */
export function buildSparkBars(values: number[], width: number, height: number) {
    if (values.length < 2) return [];
    const maximum = Math.max(0, ...values);
    const slot = Math.max(0, width) / values.length;
    const innerHeight = Math.max(0, height - 2);
    return values.map((value, index) => {
        const barHeight = maximum > 0 ? (Math.max(0, value) / maximum) * innerHeight : 0;
        return {
            x: slot * index + slot * 0.18,
            y: height - 1 - barHeight,
            width: slot * 0.64,
            height: barHeight,
        };
    });
}
