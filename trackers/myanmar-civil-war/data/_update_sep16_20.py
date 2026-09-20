import json, io

def load(f):
    with open(f, encoding='utf-8') as fh:
        return json.load(fh)

def save(f, data):
    with open(f, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')

NOW = "2026-09-20T18:30:00.000Z"

# ---------- EVENTS ----------

events_2026_09_16 = [
    {
        "id": "shwebo-hnamasaryit-monastery-airstrike-sep16",
        "title": "Junta Jet Bombs Monastery During Water Plant Ceremony in Shwebo Township, Killing Abbot and Two Elders",
        "type": "military",
        "detail": "A Myanmar Air Force fighter jet from Meiktila Air Base dropped three bombs on a monastery compound in Hnamasaryit Village, Shwebo Township, Sagaing Region, around 12:30 p.m. on September 16, 2026, as the 43-year-old abbot led a ceremony handing over a newly built community water purification plant. The abbot and two village elders in their 60s were killed instantly; eight others were injured. Junta Infantry Battalion 42 followed the airstrike with artillery fire on the village.",
        "sources": [
            {
                "name": "Burma News International (BNI)",
                "tier": 2,
                "url": "https://www.bnionline.net/en/news/myanmar-junta-airstrike-shwebo-monastery-kills-3-during-water-plant-opening",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "image",
                "url": "https://www.bnionline.net/en/news/myanmar-junta-airstrike-shwebo-monastery-kills-3-during-water-plant-opening",
                "caption": "Aftermath of the September 16 junta airstrike on a monastery in Hnamasaryit Village, Shwebo Township.",
                "source": "Burma News International",
                "thumbnail": "https://www.bnionline.net/sites/bnionline.net/files/news-images/091826_nmg_eng_11.jpg"
            }
        ],
        "weaponTypes": ["unknown"],
        "confidence": "medium",
        "date": "2026-09-16",
        "year": "2026"
    },
    {
        "id": "aa-sittwe-ponnagyun-four-outposts-sep16",
        "title": "Arakan Army Seizes Four Junta Outposts Along Sittwe-Ponnagyun Border as Operation 4926 Falters",
        "type": "military",
        "detail": "In a counteroffensive on September 15-16, 2026, Arakan Army troops captured four junta outposts along the Sittwe-Ponnagyun border in Rakhine State, including positions near Minchaung Bridge and the villages of Khamaungtaw and Aungmyaygon near the Shwe Min Gan naval station. The gains came as the junta's 'Operation 4926' offensive, launched September 4 with five 170-200 troop columns, continued to stall with heavy casualties, including among commanding officers, and tactical retreats.",
        "sources": [
            {
                "name": "Burma News International (BNI)",
                "tier": 2,
                "url": "https://www.bnionline.net/en/news/arakan-army-seizes-four-myanmar-junta-outposts-sittwe-ponnagyun-counteroffensive",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "image",
                "url": "https://www.bnionline.net/en/news/arakan-army-seizes-four-myanmar-junta-outposts-sittwe-ponnagyun-counteroffensive",
                "caption": "Arakan Army troops following the capture of junta outposts along the Sittwe-Ponnagyun border.",
                "source": "Burma News International",
                "thumbnail": "https://www.bnionline.net/sites/bnionline.net/files/news-images/091926_dmg_2_0.jpg"
            }
        ],
        "confidence": "medium",
        "date": "2026-09-16",
        "year": "2026"
    },
    {
        "id": "taungoo-expressway-pdf-ambush-sep16",
        "title": "PDF Roadside Bombs and Ambush Fire Inflict 20+ Junta Casualties Along Yangon-Mandalay Expressway Near Taungoo",
        "type": "military",
        "detail": "Three junta columns left the Southern Regional Command headquarters in Taungoo on September 15, 2026 to clear PDF units from a stretch of the Yangon-Mandalay Expressway. PDF fighters detonated roadside bombs against two of the columns and followed up with gunfire; the ambush was repeated the next day, September 16. Over the two days, PDF sources say the operations inflicted at least 20 junta casualties killed and wounded. Junta troops responded by firing mortars into nearby civilian villages.",
        "sources": [
            {
                "name": "Burma Coup Resistance Notes",
                "tier": 3,
                "url": "https://burmacoupresistancenotes.substack.com/p/burma-coup-resistance-notes-september-860",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://burmacoupresistancenotes.substack.com/p/burma-coup-resistance-notes-september-860",
                "caption": "Burma Coup Resistance Notes report on the Sept 15-16 PDF roadside-bomb ambushes near Taungoo.",
                "source": "Burma Coup Resistance Notes",
                "thumbnail": "https://burmacoupresistancenotes.substack.com/p/burma-coup-resistance-notes-september-860"
            }
        ],
        "confidence": "low",
        "date": "2026-09-16",
        "year": "2026"
    }
]

events_2026_09_17 = [
    {
        "id": "shwegu-kia-battalion12-airstrike-sep17",
        "title": "Junta Jets Bomb KIA Battalion 12 Position in Shwegu Township, Killing at Least 17",
        "type": "military",
        "detail": "Myanmar Air Force jets carried out two bombing strikes on a position held by Kachin Independence Army Battalion 12 in Shwegu Township, Kachin State, on September 17, 2026, killing at least 17 and wounding 19. Shwegu lies roughly 36 km west of Bhamo, where the junta and KIA have fought for more than nine months. KIA spokesman Col. Naw Bu said the group was still verifying reports that the bombed site was a training camp, and that casualty figures had not been independently confirmed.",
        "sources": [
            {
                "name": "The Irrawaddy",
                "tier": 2,
                "url": "https://www.irrawaddy.com/news/burma/myanmar-junta-bombs-kia-position-in-shwegu-killing-at-least-17.html",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://www.irrawaddy.com/news/burma/myanmar-junta-bombs-kia-position-in-shwegu-killing-at-least-17.html",
                "caption": "The Irrawaddy report on the September 17 junta airstrike on a KIA Battalion 12 position in Shwegu Township.",
                "source": "The Irrawaddy",
                "thumbnail": "https://www.irrawaddy.com/news/burma/myanmar-junta-bombs-kia-position-in-shwegu-killing-at-least-17.html"
            }
        ],
        "weaponTypes": ["unknown"],
        "confidence": "medium",
        "date": "2026-09-17",
        "year": "2026"
    },
    {
        "id": "hpruso-suicide-drone-kndf-sep17",
        "title": "Suicide-Drone Strike Kills Five KNDF Fighters, Including Company Commander, Near Moso Village",
        "type": "military",
        "detail": "A Myanmar military suicide (loitering) drone struck a Karenni Nationalities Defence Force (KNDF) position near Moso village, Hpruso Township, Kayah (Karenni) State, on September 17, 2026, killing five fighters including a company commander. The strike is part of an intensifying pattern of loitering-munition use by the junta against resistance positions across Karenni State this month.",
        "sources": [
            {
                "name": "MoeMaKa CDM News",
                "tier": 3,
                "url": "https://moemaka.net/eng/2026/09/september-19-2026-m-cdm-domestic-news/",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://moemaka.net/eng/2026/09/september-19-2026-m-cdm-domestic-news/",
                "caption": "MoeMaKa CDM domestic news digest reporting the September 17 suicide-drone strike near Moso village, Hpruso Township.",
                "source": "MoeMaKa CDM News",
                "thumbnail": "https://moemaka.net/eng/2026/09/september-19-2026-m-cdm-domestic-news/"
            }
        ],
        "weaponTypes": ["drone_loitering"],
        "confidence": "low",
        "date": "2026-09-17",
        "year": "2026"
    }
]

events_2026_09_18 = [
    {
        "id": "loikaw-idp-relocation-sep18",
        "title": "Displaced Karenni Civilians Forced to Relocate Again as Junta Drone and Airstrike Operations Intensify Around Loikaw",
        "type": "humanitarian",
        "detail": "Nearly half of the internally displaced people sheltering in the Parlaung and Daw Ta Yoe areas east of Loikaw, Karenni (Kayah) State, were forced to return toward Loikaw city by September 18, 2026 amid renewed junta drone operations, ground columns and airstrikes. Residents returning to the city in recent days have been detained and interrogated. The displacement follows airstrikes and drone attacks on eastern Loikaw and neighboring Shadaw Township between September 4-8 that killed 5 civilians, including children, injured at least 15 others, and destroyed multiple homes.",
        "sources": [
            {
                "name": "Burma News International (BNI)",
                "tier": 2,
                "url": "https://www.bnionline.net/en/news/idps-forced-relocate-again-eastern-loikaw-security-deteriorates",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://www.bnionline.net/en/news/idps-forced-relocate-again-eastern-loikaw-security-deteriorates",
                "caption": "BNI report on renewed IDP displacement around eastern Loikaw as security deteriorates.",
                "source": "Burma News International",
                "thumbnail": "https://www.bnionline.net/en/news/idps-forced-relocate-again-eastern-loikaw-security-deteriorates"
            }
        ],
        "confidence": "medium",
        "date": "2026-09-18",
        "year": "2026"
    },
    {
        "id": "myo-kone-shwegu-bombing-sep18",
        "title": "Junta Aircraft Bomb Myo Kone Village in Shwegu Township, Killing Three Civilians",
        "type": "military",
        "detail": "Myanmar military aircraft bombed Myo Kone village, Shwegu Township, Kachin State, around 7:00 p.m. on September 18, 2026. Three civilians were killed at the scene and at least 10 others were injured. The strike came days after a separate junta airstrike killed at least 17 KIA Battalion 12 fighters elsewhere in Shwegu Township on September 17.",
        "sources": [
            {
                "name": "MoeMaKa CDM News",
                "tier": 3,
                "url": "https://moemaka.net/eng/2026/09/september-20-2026-m-cdm-domestic-news/",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://moemaka.net/eng/2026/09/september-20-2026-m-cdm-domestic-news/",
                "caption": "MoeMaKa CDM domestic news digest reporting the September 18 bombing of Myo Kone village, Shwegu Township.",
                "source": "MoeMaKa CDM News",
                "thumbnail": "https://moemaka.net/eng/2026/09/september-20-2026-m-cdm-domestic-news/"
            }
        ],
        "weaponTypes": ["unknown"],
        "confidence": "low",
        "date": "2026-09-18",
        "year": "2026"
    },
    {
        "id": "khaunglanhpu-border-post30-capture-sep18",
        "title": "KIA-Led Forces Capture Strategic Border Post No. 30 in Khaunglanhpu Township",
        "type": "military",
        "detail": "Kachin Independence Army and allied forces captured Border Post No. 30, a strategic junta base equipped with a helicopter landing area, in Khaunglanhpu Township in far northern Kachin State on September 18, 2026, seizing weapons and ammunition in the process.",
        "sources": [
            {
                "name": "MoeMaKa CDM News",
                "tier": 3,
                "url": "https://moemaka.net/eng/2026/09/september-19-2026-m-cdm-domestic-news/",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://moemaka.net/eng/2026/09/september-19-2026-m-cdm-domestic-news/",
                "caption": "MoeMaKa CDM domestic news digest reporting the September 18 KIA-led capture of Border Post No. 30, Khaunglanhpu Township.",
                "source": "MoeMaKa CDM News",
                "thumbnail": "https://moemaka.net/eng/2026/09/september-19-2026-m-cdm-domestic-news/"
            }
        ],
        "confidence": "low",
        "date": "2026-09-18",
        "year": "2026"
    }
]

events_2026_09_19 = [
    {
        "id": "kanpetlet-chin-airstrike-sep19",
        "title": "Junta Jets Bomb Kanpetlet Township Village, Killing Three Civilians",
        "type": "military",
        "detail": "Two Myanmar Air Force fighter jets carried out three bombing runs over a village in Kanpetlet Township, Chin State, around 7:00 a.m. on September 19, 2026, dropping six bombs and killing three civilians while damaging several homes. It followed a September 16 airstrike that damaged a school in the township's Maw Chaung village.",
        "sources": [
            {
                "name": "MoeMaKa CDM News",
                "tier": 3,
                "url": "https://moemaka.net/eng/2026/09/september-20-2026-m-cdm-domestic-news/",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://moemaka.net/eng/2026/09/september-20-2026-m-cdm-domestic-news/",
                "caption": "MoeMaKa CDM domestic news digest reporting the September 19 airstrike on a Kanpetlet Township village.",
                "source": "MoeMaKa CDM News",
                "thumbnail": "https://moemaka.net/eng/2026/09/september-20-2026-m-cdm-domestic-news/"
            }
        ],
        "weaponTypes": ["unknown"],
        "confidence": "low",
        "date": "2026-09-19",
        "year": "2026"
    },
    {
        "id": "magway-convoy-kanpetlet-buildup-sep19",
        "title": "180-Truck Junta Convoy Moves Toward Saw Township for Renewed Kanpetlet-Mindat Offensive",
        "type": "military",
        "detail": "A junta convoy of roughly 180-200 vehicles, including missile-launcher and heavy-weapons vehicles, departed Magway on September 19, 2026, routing via Pwintbyu and Salin toward Laung She in Saw Township near the Magway-Chin border, with additional security columns deployed along the Laung She-Sidoktaya and Laung She-Saw roads. Observers assessed the buildup as preparation for renewed operations toward Kanpetlet and Mindat in southern Chin State, following a 300-troop column that entered Saw Township on September 12 whose route PDF fighters found littered with discarded uniforms, a sign of conscript desertions.",
        "sources": [
            {
                "name": "MoeMaKa CDM News",
                "tier": 3,
                "url": "https://moemaka.net/eng/2026/09/september-20-2026-m-cdm-domestic-news/",
                "pole": "western"
            },
            {
                "name": "The Irrawaddy",
                "tier": 2,
                "url": "https://www.irrawaddy.com/news/burma/myanmar-military-steps-up-chin-offensive-with-airstrikes-and-troop-buildup.html",
                "pole": "western"
            }
        ],
        "media": [
            {
                "type": "article",
                "url": "https://www.irrawaddy.com/news/burma/myanmar-military-steps-up-chin-offensive-with-airstrikes-and-troop-buildup.html",
                "caption": "The Irrawaddy report on the junta troop buildup in Magway Region ahead of a renewed Chin State offensive.",
                "source": "The Irrawaddy",
                "thumbnail": "https://www.irrawaddy.com/news/burma/myanmar-military-steps-up-chin-offensive-with-airstrikes-and-troop-buildup.html"
            }
        ],
        "confidence": "medium",
        "date": "2026-09-19",
        "year": "2026"
    }
]

for fname, evs in [
    ("events/2026-09-16.json", events_2026_09_16),
    ("events/2026-09-17.json", events_2026_09_17),
    ("events/2026-09-18.json", events_2026_09_18),
    ("events/2026-09-19.json", events_2026_09_19),
]:
    save(fname, evs)

print("events written")
