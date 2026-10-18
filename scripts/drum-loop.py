"""Generate the original CC0 preview loop; no recordings or external samples.

Run: python3 scripts/drum-loop.py
The generator is covered by the project licence; its WAV output is CC0 1.0.
See CREDITS.md for the audio dedication.
"""
from array import array
import math
from pathlib import Path
import random
import sys
import wave

RATE, BPM, BARS = 44100, 120, 2
LENGTH = round(RATE * 60 / BPM * 4 * BARS)
audio = [0.0] * LENGTH
rng = random.Random(120)


def hit(step, duration, voice, level):
    # A light sixteenth-note swing; exact two-bar duration for seamless looping.
    start = round((step + (0.10 if step % 2 else 0)) * RATE * 60 / BPM / 4)
    phase, previous_noise = 0.0, 0.0
    for i in range(round(duration * RATE)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        high = (noise - previous_noise) * 0.5
        previous_noise = noise
        if voice == "kick":
            phase += math.tau * (48 + 112 * math.exp(-t * 42)) / RATE
            sound = math.sin(phase) * math.exp(-t * 13) + high * math.exp(-t * 180) * 0.12
        elif voice == "snare":
            sound = (math.sin(math.tau * 185 * t) * math.exp(-t * 28) * 0.38
                     + high * math.exp(-t * 21) * 0.85)
        else:
            sound = high * math.exp(-t * (22 if voice == "open-hat" else 75))
        attack = min(1, i / (RATE * 0.001))
        release = min(1, (duration - t) / 0.008)
        # Wrap tails from the last hit into the start of the repeating buffer.
        audio[(start + i) % LENGTH] += sound * attack * release * level


for step in [0, 6, 8, 15, 16, 22, 24, 27]:
    hit(step, 0.40, "kick", 0.9 if step % 8 == 0 else 0.70)
for step in [4, 12, 20, 28]:
    hit(step, 0.26, "snare", 0.72)
for step in [11, 26, 31]:
    hit(step, 0.15, "snare", 0.18)
for step in range(32):
    if step in [14, 30]:
        hit(step, 0.24, "open-hat", 0.22)
    else:
        hit(step, 0.09, "hat", (0.30 if step % 4 == 0 else 0.22) if step % 2 == 0 else 0.10)

scale = 0.8 / max(abs(v) for v in audio)
pcm = array("h", (round(v * scale * 32767) for v in audio))
if sys.byteorder != "little":
    pcm.byteswap()
dest = Path(__file__).resolve().parents[1] / "public/audio/drum-loop-120.wav"
dest.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(dest), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(pcm.tobytes())
print(f"Wrote {dest.name}: {BARS} bars, {BPM} BPM, {LENGTH / RATE:g} seconds (CC0)")
