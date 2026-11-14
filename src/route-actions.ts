/** 快捷入口与业务页共用动作名，路径与动作的组合受类型约束。 */
export const ROUTE_ACTIONS = {
    '/characters': ['new', 'edit'],
    '/income': ['quick', 'history', 'start', 'backfill', 'records'],
    '/accounts': ['new', 'history'],
    '/prices': ['new'],
    '/goals': ['new', 'update'],
    '/tools/alarm': ['new'],
} as const;

export type ActionPath = keyof typeof ROUTE_ACTIONS;
export type RouteAction<P extends ActionPath> = (typeof ROUTE_ACTIONS)[P][number];
export type RouteActionTarget = {
    [P in ActionPath]: { path: P; action: RouteAction<P> };
}[ActionPath];
