import wave

import numpy as np


def load16(f):
    """24 kHz WAV -> 16 kHz float32 for the recognizers, padded with 0.3 s of silence
    (they do badly on clips trimmed tight)."""
    with wave.open(f) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        sr = w.getframerate()
    fc = 7500 / sr  # low-pass ~7.5 kHz (windowed sinc), then linear interpolation
    n = np.arange(-64, 65)
    h = np.sinc(2 * fc * n) * np.hamming(len(n))
    a = np.convolve(a, h / h.sum(), mode="same")
    m = int(len(a) * 16000 / sr)
    out = np.interp(np.linspace(0, len(a) - 1, m), np.arange(len(a)), a).astype(np.float32)
    z = np.zeros(4800, np.float32)
    return np.concatenate([z, out, z])
