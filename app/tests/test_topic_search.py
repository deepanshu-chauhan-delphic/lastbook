#!/usr/bin/env python3
"""Topic search beyond a-z: web/words.js run in Node, with Intl.Segmenter, without it, and with one that throws.

  python3 -B -m unittest app.tests.test_topic_search [-v]

Accented words stay whole and fold (niño finds nino), short words in Chinese, Hindi, Hebrew and Arabic count,
typed symbols never reach a RegExp, Turkish İ folds to i, and every English query in the list ranks exactly as it
did before. Words used outside the US (torch, rubbish, 999, 108, power cut) find the guide their US word finds.
Needs Node on PATH; skipped without it. Never packaged."""
import json, re, shutil, subprocess, tempfile, unicodedata, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
NODE = shutil.which('node')
WORDS = ROOT / 'web' / 'words.js'

# The stop words app.js passes in, read from app.js so the test follows it.
QSTOP = re.search(r"const QSTOP = new Set\('([^']*)'\.split", (ROOT / 'web' / 'app.js').read_text(encoding='utf-8')).group(1).split(' ')
TOPICS = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((ROOT / 'content' / 'topics').glob('*.json'))]

# Everyday English questions. Each must give the same topics and choices as the old a-z matching,
# including words joined by punctuation, which the old split took apart.
ENGLISH = [
    'how do I purify water', 'boil water', 'is the tap water safe', 'bleach for drinking water', 'find water',
    'deep cut bleeding', 'broken leg', 'burn on my hand', 'cpr', 'choking', 'fever', 'dehydration', 'snake bite',
    'hypothermia', 'the power is out', 'generator', 'solar panel', 'car battery', 'earthquake', 'flood',
    'wildfire smoke', 'store food', 'cook without power', 'stay warm', 'shelter', 'toilet', 'radio',
    'grow vegetables', 'save seeds', 'first aid kit', "water's gone brown", "don't have power", "can't breathe",
    'how to start a fire', 'baby', 'medicine', 'keep food cold', 'clean water storage container',
    'water.boil', 'first_aid kit', 'e.coli', 'boil:water', 'https://example.org/water',
]

# Query -> words, the same with or without Intl.Segmenter (every script here uses spaces).
WORDS_BOTH = {
    '¿Cómo purifico el agua para el niño?': ['como', 'purifico', 'agua', 'para', 'nino'],   # accents whole, then folded
    'niño': ['nino'],                                     # precomposed ñ
    'niño': ['nino'],                                    # n + combining tilde (NFD)
    'crème brûlée': ['creme', 'brulee'],        # every accent goes, not just the first
    "How do I purify water's taste?": ['purify', 'water', 'taste'],   # water's -> water, as before
    'don’t have water': ['water'],                         # curly apostrophe, stop words
    'ｗａｔｅｒ': ['water'],                # full-width Latin
    'water.boil first_aid e.coli boil:water': ['water', 'boil', 'first', 'aid', 'coli', 'boil', 'water'],
    'water­proof': ['water', 'proof'],                     # soft hyphen separates, as in FTS5
    'می‌خواهم': ['می', 'خواهم'],   # ZWNJ separates
    'आग אש دم': ['आग', 'אש', 'دم'],   # two-letter words without case
    'पानी उबालें': ['पानी', 'उबालें'],   # marks stay in words
    'ab 42 112 go': ['112'],                                    # short Latin words and numbers dropped, as before
    '\U00010428\U0001042f': [],                                # two letters outside the BMP: still two, still too short
    'c++ (water': ['water'],
    '[a': [], '(': [], '\\': [], '*?+{': [], '': [],            # symbols: no words, no exception
    'İstanbul': ['istanbul'],
    'éclair': ['eclair'],
}

FOLD = {
    'İstanbul': 'istanbul', 'ISTANBUL': 'istanbul', 'ılık': 'ılık',   # dotless ı stays
    'Straße': 'straße', 'ΣΟΦΟΣ': 'σοφοσ',   # ß stays, ς -> σ, as FTS5
    'ｗａｔｅｒ': 'water', 'niño': 'nino', 'niño': 'nino', 'Jalapeño': 'jalapeno',
    'καφές': 'καφέσ',   # Greek accents kept, as in FTS5
    'crème brûlée': 'creme brulee',
}

MATCH = [  # text, word, expected
    ['chocolate éclair', 'eclair', True], ['Chocolate Éclair', 'eclair', True],
    ['煮沸 水', '水', True], ['怎么净化水', '净化', True],
    ['drink water', 'rink', False], ['drink water', 'drin', True], ['Rainwater', 'water', False],
    ['Straße', 'strasse', False], ['ΣΟΦΟΣ', 'σοφοσ', True],
    ['İstanbul', 'istanbul', True], ['72-hour kit', 'hour', True], ['Water: purify, boil', 'purif', True],
]

# Words used outside the US, each with the US word the guides already had. A search for the first must give
# the same guides and choices, in the same order, as a search for the second.
SAME_AS = {
    'torch': 'flashlight', 'rubbish': 'garbage', 'rubbish pickup': 'trash pickup', 'tinned food': 'canned food',
    '999': '911', '112': '911', '111': '911', 'adrenaline': 'epinephrine',
    '108': '911', 'geyser': 'water heater',
}
# These sit in a guide's keywords only, so they open the same guide first but pick no choice of their own.
# In a hint, "bushfire" would also answer "bus" and "barbecue" would answer "bar" (a search word matches the
# start of a word), and "heatwave" or "sanitiser" beside the US spelling would read oddly.
SAME_GUIDE = {
    'bushfire': 'wildfire', 'bushfire smoke': 'wildfire smoke', 'heatwave': 'heat wave', 'barbecue': 'grill',
    'bbq': 'grill', 'sanitiser': 'sanitizer', 'hand sanitiser': 'hand sanitizer',
    'heatstroke': 'heat stroke',
}
# Words used in India with no single US twin among the guides: [guide, choice] that comes first.
FIRST = {
    'power cut': ['power', 'first-hours'], 'cyclone': ['disaster', 'flood'], 'monsoon': ['disaster', 'flood'],
    'borewell': ['water', 'outside'], 'tubewell': ['water', 'outside'], 'loose motions': ['hurt', 'diarrhea'],
}
# Searches the new words must not disturb: [guide, choice] that comes first.
UNDISTURBED = {
    'bus': ['disaster', 'no-car'], 'no bus': ['disaster', 'no-car'], 'bar soap': ['sanitation', 'hands'],
    'heat wave': ['shelter', 'heat'], 'grill': ['food', 'cook'], 'canned food': ['food', 'cook'],
    'cut': ['hurt', 'bleeding'], 'well': ['land', 'water-source'], 'storm': ['disaster', 'flood'],
}
TOPS = sorted({*SAME_AS, *SAME_AS.values(), *SAME_GUIDE, *SAME_GUIDE.values(), *FIRST, *UNDISTURBED})

# A made-up topic in Spanish and Chinese: found by Spanish words and by a single Han character.
OWN = {'id': 'own', 'title': 'Agua potable', 'short': 'Hervir el agua', 'keywords': ['水'], 'choices': []}
RANK_OWN = [['agua', [OWN]], ['水', [OWN]], ['hervir', [OWN]]]

CASES = {
    'stop': QSTOP, 'fold': list(FOLD), 'match': [m[:2] for m in MATCH], 'rank': ENGLISH, 'topics': TOPICS,
    'rankOwn': RANK_OWN,
    'words': list(WORDS_BOTH) + ['怎么净化水', '水をきれいにする方法',
                                 '물 끓이기', 'น้ำ'],
    'tops': TOPS,
}


def run(mode):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'cases.json'
        p.write_text(json.dumps(CASES, ensure_ascii=False), encoding='utf-8')
        r = subprocess.run([NODE, str(HERE / 'topic_search_test.mjs'), str(WORDS), str(p), mode],
                           capture_output=True, text=True, encoding='utf-8', timeout=60)
    if r.returncode:
        raise AssertionError(r.stderr[-1500:])
    return json.loads(r.stdout)


def ok(entry):
    if 'error' in entry:
        raise AssertionError(entry['error'])
    return entry['ok']


@unittest.skipUnless(NODE, 'needs node on PATH')
class TopicSearch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seg, cls.wk, cls.fb, cls.thr = run('segmenter'), run('webkit'), run('fallback'), run('throwing')
        cls.modes = (cls.seg, cls.wk, cls.fb, cls.thr)

    def words(self, r):
        return dict(zip(CASES['words'], (ok(e) for e in r['words'])))

    def test_modes(self):
        self.assertTrue(self.seg['segmenter'])
        self.assertTrue(self.wk['segmenter'])
        self.assertFalse(self.fb['segmenter'])
        self.assertFalse(self.thr['segmenter'])
        self.assertEqual(self.thr, self.fb)                       # a throwing Segmenter falls back cleanly

    def test_fold(self):
        for r in self.modes:
            self.assertEqual(dict(zip(FOLD, r['fold'])), FOLD)

    def test_turkish_i_order(self):
        # Shows why the order matters: removing marks from NFC "İ" finds none, and lower-casing it afterwards
        # leaves "i" + U+0307, which no longer matches "istanbul". The fold assertions check words.js itself.
        marks_first = ''.join(ch for ch in unicodedata.normalize('NFC', 'İ') if not unicodedata.combining(ch)).lower()
        self.assertEqual(marks_first, 'i̇')
        for r in self.modes:
            self.assertEqual(r['fold'][0], 'istanbul')

    def test_query_words(self):
        for r in self.modes:
            w = self.words(r)
            for q, expect in WORDS_BOTH.items():
                with self.subTest(q=q, segmenter=r['segmenter']):
                    self.assertEqual(w[q], expect)

    def test_scripts_without_spaces(self):
        for r in (self.seg, self.wk):
            w = self.words(r)
            zh = w['怎么净化水']
            self.assertEqual(''.join(zh), '怎么净化水')      # nothing dropped
            self.assertTrue(all(1 <= len(x) <= 2 for x in zh))                  # one- and two-character words count
            ja = w['水をきれいにする方法']
            self.assertIn('水', ja)
            self.assertIn('方法', ja)
            self.assertIn('물', w['물 끓이기'])              # Korean 물 (water), one syllable
            self.assertTrue(w['น้ำ'])                            # Thai น้ำ (water)
        for r in (self.fb, self.thr):                                           # no segmenter: the run stays whole
            self.assertEqual(self.words(r)['怎么净化水'], ['怎么净化水'])

    def test_match(self):
        for r in self.modes:
            self.assertEqual([ok(e) for e in r['match']], [m[2] for m in MATCH])

    def test_rank_non_english_topic(self):
        for r in self.modes:
            self.assertEqual([ok(e) for e in r['rankOwn']], [[['own', None]]] * 3)

    def test_english_ranks_as_before(self):
        for r in self.modes:
            for case in r['rank']:
                with self.subTest(q=case['q'], segmenter=r['segmenter']):
                    self.assertEqual(ok(case['now']), case['before'])
        self.assertGreater(sum(1 for c in self.seg['rank'] if c['before']), 30)   # the list does reach the guides

    def test_words_used_outside_the_us(self):
        for r in self.modes:
            top = dict(zip(TOPS, (ok(e) for e in r['tops'])))
            for q, us in SAME_AS.items():
                with self.subTest(q=q, us=us, segmenter=r['segmenter']):
                    self.assertTrue(top[us])                       # the US word does find a guide
                    self.assertEqual(top[q], top[us])
            for q, us in SAME_GUIDE.items():
                with self.subTest(q=q, us=us, segmenter=r['segmenter']):
                    self.assertTrue(top[q])
                    self.assertEqual(top[q][0][0], top[us][0][0])
            for q, first in [*FIRST.items(), *UNDISTURBED.items()]:
                with self.subTest(q=q, segmenter=r['segmenter']):
                    self.assertEqual(top[q][0], first)


if __name__ == '__main__':
    unittest.main()
