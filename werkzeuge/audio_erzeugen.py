#!/usr/bin/env python3
"""Erzeugt die Audiodateien der App mit Piper (lokale Sprachsynthese).

Aufruf (aus dem Projektordner):
    .venv/bin/python werkzeuge/audio_erzeugen.py                       # alle Stimmen -> audio-vergleich/
    .venv/bin/python werkzeuge/audio_erzeugen.py --stimme de_DE-thorsten-high --ziel audio

Pro Buchstabe:  <b>.wav       Laut, Laut, Wort   ("mmm … mmm … Maus")
                <b>-wort.wav  nur das Wort       (nach dem Lob)
                (Umlaute/ß im Dateinamen als ae, oe, ue, ss)
Dazu:           lob-1.wav …   kurze Lob-Sätze
"""
import argparse
import re
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

PROJEKT = Path(__file__).resolve().parent.parent
STIMMEN = PROJEKT / '.stimmen'

# Anlaut in Lautschrift (espeak/IPA). ː verlängert Dauerlaute, ə macht Klinger hörbar ("bə", nicht "Be").
LAUTE = {
    'a': 'aː', 'ä': 'ɛː', 'b': 'bə', 'c': 'kə', 'd': 'də', 'e': 'ɛː', 'f': 'fːː', 'g': 'ɡə', 'h': 'hə', 'i': 'iː',
    'j': 'jə', 'k': 'kə', 'l': 'lːː', 'm': 'mːː', 'n': 'nːː', 'o': 'ɔː', 'ö': 'øː', 'p': 'pə', 'q': 'kvə',
    'r': 'ʁːː', 's': 'zːː', 'ß': 'sːː', 't': 'tə', 'u': 'uː', 'ü': 'yː', 'v': 'fːː', 'w': 'vːː',
    'x': 'ksː', 'y': 'jə', 'z': 'tsə',
}

# Aussprache-Hilfe, wo die Schreibweise die Sprachsynthese verwirrt
SPRECHEN = {'Yo-Yo': 'Jojo', 'Computer': 'Kompjuter'}

DATEINAMEN = {'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss'}

LOB = ['Super!', 'Toll gemacht!', 'Prima!', 'Klasse!', 'Wunderbar!']


def woerter_aus_letters_js():
    text = (PROJEKT / 'letters.js').read_text(encoding='utf-8')
    return dict(re.findall(r"b: '(\w)', wort: '([^']+)'", text))


def synth(stimme, text, tempo=1.0):
    cfg = SynthesisConfig(length_scale=tempo)
    teile = [c.audio_float_array for c in stimme.synthesize(text, syn_config=cfg)]
    return trimmen(np.concatenate(teile)) if teile else np.zeros(0, dtype=np.float32)


def trimmen(audio, schwelle=0.02):
    laut = np.where(np.abs(audio) > schwelle)[0]
    if not len(laut):
        return audio
    rand = 400  # wenige ms behalten, damit nichts abgeschnitten klingt
    return audio[max(0, laut[0] - rand): laut[-1] + rand]


def pause(rate, sekunden):
    return np.zeros(int(rate * sekunden), dtype=np.float32)


def speichern(pfad, audio, rate):
    audio = audio / max(1e-6, np.abs(audio).max()) * 0.9  # gleiche Lautstärke für alle Clips
    pcm = (audio * 32767).astype(np.int16)
    with wave.open(str(pfad), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def erzeugen(modell, ziel):
    stimme = PiperVoice.load(str(modell))
    rate = stimme.config.sample_rate
    ziel.mkdir(parents=True, exist_ok=True)
    for b, wort in woerter_aus_letters_js().items():
        laut = synth(stimme, f'[[ {LAUTE[b]} ]]', tempo=1.3)
        wort_audio = synth(stimme, SPRECHEN.get(wort, wort), tempo=1.15)
        datei = DATEINAMEN.get(b, b)
        clip = np.concatenate([laut, pause(rate, 0.35), laut, pause(rate, 0.5), wort_audio])
        speichern(ziel / f'{datei}.wav', clip, rate)
        speichern(ziel / f'{datei}-wort.wav', wort_audio, rate)
    for i, satz in enumerate(LOB, 1):
        speichern(ziel / f'lob-{i}.wav', synth(stimme, satz, tempo=1.05), rate)
    print('fertig:', ziel)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--stimme', help='Name der Stimme, z. B. de_DE-thorsten-high (ohne: alle)')
    p.add_argument('--ziel', help='Zielordner (Standard: audio-vergleich/<stimme>)')
    args = p.parse_args()
    modelle = [STIMMEN / f'{args.stimme}.onnx'] if args.stimme else sorted(STIMMEN.glob('*.onnx'))
    for m in modelle:
        ziel = PROJEKT / args.ziel if args.ziel else PROJEKT / 'audio-vergleich' / m.stem
        erzeugen(m, ziel)


if __name__ == '__main__':
    main()
