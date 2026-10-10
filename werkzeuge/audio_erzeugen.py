#!/usr/bin/env python3
"""Erzeugt die Audiodateien der App mit Piper (lokale Sprachsynthese).

Aufruf (aus dem Projektordner):
    .venv/bin/python werkzeuge/audio_erzeugen.py                       # alle Stimmen -> audio-vergleich/
    .venv/bin/python werkzeuge/audio_erzeugen.py --stimme de_DE-thorsten-high --ziel audio

Pro Buchstabe:  <b>.wav       Laut, Laut, Wort   ("mmm … mmm … Maus")
                <b>-wort.wav  nur das Wort       (nach dem Lob)
                <b>-laut.wav  nur der Laut       ("mmm … mmm", für das Hör-Spiel)
                <b>-2.wav, <b>-2-wort.wav …  weitere Wörter aus "mehr" in letters.js
                (Umlaute/ß im Dateinamen als ae, oe, ue, ss)
Dazu:           lob-1.wav …   kurze Lob-Sätze
                ansage-*.wav  Ansagen der Spiele

Piper klingt bei jedem Lauf etwas anders. Damit fertige Dateien gleich bleiben, nur die nötigen Teile erzeugen:
    .venv/bin/python werkzeuge/audio_erzeugen.py --stimme de_DE-thorsten-high --ziel audio --teile laute,ansagen
"""
import argparse
import json
import re
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

PROJEKT = Path(__file__).resolve().parent.parent
STIMMEN = PROJEKT / '.stimmen'

# Anlaut in Lautschrift (espeak/IPA). ː verlängert Dauerlaute, ə macht Klinger hörbar ("bə", nicht "Be").
LAUTE = {
    'a': 'aː', 'ä': 'ɛː', 'b': 'bə', 'c': 'kə', 'd': 'də', 'e': 'eː', 'f': 'fːː', 'g': 'ɡə', 'h': 'hə', 'i': 'iː',
    'j': 'jə', 'k': 'kə', 'l': 'lːː', 'm': 'mːː', 'n': 'nːː', 'o': 'ɔː', 'ö': 'øː', 'p': 'pə', 'q': 'kvə',
    'r': 'ʁːː', 's': 'zːː', 'ß': 'sːː', 't': 'tə', 'u': 'uː', 'ü': 'yː', 'v': 'fːː', 'w': 'vːː',
    'x': 'ksː', 'y': 'jə', 'z': 'tsə',
}

# Aussprache-Hilfe, wo die Schreibweise die Sprachsynthese verwirrt
SPRECHEN = {'Computer': 'Kompjuter', 'Clown': 'Klaun', 'Orange': 'Oransche'}

DATEINAMEN = {'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss'}

LOB = ['Super!', 'Toll gemacht!', 'Prima!', 'Klasse!', 'Wunderbar!']

# Ansagen der Spiele: Dateiname -> Text (aus ansagen.js, eine Quelle für App und Werkzeuge)
ANSAGEN = dict(re.findall(r"'([a-z0-9-]+)': \['([^']+)'", (PROJEKT / 'ansagen.js').read_text(encoding='utf-8')))

TEILE = ['buchstaben', 'laute', 'mehr', 'lob', 'ansagen', 'kisten', 'reime']


def woerter_aus_letters_js():
    text = (PROJEKT / 'letters.js').read_text(encoding='utf-8')
    return dict(re.findall(r"b: '(\w)', wort: '([^']+)'", text))


def weitere_woerter_aus_letters_js():
    """Buchstabe -> Liste weiterer Wörter aus "mehr: [['Affe', '🐒'], ...]"."""
    text = (PROJEKT / 'letters.js').read_text(encoding='utf-8')
    ergebnis = {}
    for b, liste in re.findall(r"b: '(\w)'.*?mehr: \[(.*?)\] \}", text):
        ergebnis[b] = re.findall(r"\['([^']+)', '[^']+'\]", liste)
    return ergebnis


def kisten_aus_kisten_js():
    """Wörter der Wörterkiste (id -> 'die Tasse') und Tierlaute (id -> 'Muuh') aus kisten.js."""
    text = (PROJEKT / 'kisten.js').read_text(encoding='utf-8')
    woerter = dict(re.findall(r"\['(\w+)', '([^']+)', '[^']+'(?:, '[^']+')?\]", text))
    tiere = dict(re.findall(r"(\w+): '([^']+)'", text.split('const TIERLAUTE')[1].split('};')[0]))
    return woerter, tiere


def reime_aus_reime_js():
    """Neue Wörter der Reim-Paare (Datei audio/reim-<id>.wav -> Wort) aus reime.js."""
    text = (PROJEKT / 'reime.js').read_text(encoding='utf-8')
    return dict((f'reim-{i}', w) for i, w in re.findall(r"\['(\w+)', '([^']+)', '[^']+', 'audio/reim-\w+\.wav'\]", text))


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


def sprecher_dateien():
    """Dateien mit der Sprecher-Stimme (aus dem Aufnahme-Studio) – die erzeugt Piper nie neu."""
    liste = PROJEKT / 'audio' / 'sprecher.json'
    return set(json.loads(liste.read_text(encoding='utf-8'))) if liste.exists() else set()


SPRECHER = sprecher_dateien()


def speichern(pfad, audio, rate):
    if pfad.name in SPRECHER and pfad.resolve().parent == (PROJEKT / 'audio').resolve():
        print('übersprungen (Sprecher-Aufnahme):', pfad.name)
        return
    audio = audio / max(1e-6, np.abs(audio).max()) * 0.9  # gleiche Lautstärke für alle Clips
    pcm = (audio * 32767).astype(np.int16)
    with wave.open(str(pfad), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def erzeugen(modell, ziel, teile):
    stimme = PiperVoice.load(str(modell))
    rate = stimme.config.sample_rate
    ziel.mkdir(parents=True, exist_ok=True)
    for b, wort in woerter_aus_letters_js().items():
        datei = DATEINAMEN.get(b, b)
        laut = synth(stimme, f'[[ {LAUTE[b]} ]]', tempo=1.3)
        if 'buchstaben' in teile:
            wort_audio = synth(stimme, SPRECHEN.get(wort, wort), tempo=1.15)
            clip = np.concatenate([laut, pause(rate, 0.35), laut, pause(rate, 0.5), wort_audio])
            speichern(ziel / f'{datei}.wav', clip, rate)
            speichern(ziel / f'{datei}-wort.wav', wort_audio, rate)
        if 'laute' in teile:
            speichern(ziel / f'{datei}-laut.wav', np.concatenate([laut, pause(rate, 0.35), laut]), rate)
        if 'mehr' in teile:
            # Weitere Wörter: Nummer 2, 3, … (Nummer 1 ist das Hauptwort)
            for nr, weiteres in enumerate(weitere_woerter_aus_letters_js().get(b, []), 2):
                wort_audio = synth(stimme, SPRECHEN.get(weiteres, weiteres), tempo=1.15)
                clip = np.concatenate([laut, pause(rate, 0.35), laut, pause(rate, 0.5), wort_audio])
                speichern(ziel / f'{datei}-{nr}.wav', clip, rate)
                speichern(ziel / f'{datei}-{nr}-wort.wav', wort_audio, rate)
    if 'lob' in teile:
        for i, satz in enumerate(LOB, 1):
            speichern(ziel / f'lob-{i}.wav', synth(stimme, satz, tempo=1.05), rate)
    if 'ansagen' in teile:
        for name, satz in ANSAGEN.items():
            speichern(ziel / f'ansage-{name}.wav', synth(stimme, satz, tempo=1.05), rate)
    if 'kisten' in teile:
        woerter, tiere = kisten_aus_kisten_js()
        for wid, wort in woerter.items():
            speichern(ziel / f'kiste-{wid}.wav', synth(stimme, wort, tempo=1.1), rate)
        for tid, laut in tiere.items():
            speichern(ziel / f'tier-{tid}.wav', synth(stimme, laut, tempo=1.0), rate)
    if 'reime' in teile:
        for datei, wort in reime_aus_reime_js().items():
            speichern(ziel / f'{datei}.wav', synth(stimme, wort, tempo=1.15), rate)
    print('fertig:', ziel, ', '.join(teile))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--stimme', help='Name der Stimme, z. B. de_DE-thorsten-high (ohne: alle)')
    p.add_argument('--ziel', help='Zielordner (Standard: audio-vergleich/<stimme>)')
    p.add_argument('--teile', default=','.join(TEILE), help=f'Kommagetrennt aus: {", ".join(TEILE)} (Standard: alle)')
    args = p.parse_args()
    teile = [t.strip() for t in args.teile.split(',') if t.strip()]
    unbekannt = set(teile) - set(TEILE)
    if unbekannt:
        p.error(f'unbekannte Teile: {", ".join(sorted(unbekannt))}')
    modelle = [STIMMEN / f'{args.stimme}.onnx'] if args.stimme else sorted(STIMMEN.glob('*.onnx'))
    for m in modelle:
        ziel = PROJEKT / args.ziel if args.ziel else PROJEKT / 'audio-vergleich' / m.stem
        erzeugen(m, ziel, teile)


if __name__ == '__main__':
    main()
