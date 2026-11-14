export interface ChartColumnGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    negative: boolean;
}

/** 同一日期内的柱体并排，厚度与留白计入槽宽；正负值都以真实零线为起点。 */
export function columnGeometry(
    center: number,
    valueY: number,
    zeroY: number,
    slot: number,
    count = 1,
    index = 0,
): ChartColumnGeometry {
    const unit = Math.max(0, slot * 0.78) / Math.max(1, count);
    const width = Math.min(26, unit * 0.58);
    const depth = Math.min(6, width * 0.32);
    const step = width + depth + Math.min(5, unit * 0.1);
    const groupWidth = count * step - (step - width - depth);
    return {
        x: center - groupWidth / 2 + index * step,
        y: Math.min(valueY, zeroY),
        width,
        height: Math.abs(valueY - zeroY),
        depth,
        negative: valueY > zeroY,
    };
}
