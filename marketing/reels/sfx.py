"""Synthesize sound effects + an optional light music bed, mixed to one track.

Usage: .venv/bin/python sfx.py build/<name>/sfx.json build/<name>/sfx.wav build/<name>/music.wav
sfx.json: {"duration": seconds, "sfx": [{"t": 1.2, "name": "whoosh", "gain": 1}, ...]}
"""
import json
import subprocess
import sys

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env(n, a=0.005, d=0.2):
    t = np.arange(n) / SR
    e = np.minimum(t / a, 1.0) * np.exp(-np.maximum(t - a, 0) / d)
    return e


def lowpass(x, cutoff):
    # one-pole low-pass, cutoff may be an array
    alpha = 1 - np.exp(-2 * np.pi * np.asarray(cutoff) / SR)
    alpha = np.broadcast_to(alpha, x.shape)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha[i] * (x[i] - acc)
        y[i] = acc
    return y


def whoosh():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    sweep = 400 + 5200 * np.sin(np.pi * t / t[-1]) ** 2
    x = lowpass(noise, sweep) - lowpass(noise, sweep * 0.25)
    shape = np.sin(np.pi * t / t[-1]) ** 1.5
    return 0.55 * x * shape


def pop():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 18) + 380
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return 0.5 * x * env(n, 0.002, 0.04)


def ding():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * t) for f, a in [(1318.5, 1), (2637, 0.35), (1975.5, 0.25)])
    return 0.28 * x * env(n, 0.003, 0.28)


def kaching():
    a = ding()
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    b = sum(a_ * np.sin(2 * np.pi * f * t) for f, a_ in [(1760, 1), (3520, 0.3), (2637, 0.3)]) * env(n, 0.003, 0.35) * 0.3
    shake = rng.standard_normal(int(0.25 * SR)) * env(int(0.25 * SR), 0.002, 0.05) * 0.18
    shake = shake - lowpass(shake, 3000)
    out = np.zeros(int(1.2 * SR))
    out[: len(shake)] += shake
    out[int(0.03 * SR): int(0.03 * SR) + n] += a
    out[int(0.11 * SR): int(0.11 * SR) + n] += b
    return out


def click():
    n = int(0.05 * SR)
    x = rng.standard_normal(n) * env(n, 0.0005, 0.006)
    return 0.35 * (x - lowpass(x, 2000))


SOUNDS = {"whoosh": whoosh, "pop": pop, "ding": ding, "kaching": kaching, "click": click}


def pluck(freq, dur, bright=0.5):
    n = int(dur * SR)
    period = int(SR / freq)
    buf = rng.uniform(-1, 1, period)
    buf = lowpass(buf, 2000 + 6000 * bright)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = 0.996 * 0.5 * (buf[i % period] + buf[(i + 1) % period])
    return out


def music(duration, bpm=112):
    beat = 60 / bpm
    n = int(duration * SR) + SR
    out = np.zeros(n)
    # I–vi–IV–V in A major-ish, voiced warm
    chords = [[220.0, 277.18, 329.63, 415.30], [185.0, 220.0, 277.18, 329.63],
              [146.83, 220.0, 293.66, 369.99], [164.81, 246.94, 329.63, 415.30]]
    bars = int(duration / (beat * 4)) + 2
    cache = {}
    for bar in range(bars):
        ch = chords[bar % 4]
        for step in range(8):  # eighth-note plucks
            t0 = (bar * 4 + step * 0.5) * beat
            i0 = int(t0 * SR)
            if i0 >= n:
                break
            f = ch[[0, 2, 1, 3, 2, 1, 3, 2][step]] * 2
            key = round(f, 2)
            if key not in cache:
                cache[key] = pluck(f, beat * 1.4, 0.35)
            s = cache[key] * (0.11 if step % 2 == 0 else 0.07)
            out[i0: i0 + len(s)] += s[: max(0, n - i0)]
        # bass on beats 1 and 3
        for b in (0, 2):
            t0 = (bar * 4 + b) * beat
            i0 = int(t0 * SR)
            if i0 >= n:
                break
            m = int(beat * 1.8 * SR)
            tt = np.arange(m) / SR
            s = np.sin(2 * np.pi * ch[0] / 2 * tt) * env(m, 0.01, 0.35) * 0.16
            out[i0: i0 + m] += s[: max(0, n - i0)]
        # soft kick + shaker
        for b in range(4):
            t0 = (bar * 4 + b) * beat
            i0 = int(t0 * SR)
            if i0 >= n:
                break
            m = int(0.25 * SR)
            tt = np.arange(m) / SR
            k = np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-tt * 30)) / SR) * env(m, 0.002, 0.09) * 0.32
            out[i0: i0 + m] += k[: max(0, n - i0)]
            for off in (0.5,):
                j0 = int((t0 + off * beat) * SR)
                h = rng.standard_normal(int(0.06 * SR)) * env(int(0.06 * SR), 0.001, 0.02) * 0.06
                h = h - lowpass(h, 6000)
                out[j0: j0 + len(h)] += h[: max(0, n - j0)]
    out = out[: int(duration * SR)]
    fade = int(1.2 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    out[: int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))
    return out


def write(path, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "pcm_s16le", path], input=x.tobytes(), check=True)


def main(spec_path, sfx_out, music_out):
    spec = json.loads(open(spec_path).read())
    dur = spec["duration"]
    track = np.zeros(int(dur * SR) + 2 * SR)
    cache = {}
    for ev in spec["sfx"]:
        if ev["name"] not in cache:
            cache[ev["name"]] = SOUNDS[ev["name"]]()
        s = cache[ev["name"]] * ev.get("gain", 1)
        i0 = int(ev["t"] * SR)
        track[i0: i0 + len(s)] += s[: len(track) - i0]
    write(sfx_out, track[: int(dur * SR)])
    write(music_out, music(dur))


if __name__ == "__main__":
    main(*sys.argv[1:4])
