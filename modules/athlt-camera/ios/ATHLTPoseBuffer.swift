import CoreGraphics

// ─── PoseFrame ────────────────────────────────────────────────────────────────

struct PoseFrame {
    let pose:        Pose
    let videoWidth:  CGFloat
    let videoHeight: CGFloat
    let isMirrored:  Bool
}

// ─── ATHLTPoseBuffer ──────────────────────────────────────────────────────────
//
// Thread-safe single-slot buffer between the inference queue (writer) and the
// main-thread CADisplayLink (reader).
//
// Single-slot design: each post() overwrites the previous frame so the CADisplayLink
// always reads the FRESHEST available pose. At 10 fps inference / 60 fps display,
// 50 display ticks per second get nil (nothing to draw) and ~10 get a new pose.
// Both paths are O(1) with an NSLock — no queue, no allocation on the hot path.

final class ATHLTPoseBuffer {
    static let shared = ATHLTPoseBuffer()

    private let lock  = NSLock()
    private var frame: PoseFrame?

    private init() {}

    /// Write a new pose frame. Called from inference queue.
    func post(_ frame: PoseFrame) {
        lock.lock(); self.frame = frame; lock.unlock()
    }

    /// Take the latest frame and clear the slot. Returns nil if no new frame since last take.
    /// Called from main thread (CADisplayLink).
    func take() -> PoseFrame? {
        lock.lock(); defer { lock.unlock() }
        let f = frame; frame = nil; return f
    }

    /// Discard any pending frame. Called when session stops or person leaves frame.
    func clear() {
        lock.lock(); frame = nil; lock.unlock()
    }
}
