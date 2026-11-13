/** 浮卡贴近指针，右侧或下方不足时翻转，最后限制在图表内。 */
export function chartTooltipPosition(
    point: { x: number; y: number },
    size: { width: number; height: number },
    bounds: { width: number; height: number },
) {
    const edge = 8;
    const dx = 14;
    const dy = 18;
    const left =
        point.x + dx + size.width <= bounds.width - edge ? point.x + dx : point.x - size.width - dx;
    const top =
        point.y + dy + size.height <= bounds.height - edge
            ? point.y + dy
            : point.y - size.height - dy;
    return {
        left: Math.max(edge, Math.min(left, bounds.width - size.width - edge)),
        top: Math.max(edge, Math.min(top, bounds.height - size.height - edge)),
    };
}
