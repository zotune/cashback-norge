"""Generate Norwegian voiceover + word timings for a reel.

Usage: .venv/bin/python tts.py videos/<name>

Reads videos/<name>/script.json and writes:
  build/<name>/voice.wav      – all segments concatenated with gaps
  build/<name>/timeline.json  – segment start/end + per-word timings (seconds)

Script line syntax: {shown|spoken} shows `shown` in captions but speaks `spoken`
(e.g. "{13 490 kr|tretten tusen fire hundre og nitti kroner}"). *word* marks a
caption word to highlight.
"""
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

import edge_tts
import numpy as np

ROOT = Path(__file__).parent
TOKEN = re.compile(r"(\*?)\{([^|}]*)\|([^}]*)\}(\*?)([.,!?:;]*)|\S+")


def parse(line):
    """Return (spoken_text, display_tokens) where each display token knows how many spoken words it spans."""
    spoken, tokens = [], []
    for m in TOKEN.finditer(line):
        if m.group(2) is not None:
            star = "*" if m.group(1) else ""
            shown = star + m.group(2) + (m.group(4) or "") + m.group(5)
            said = m.group(3)
        else:
            shown = said = m.group(0)
        emph = shown.startswith("*") and shown.rstrip(".,!?:;").endswith("*")
        shown = shown.replace("*", "")
        said = said.replace("*", "")
        n = len([w for w in said.split() if re.search(r"\w", w)])
        spoken.append(said)
        tokens.append({"text": shown, "n": max(n, 0), "emph": emph})
    return " ".join(spoken), tokens


async def synth(text, voice, rate, pitch, mp3_path):
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(mp3_path, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({
                    "w": chunk["text"],
                    "t0": chunk["offset"] / 1e7,
                    "t1": (chunk["offset"] + chunk["duration"]) / 1e7,
                })
    return words


SR = 48000


def load_pcm(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(raw, dtype=np.float32).copy()


def save_wav(samples, path):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "pcm_s16le", str(path)], input=samples.astype(np.float32).tobytes(), check=True)


def tighten(samples, max_pause, head=0.03, tail=0.07, floor_db=-42):
    """Trim edges and shorten long pauses. Returns (samples, time_map)."""
    hop = int(SR * 0.01)
    n = len(samples) // hop
    rms = np.sqrt(np.mean(samples[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    loud = 20 * np.log10(rms) > floor_db
    if not loud.any():
        return samples, lambda t: t
    first, last = np.argmax(loud), n - 1 - np.argmax(loud[::-1])
    keep = np.zeros(n, dtype=bool)
    keep[max(first - int(head * 100), 0): min(last + int(tail * 100) + 1, n)] = True
    run_start, max_frames = None, int(max_pause * 100)
    for i in range(first, last + 1):
        if not loud[i]:
            run_start = i if run_start is None else run_start
        elif run_start is not None:
            run = i - run_start
            if run > max_frames:
                cut0 = run_start + max_frames // 2
                keep[cut0: cut0 + run - max_frames] = False
            run_start = None
    kept_before = np.concatenate([[0], np.cumsum(keep)])
    out = samples[: n * hop].reshape(n, hop)[keep].reshape(-1)

    def time_map(t):
        f = min(max(int(round(t * 100)), 0), n)
        return kept_before[f] / 100.0

    return out, time_map


def duration(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(out)


def align(tokens, words, seg_dur):
    """Give each display token a start/end time from the spoken word boundaries."""
    total = sum(t["n"] for t in tokens)
    if total != len(words) or not words:
        # Fallback: spread tokens evenly across the spoken range.
        start, end = (words[0]["t0"], words[-1]["t1"]) if words else (0.0, seg_dur)
        step = (end - start) / max(len(tokens), 1)
        for i, t in enumerate(tokens):
            t["t0"], t["t1"] = start + i * step, start + (i + 1) * step
        return False
    i = 0
    last = words[0]["t0"]
    for t in tokens:
        if t["n"] == 0:
            t["t0"] = t["t1"] = last
            continue
        t["t0"] = words[i]["t0"]
        t["t1"] = words[i + t["n"] - 1]["t1"]
        last = t["t1"]
        i += t["n"]
    return True


async def main(video_dir):
    video_dir = ROOT / video_dir
    name = video_dir.name
    spec = json.loads((video_dir / "script.json").read_text())
    voice = spec.get("voice", "nb-NO-PernilleNeural")
    rate = spec.get("rate", "+8%")
    pitch = spec.get("pitch", "+0Hz")
    lead_in = spec.get("leadIn", 0.15)
    out = ROOT / "build" / name
    (out / "seg").mkdir(parents=True, exist_ok=True)

    segments, concat, t = [], [], lead_in
    silence = out / "seg" / "silence.wav"
    for i, seg in enumerate(spec["segments"]):
        spoken, tokens = parse(seg["line"])
        mp3 = out / "seg" / f"{i:02d}.mp3"
        words = await synth(spoken, seg.get("voice", voice), seg.get("rate", rate), pitch, mp3)
        wav = out / "seg" / f"{i:02d}.wav"
        pcm, tmap = tighten(load_pcm(mp3), seg.get("maxPause", spec.get("maxPause", 0.22)))
        for w in words:
            w["t0"], w["t1"] = tmap(w["t0"]), tmap(w["t1"])
        save_wav(pcm, wav)
        dur = len(pcm) / SR
        ok = align(tokens, words, dur)
        if not ok:
            print(f"  ! seg {i}: {len(words)} boundaries vs {sum(x['n'] for x in tokens)} words – spread evenly", file=sys.stderr)
        for tok in tokens:
            tok["t0"] += t
            tok["t1"] += t
        gap = seg.get("gap", spec.get("gap", 0.12))
        segments.append({"id": seg.get("id", str(i)), "t0": t, "t1": t + dur, "spoken": spoken, "tokens": tokens})
        concat.append(wav)
        t += dur + gap
        if gap > 0:
            g = out / "seg" / f"{i:02d}-gap.wav"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
                            "-t", f"{gap:.3f}", str(g)], check=True)
            concat.append(g)
        print(f"  seg {i} {seg.get('id', '')}: {dur:.2f}s  {spoken}")

    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
                    "-t", f"{lead_in:.3f}", str(silence)], check=True)
    lst = out / "seg" / "list.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in [silence, *concat]))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c:a", "pcm_s16le", str(out / "voice.wav")], check=True)
    voice_dur = duration(out / "voice.wav")
    tail = spec.get("tail", 1.6)
    timeline = {"duration": voice_dur + tail, "voiceDuration": voice_dur, "segments": segments}
    (out / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1))
    print(f"voice {voice_dur:.2f}s → total {timeline['duration']:.2f}s")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
