import sys
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "small", device="cpu", compute_type="int8")
segs, info = m.transcribe(sys.argv[1], language="no", beam_size=5)
for s in segs: print(f"[{s.start:5.2f}-{s.end:5.2f}] {s.text}")
