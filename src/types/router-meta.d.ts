import 'vue-router';

declare module 'vue-router' {
    interface RouteMeta {
        title: string;
        /** 工具子页归属的主导航项，保持侧栏选中状态。 */
        nav?: string;
    }
}
