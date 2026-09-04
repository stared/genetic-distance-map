"""Era of an ancient sample from its label: pre (prehistoric), anc (ancient), med (medieval), mod (early modern).
Period tokens are matched after the country; when several match, the latest wins (e.g. LBA-EIA -> ancient).
Explicit dates (…BP, …CE) are used when present. Unmatched labels default to 'anc'."""
import re
PRE = r'\b(Paleolithic|Palaeolithic|UP|EUP|LUP|IUP|EP|Gravettian|Magdalenian|Aurignacian|Epigravettian|Epipaleolithic|Mesolithic|HG|LSA|MSA|Neolithic|N|EN|MN|LN|MLN|ENMN|EMN|FN|MN\d|LNCA|IBA|LBK|TRB|Funnelbeaker|Corded|Beaker|Pitted Ware|Megalithic|Yamnaya|Afanasievo|Andronovo|Sintashta|Srubnaya|Catacomb|Maykop|Kura-Araxes|Chalcolithic|CA|ECA|MCA|LCA|ChL|Eneolithic|Copper|Bronze|BA|EBA|MBA|LBA|MLBA|EMBA|LNBA|EBA\d|MBA\d|LBA\d|Mycenaean|Minoan|Trzciniec|Unetice|Cucuteni|Vinca|Starcevo|Cardial|Baden|Globular|Lengyel|Tripolye|Botai|Okunevo|Karasuk|Longshan|Dawenkou|Yangshao|Hongshan|Harappa|Indus|BMAC|Jomon|Shang|Erlitou|Single Grave|Early Metal Age|Nuragic|Paleo-Eskimo|Saqqaq|Dorset|Archaic|Preclassic|Formative|Sambaqui|Pastoral|PPNB|PPNA|Natufian|Iberomaurusian|Capsian|Stone Age|Metal Age|Paleometal|Clovis|Anzick|Paleo-Indian|Hoabinhian|Toalean)\b'
ANC = r'\b(Iron|IA|EIA|MIA|LIA|IA[I0-9]+|HP|Hallstatt|La Tene|Scythian|Sarmatian|Saka|Xiongnu|Etruscan|Classical|Classic|Hellenistic|Roman|Antiquity|Republic|Empire|Phoenician|Punic|Celt|Celtic|Gaul|Thracian|Dacian|Illyrian|Achaemenid|Parthian|Sassanid|Sasanian|Zhou|Han|Qin|Tasmola|Pazyryk|Wielbark|Przeworsk|Chernyakhov|Nabataean|Kushan|Wusun|Vandal|Goth|Gepid|Alan|Nubia|Kerma|Meroitic|Ptolemaic|Urartu|Urartian|Assyrian|Hittite|Phrygian|Lydian|Israelite|Judea|Canaanite|Yayoi|Kofun|Nasca|Moche|Paracas|Olmec|Maya|Teotihuacan|Wari|Tiwanaku|Ceramic|Wei|Three Kingdoms|Hun|Hunnic|Amorite|Philistine|Nok|Aksum|Garamantes|Numidian|Late Antiquity|LA|Unai|Old Bering Sea)\b'
MED = r'\b(Medieval|Viking|Avar|Anglo-Saxon|Arpadian|Conqueror|Lombard|Langobard|Longobard|Byzantine|Islamic|Umayyad|Abbasid|Fatimid|Moor|Andalus|Norse|Merovingian|Carolingian|Slav|Slavic|Khazar|Pecheneg|Cuman|Golden Horde|Mongol|Kipchak|Bulgar|Magyar|Rus|Novgorod|Crusader|Tang|Song|Liao|Jin|Yuan|Sui|Xianbei|Turkic|Uyghur|Khitan|Jurchen|Silla|Goryeo|Heian|Kamakura|Inca|Aztec|Postclassic|LIP|LH|Mississippian|Ancestral Puebloan|Anasazi|Chaco|Saxon|Frank|Frankish|Visigoth|Ostrogoth|Migration|Tubo|Saudeleur|Latte|Swahili|Kingdom|Sultanate|Norman|Baltic|Lithuanian|Prussian|Almohad|Almoravid|Plague|Black Death|Rurikid|Kievan|Vlach|Ottoman|Precolonial|Pre-Colonial|Neo-Aleut)\b'
MOD = r'\b(Modern|Early Modern|Late Modern|Colonial|Post-Medieval|Postmedieval|Ming|Qing|Joseon|Edo|Historical|Contact|Mission|Fuego Patagonian)\b'
def by_year(y):        # calendar year (negative = BCE) -> era
    return 'pre' if y < -800 else 'anc' if y < 500 else 'med' if y < 1500 else 'mod'
def era(core):
    s = (core.split('_', 1)[1] if '_' in core else '').replace('_', ' ')
    r = -1
    m = re.search(r'(\d+)\s*BP\b', s)
    if m: r = ['pre', 'anc', 'med', 'mod'].index(by_year(1950 - int(m.group(1))))
    m = re.search(r'(\d{3,4})\s*CE\b', s)
    if m: r = max(r, ['pre', 'anc', 'med', 'mod'].index(by_year(int(m.group(1)))))
    for i, rx in enumerate([PRE, ANC, MED, MOD]):
        if re.search(rx, s): r = max(r, i)
    return ['pre', 'anc', 'med', 'mod'][r] if r >= 0 else 'anc'
