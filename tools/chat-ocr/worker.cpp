// Local binary pipes: dimensions + BGRA in, UTF-8 lines with bounds and scores out.
#include "OcrLite.h"
#include <ncnn/gpu.h>
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <fcntl.h>
#include <io.h>
#include <numeric>

static bool write_line(FILE* out, const TextBlock& block, int scale) {
    if (block.boxPoint.empty() || block.charScores.empty() || block.text.empty()) return true;
    const float score = std::accumulate(block.charScores.begin(), block.charScores.end(), 0.0f) / block.charScores.size();
    if (score < 0.5f) return true;
    cv::Rect bounds = cv::boundingRect(block.boxPoint);
    uint32_t size = static_cast<uint32_t>(block.text.size());
    int32_t box[] = {bounds.x / scale, bounds.y / scale, (bounds.width - 1) / scale, (bounds.height - 1) / scale};
    return fwrite(&size, sizeof(size), 1, out) == 1 && fwrite(box, sizeof(box), 1, out) == 1
        && fwrite(&score, sizeof(score), 1, out) == 1 && fwrite(block.text.data(), 1, size, out) == size;
}

static int run(FILE* out) {
    const int gpu = ncnn::get_default_gpu_index();
    if (gpu < 0 || gpu >= ncnn::get_gpu_count()) return 1;
    OcrLite engine;
    engine.initLogger(false, false, false);
    engine.setNumThread(4);
    engine.setGpuIndex(gpu);
    if (!engine.initModels("ch_PP-OCRv3_det_infer", "ch_ppocr_mobile_v2.0_cls_infer", "ch_PP-OCRv3_rec_infer", "../ppocr_keys_v1.txt")) return 1;
    if (fwrite("OCR2", 1, 4, out) != 4 || fflush(out)) return 1;
    uint32_t dims[3];
    while (fread(dims, sizeof(dims), 1, stdin) == 1) {
        const auto width = dims[0], height = dims[1], scale = dims[2];
        if (!width || !height || width > 16384 || height > 16384 || uint64_t(width) * height > 16 * 1024 * 1024) return 1;
        if (!scale || scale > 6 || uint64_t(width) * height * scale * scale > 64ULL * 1024 * 1024) return 1;
        cv::Mat pixels(height, width, CV_8UC4), rgb, scaled;
        const size_t bytes = pixels.total() * pixels.elemSize();
        if (fread(pixels.data, 1, bytes, stdin) != bytes) return 1;
        cv::cvtColor(pixels, rgb, cv::COLOR_BGRA2BGR);
        if (scale == 1) scaled = rgb;
        else cv::resize(rgb, scaled, {}, scale, scale, cv::INTER_NEAREST);
        auto result = engine.detect(scaled, 24, 4096, 0.5f, 0.3f, 1.6f, false, false);
        for (const auto& block : result.textBlocks) if (!write_line(out, block, scale)) return 1;
        const uint32_t end = 0;
        if (fwrite(&end, sizeof(end), 1, out) != 1 || fflush(out)) return 1;
    }
    return 0;
}

int main() {
    // Upstream prints GPU and model diagnostics to stdout. Keep them off the protocol pipe.
    FILE* out = _fdopen(_dup(_fileno(stdout)), "wb");
    if (!out || _dup2(_fileno(stderr), _fileno(stdout)) < 0) return 1;
    _setmode(_fileno(out), _O_BINARY);
    _setmode(_fileno(stdin), _O_BINARY);
    const int result = run(out);
    ncnn::destroy_gpu_instance();
    fclose(out);
    return result;
}
