if (import.meta.env.MODE === 'legacy') {
    void import('./main');
} else {
    void import('./liquid-main');
}
