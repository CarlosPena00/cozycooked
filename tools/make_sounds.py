"""Self-made soft kitchen sounds (pure Python synthesis, encoded with ffmpeg to ogg + mp3).

    python3 tools/make_sounds.py

plop      an ingredient drops into the pot (a water drop: a sine that bends up, quick decay)
assemble  dough folded over the cheese (two soft pats of filtered noise over a low thump)
bin       something goes in the compost bin (a dull wooden thunk with a short rustle)
toss      coins hop out of a guest's paw (a tiny rising bloop, lighter than the landing clink)

Peaks sit around -6 dBFS like the other effects; data.js sets the in-game volume.
"""

import math
import random
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"
PEAK = 10 ** (-6 / 20)


def samples(seconds):
    return [i / RATE for i in range(int(seconds * RATE))]


def lowpass(xs, cutoff):
    a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    y, out = 0.0, []
    for x in xs:
        y += a * (x - y)
        out.append(y)
    return out


def noise(seconds, seed):
    r = random.Random(seed)
    return [r.uniform(-1, 1) for _ in samples(seconds)]


def env(t, attack, decay):
    """Fast attack, exponential decay (seconds)."""
    return min(1.0, t / attack) * math.exp(-t / decay) if attack else math.exp(-t / decay)


def sweep(seconds, f0, f1, bend, decay, attack=0.002):
    """A sine gliding from f0 to f1 (exponential bend, seconds), shaped by env()."""
    out, phase = [], 0.0
    for t in samples(seconds):
        f = f1 + (f0 - f1) * math.exp(-t / bend)
        phase += 2 * math.pi * f / RATE
        out.append(math.sin(phase) * env(t, attack, decay))
    return out


def mix(*parts):
    n = max(len(p) + int(delay * RATE) for p, _, delay in parts)
    out = [0.0] * n
    for p, gain, delay in parts:
        start = int(delay * RATE)
        for i, x in enumerate(p):
            out[start + i] += x * gain
    return out


def shaped(xs, attack, decay):
    return [x * env(i / RATE, attack, decay) for i, x in enumerate(xs)]


def plop():
    drop = sweep(0.22, 260, 980, 0.05, 0.045)
    body = sweep(0.22, 180, 120, 0.1, 0.05)
    return mix((drop, 1.0, 0), (body, 0.35, 0))


def assemble():
    pat = shaped(lowpass(noise(0.12, 1), 900), 0.003, 0.025)
    thump = sweep(0.15, 150, 110, 0.05, 0.04)
    return mix((pat, 2.2, 0), (thump, 0.5, 0), (pat, 1.6, 0.09), (thump, 0.35, 0.09))


def bin_():
    thunk = sweep(0.3, 160, 85, 0.06, 0.07)
    rustle = shaped(lowpass(noise(0.3, 2), 1400), 0.01, 0.06)
    return mix((thunk, 1.0, 0), (rustle, 1.4, 0.02))


def toss():
    return sweep(0.16, 520, 1250, 0.04, 0.035, attack=0.004)


def save(name, xs):
    gain = PEAK / max(abs(x) for x in xs)
    fade = int(0.01 * RATE)  # no click at the end
    data = bytearray()
    for i, x in enumerate(xs):
        k = min(1.0, (len(xs) - i) / fade)
        v = int(max(-1, min(1, x * gain * k)) * 32767)
        data += v.to_bytes(2, "little", signed=True)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{name}.wav"
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(bytes(data))
        for ext, codec in (("ogg", ["-c:a", "libvorbis", "-q:a", "4"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "4"])):
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), *codec, str(OUT / f"{name}.{ext}")], check=True
            )
    print(f"{name}: {len(xs) / RATE:.2f} s")


if __name__ == "__main__":
    for name, make in {"plop": plop, "assemble": assemble, "bin": bin_, "toss": toss}.items():
        save(name, make())
