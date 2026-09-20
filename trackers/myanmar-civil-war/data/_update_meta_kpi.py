import json

def load(f):
    with open(f, encoding='utf-8') as fh:
        return json.load(fh)

def save(f, data):
    with open(f, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')

NOW = "2026-09-20T18:30:00.000Z"

# ---------- KPIs ----------
kpis = load('kpis.json')
for k in kpis:
    if k['id'] == 'days-since-coup':
        k['value'] = "2,057"
        k['deltaDetail'] = {"value": 4, "direction": "up", "period": "since Sep 16, 2026"}
        k['lastUpdated'] = "2026-09-20"
save('kpis.json', kpis)
print("kpis updated")

# ---------- meta.json ----------
meta = load('meta.json')
meta['dayCount'] = 2057
meta['dateline'] = "20 SEP 2026"
meta['heroHeadline'] = (
    "Arakan Army Seizes Sittwe-Ponnagyun Outposts as Operation 4926 Falters; "
    "Junta Airstrike Kills 17+ KIA Fighters in Shwegu — Day 2,057"
)
meta['heroSubtitle'] = (
    "By Day 2,057 (September 20, 2026), the junta's multi-front 'Operation 4926' offensive in Rakhine State continued "
    "to falter: the Arakan Army captured four junta outposts along the Sittwe-Ponnagyun border on September 15-16, "
    "including positions near Minchaung Bridge and the villages of Khamaungtaw and Aungmyaygon, amid heavy junta "
    "casualties including commanding officers. The same day, a junta jet from Meiktila Air Base bombed a monastery "
    "in Hnamasaryit Village, Shwebo Township, killing the abbot and two elders during a water-plant opening ceremony. "
    "In Kachin State, junta jets killed at least 17 KIA Battalion 12 fighters in a September 17 strike near Shwegu, "
    "and a follow-on airstrike on Myo Kone village in the same township killed 3 civilians on September 18; a suicide "
    "(loitering) drone separately killed 5 KNDF fighters near Moso village, Hpruso Township, in Karenni State on "
    "September 17, part of an intensifying pattern of loitering-munition use against resistance forces. KIA-led forces "
    "captured the strategic Border Post No. 30 in far-northern Khaunglanhpu Township on September 18, while PDF fighters "
    "inflicted 20+ junta casualties in roadside-bomb ambushes along the Yangon-Mandalay Expressway near Taungoo over "
    "September 15-16. In Karenni State, renewed junta drone and airstrike operations forced displaced civilians "
    "sheltering east of Loikaw to relocate again by September 18, with returnees to the city detained on arrival. "
    "The junta also massed a roughly 180-200 vehicle convoy, including missile-launcher and heavy-weapons vehicles, "
    "from Magway toward Saw Township by September 19 in an apparent buildup for a renewed Kanpetlet-Mindat offensive "
    "in Chin State, where a separate airstrike killed 3 civilians in Kanpetlet Township that morning. AAPP's cumulative "
    "tally remains 8,335+ confirmed deaths since the 2021 coup, with 31,887 people arrested and 22,663 still detained "
    "or unverified; IDPs remain at approximately 5.2 million, with only 26% of the 2025 UN humanitarian appeal funded."
)
meta['footerNote'] = meta.get('footerNote', '')
meta['lastUpdated'] = NOW
meta['breaking'] = True
meta['provenance'] = {
    "method": "llm",
    "model": "claude",
    "generatedAt": NOW,
    "pipeline": "update-data"
}
save('meta.json', meta)
print("meta updated")

# ---------- political.json ----------
pol = load('political.json')
for p in pol:
    if p['id'] == 'kyaw-moe-tun':
        p['role'] = (
            "Myanmar's UN Ambassador, appointed under the deposed NLD government; has refused to recognize the junta and "
            "continues to represent the elected government at the UN. On Sept 12, 2026 the SAC charged him with embezzling "
            "roughly $2.76M and over €38,000 in state funds under Penal Code Section 122(2), the Unlawful Associations Act "
            "and the Telecommunications Law, declared him a fugitive, and added a property-protection charge for continuing "
            "to occupy a state-owned residence after his dismissal. By Sept 13, the regime's Ministry of Foreign Affairs said "
            "it was formally seeking his arrest via INTERPOL and the U.S. National Central Bureau on six charges, including "
            "high treason. The announcement came ahead of a UN Credentials Committee decision on whether he retains Myanmar's "
            "seat or is replaced by the regime's preferred candidate, Aung Thurein. Supporters rallied outside the UK "
            "Parliament Sept 12 in solidarity, with a further rally planned outside UN Headquarters Sept 22."
        )
        p['lastUpdated'] = "2026-09-19"
save('political.json', pol)
print("political updated")
