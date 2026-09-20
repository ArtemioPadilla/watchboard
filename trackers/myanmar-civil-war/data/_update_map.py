import json

def load(f):
    with open(f, encoding='utf-8') as fh:
        return json.load(fh)

def save(f, data):
    with open(f, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')

TS16 = "2026-09-17T00:00:00.000Z"
TS17 = "2026-09-18T00:00:00.000Z"
TS18 = "2026-09-19T00:00:00.000Z"
TS19 = "2026-09-20T00:00:00.000Z"

new_points = [
    {
        "id": "hnamasaryit-monastery-airstrike-sep16",
        "lon": 95.85, "lat": 22.62,
        "cat": "junta-operation",
        "label": "Hnamasaryit Village Monastery (Shwebo)",
        "sub": "Shwebo Township, Sagaing Region — A junta jet killed the abbot and two elders during a water-plant opening ceremony on Sept 16, 2026.",
        "tier": 2, "date": "2026-09-16", "lastUpdated": TS16
    },
    {
        "id": "sittwe-ponnagyun-four-outposts-sep16",
        "lon": 92.86, "lat": 20.28,
        "cat": "territorial",
        "label": "Minchaung Bridge / Khamaungtaw / Aungmyaygon",
        "sub": "Sittwe-Ponnagyun border, Rakhine State — Arakan Army captured four junta outposts here in a Sept 15-16, 2026 counteroffensive.",
        "tier": 2, "date": "2026-09-16", "lastUpdated": TS16
    },
    {
        "id": "taungoo-expressway-ambush-sep16",
        "lon": 96.43, "lat": 18.94,
        "cat": "resistance",
        "label": "Yangon-Mandalay Expressway (Taungoo Sector)",
        "sub": "Taungoo District, Bago Region — PDF roadside bombs and ambush fire inflicted 20+ junta casualties over Sept 15-16, 2026.",
        "tier": 3, "date": "2026-09-16", "lastUpdated": TS16
    },
    {
        "id": "shwegu-battalion12-airstrike-sep17",
        "lon": 96.43, "lat": 24.22,
        "cat": "junta-operation",
        "label": "KIA Battalion 12 Position (Shwegu Township)",
        "sub": "Shwegu Township, Kachin State — Junta jets killed at least 17 KIA fighters in two strikes on Sept 17, 2026.",
        "tier": 2, "date": "2026-09-17", "lastUpdated": TS17
    },
    {
        "id": "hpruso-moso-suicide-drone-sep17",
        "lon": 97.20, "lat": 19.45,
        "cat": "junta-operation",
        "label": "Moso Village (Hpruso Township)",
        "sub": "Hpruso Township, Kayah (Karenni) State — A junta suicide drone killed 5 KNDF fighters, including a company commander, on Sept 17, 2026.",
        "tier": 3, "date": "2026-09-17", "lastUpdated": TS17
    },
    {
        "id": "loikaw-idp-relocation-sep18",
        "lon": 97.24, "lat": 19.70,
        "cat": "humanitarian",
        "label": "Parlaung / Daw Ta Yoe IDP Sites (E. Loikaw)",
        "sub": "Eastern Loikaw, Karenni State — Displaced civilians forced to relocate again by Sept 18, 2026 amid renewed junta drone/airstrike operations; returnees detained on arrival in Loikaw.",
        "tier": 2, "date": "2026-09-18", "lastUpdated": TS18
    },
    {
        "id": "myo-kone-shwegu-bombing-sep18",
        "lon": 96.55, "lat": 24.16,
        "cat": "junta-operation",
        "label": "Myo Kone Village (Shwegu Township)",
        "sub": "Shwegu Township, Kachin State — Junta aircraft killed 3 civilians and injured 10+ on Sept 18, 2026.",
        "tier": 3, "date": "2026-09-18", "lastUpdated": TS18
    },
    {
        "id": "khaunglanhpu-border-post30-sep18",
        "lon": 97.75, "lat": 27.45,
        "cat": "territorial",
        "label": "Border Post No. 30 (Khaunglanhpu Township)",
        "sub": "Far northern Kachin State — KIA-led forces captured this strategic junta base with a helicopter landing area on Sept 18, 2026.",
        "tier": 3, "date": "2026-09-18", "lastUpdated": TS18
    },
    {
        "id": "kanpetlet-chin-airstrike-sep19",
        "lon": 93.90, "lat": 21.05,
        "cat": "junta-operation",
        "label": "Kanpetlet Township Village",
        "sub": "Kanpetlet Township, Chin State — Junta jets killed 3 civilians in a 6-bomb strike on Sept 19, 2026.",
        "tier": 3, "date": "2026-09-19", "lastUpdated": TS19
    },
    {
        "id": "saw-township-convoy-buildup-sep19",
        "lon": 94.28, "lat": 21.35,
        "cat": "junta-operation",
        "label": "Laung She (Saw Township)",
        "sub": "Saw Township, Magway Region — A ~180-200 vehicle junta convoy massed here by Sept 19, 2026 ahead of a renewed Kanpetlet/Mindat offensive.",
        "tier": 2, "date": "2026-09-19", "lastUpdated": TS19
    }
]

new_lines = [
    {
        "id": "sac-airstrike-hnamasaryit-monastery-sep16",
        "from": [95.86, 20.87], "to": [95.85, 22.62],
        "cat": "junta-operation",
        "label": "SAC Jet: Meiktila Air Base → Hnamasaryit Monastery (Shwebo)",
        "date": "2026-09-16",
        "weaponType": "unknown", "confidence": "medium", "time": "12:30", "status": "hit",
        "casualties": "3 killed (abbot + 2 elders); 8 injured",
        "damage": "Monastery compound bombed during water-plant opening ceremony",
        "notes": "Junta Infantry Battalion 42 followed with artillery fire on the village.",
        "lastUpdated": TS16
    },
    {
        "id": "aa-counteroffensive-sittwe-ponnagyun-sep16",
        "from": [92.90, 20.15], "to": [92.86, 20.28],
        "cat": "resistance",
        "label": "AA Counteroffensive: Sittwe → Sittwe-Ponnagyun Outposts",
        "date": "2026-09-16",
        "weaponType": "unknown", "confidence": "medium", "status": "hit",
        "damage": "4 junta outposts captured (Minchaung Bridge area, Khamaungtaw, Aungmyaygon)",
        "notes": "Part of the AA counteroffensive against the junta's stalling Operation 4926.",
        "lastUpdated": TS16
    },
    {
        "id": "pdf-ambush-taungoo-expressway-sep16",
        "from": [96.43, 18.94], "to": [96.35, 19.05],
        "cat": "resistance",
        "label": "PDF Ambush: Taungoo → Yangon-Mandalay Expressway",
        "date": "2026-09-16",
        "weaponType": "unknown", "confidence": "low", "status": "hit",
        "casualties": "20+ junta killed/wounded over Sept 15-16",
        "notes": "Roadside bombs against 2 of 3 junta columns clearing the expressway, followed by gunfire; repeated over two days. Single-sourced via Burma Coup Resistance Notes.",
        "lastUpdated": TS16
    },
    {
        "id": "sac-airstrike-shwegu-battalion12-sep17",
        "from": [96.13, 19.75], "to": [96.43, 24.22],
        "cat": "junta-operation",
        "label": "SAC Jets: Naypyidaw → KIA Battalion 12 (Shwegu)",
        "date": "2026-09-17",
        "weaponType": "unknown", "confidence": "medium", "time": "12:00", "status": "hit",
        "casualties": "17+ killed, 19 wounded",
        "notes": "Two bombing strikes on a KIA Battalion 12 position; KIA still verifying whether the site was a training camp.",
        "lastUpdated": TS17
    },
    {
        "id": "suicide-drone-hpruso-moso-sep17",
        "from": [97.21, 19.68], "to": [97.20, 19.45],
        "cat": "junta-operation",
        "label": "SAC Suicide Drone: Loikaw Area → Moso Village (Hpruso)",
        "date": "2026-09-17",
        "weaponType": "drone_loitering", "confidence": "low", "status": "hit",
        "casualties": "5 KNDF fighters killed, incl. company commander",
        "notes": "Single-sourced via MoeMaKa CDM News; part of an intensifying pattern of loitering-munition use in Karenni State.",
        "lastUpdated": TS17
    },
    {
        "id": "sac-airstrike-myo-kone-shwegu-sep18",
        "from": [96.13, 19.75], "to": [96.55, 24.16],
        "cat": "junta-operation",
        "label": "SAC Aircraft: Naypyidaw → Myo Kone Village (Shwegu)",
        "date": "2026-09-18",
        "weaponType": "unknown", "confidence": "low", "time": "19:00", "status": "hit",
        "casualties": "3 civilians killed, 10+ injured",
        "notes": "Single-sourced via MoeMaKa CDM News.",
        "lastUpdated": TS18
    },
    {
        "id": "kia-border-post30-khaunglanhpu-sep18",
        "from": [97.60, 27.30], "to": [97.75, 27.45],
        "cat": "resistance",
        "label": "KIA-Led Advance: Khaunglanhpu → Border Post No. 30",
        "date": "2026-09-18",
        "weaponType": "unknown", "confidence": "low", "status": "hit",
        "damage": "Junta base with helicopter landing area captured; weapons/ammunition seized",
        "notes": "Single-sourced via MoeMaKa CDM News.",
        "lastUpdated": TS18
    },
    {
        "id": "sac-airstrike-kanpetlet-sep19",
        "from": [93.98, 20.68], "to": [93.90, 21.05],
        "cat": "junta-operation",
        "label": "SAC Jets: Mindat Area → Kanpetlet Township Village",
        "date": "2026-09-19",
        "weaponType": "unknown", "confidence": "low", "time": "07:00", "status": "hit",
        "casualties": "3 civilians killed",
        "notes": "Two jets, three bombing runs, six bombs; follows a Sept 16 strike on a school in Maw Chaung village. Single-sourced via MoeMaKa CDM News.",
        "lastUpdated": TS19
    },
    {
        "id": "sac-convoy-magway-saw-township-sep19",
        "from": [94.93, 20.15], "to": [94.28, 21.35],
        "cat": "junta-operation",
        "label": "SAC Convoy: Magway → Laung She (Saw Township)",
        "date": "2026-09-19",
        "weaponType": "unknown", "confidence": "medium", "status": "unknown",
        "notes": "~180-200 vehicles incl. missile-launcher and heavy-weapons vehicles, routed via Pwintbyu and Salin; assessed as buildup for a renewed Kanpetlet/Mindat offensive. Corroborated by MoeMaKa CDM News and The Irrawaddy.",
        "lastUpdated": TS19
    }
]

pts = load('map-points.json')
existing_ids = {p['id'] for p in pts}
added = 0
for p in new_points:
    if p['id'] not in existing_ids:
        pts.append(p)
        added += 1
save('map-points.json', pts)
print(f"map-points: added {added}, total {len(pts)}")

lines = load('map-lines.json')
existing_ids = {l['id'] for l in lines}
added = 0
for l in new_lines:
    if l['id'] not in existing_ids:
        lines.append(l)
        added += 1
save('map-lines.json', lines)
print(f"map-lines: added {added}, total {len(lines)}")
