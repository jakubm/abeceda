"""Pre-generate Czech pronunciations so speech works even without a Czech voice installed.

Writes public/audio/cs/<text>.mp3 for every Czech word in src/words.json and every
letter name in src/letters.json. Existing files are skipped, so re-run it after adding words.

    pip install edge-tts
    python scripts/gen_audio.py
"""

import asyncio
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio" / "cs"
VOICE = "cs-CZ-VlastaNeural"
RATE = "-10%"


async def main():
    words = json.loads((ROOT / "src" / "words.json").read_text(encoding="utf-8"))
    letters = json.loads((ROOT / "src" / "letters.json").read_text(encoding="utf-8"))
    texts = sorted({w["cz"] for w in words} | set(letters.values()))
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [t for t in texts if not (OUT / f"{t}.mp3").exists()]
    print(f"{len(texts)} texts, {len(todo)} to generate")

    sem = asyncio.Semaphore(8)
    failed = []

    async def one(text):
        async with sem:
            target = OUT / f"{text}.mp3"
            for attempt in range(3):
                try:
                    tmp = target.with_suffix(".part")
                    await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(tmp))
                    tmp.replace(target)
                    return
                except Exception as e:  # network hiccups: retry
                    err = e
                    await asyncio.sleep(1 + attempt)
            failed.append((text, err))

    await asyncio.gather(*(one(t) for t in todo))
    for text, err in failed:
        print("FAILED", text, err)


asyncio.run(main())
