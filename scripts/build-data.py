#!/usr/bin/env python3
"""Clean the Dark View catalogue. Run from repo root: python3 scripts/build-data.py
Fixes names, descriptions, colour/photo mapping, removes byte-identical duplicate
image files and rewrites every reference in data.json AND the embedded #dv-data
JSON inside index.html so both stay in sync. Prices are intentionally untouched.
"""
import hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

IMG = "images/"
BLACK_TANK = IMG + "388470b95de467a8847243b316eb29a5.jpg"
BONE_TANK = IMG + "48430a445dc0d86b6ab2f6804a3c6d36.jpg"
BLACK_RACER = IMG + "1084bb5ace88a3f9d06c5a042d7a78c3.jpg"
BONE_RACER = IMG + "0b8f5d275e1335f46669b74f892d9342.jpg"
RED_SET = IMG + "650ed3f71654085b91cfaeb291f11fcb.jpg"
BLUE_SET = IMG + "0b57fa9921352100e897cd3fa3ab0219.jpg"

with open("data.json") as f:
    D = json.load(f)

S = D["settings"]
S.update({
    "tagline": "Gwagwalada, Abuja",
    "bKicker": "New drop",
    "bTitle": "Everyday *uniform*.",
    "bBadge": "Pay on delivery",
    "bSub": "Track sets, tees, vests and shorts in heavy cotton. Delivered across Abuja, with pay on delivery available.",
    "bCta": "Shop all pieces",
    "bCta2": "View tracksuits",
    "bCta2Q": "velocity",
    "bPerks": "7-day exchange · Sizes S to XXL · Delivered in Abuja",
    "storyH": "A small studio in Gwagwalada.",
    "story1": "Dark View is a streetwear label based in Gwagwalada, Abuja. We make tracksuits, tees, vests and shorts in small batches and sell them directly from our studio.",
    "story2": "Because runs are short, sizes sell out and don't always come back. To see what's next, follow us on Instagram or send us a message on WhatsApp.",
    "heroEyebrow": "Streetwear from Gwagwalada, Abuja.",
    "heroTitle": "Tracksuits, tees, vests and shorts.",
    "heroLead": "Made in small batches in Abuja. Delivered across the city, paid by transfer or on delivery.",
    "heroImg": RED_SET,
    "heroImgAlt": "Velocity tracksuit set in black and red",
    "announce": "Delivery across Abuja. Pay by bank transfer or on delivery.",
})

# Colour names: consistent capitalisation, hex values kept.
ren = {"red": "Red", "blue": "Blue", "brown": "Brown", "ash": "Ash"}
D["colors"] = {ren.get(k, k): v for k, v in D["colors"].items()}

P = {p["id"]: p for p in D["products"]}

def setp(i, **kw):
    P[i].update(kw)

setp(1, n="Courtside Jersey Tank", d="Basketball-cut tank in breathable mesh with contrast trim and the vertical Dark View print. Comes in black or bone.",
     img=BLACK_TANK, imgs=[BLACK_TANK, BONE_TANK], ci={"Black": BLACK_TANK, "Bone": BONE_TANK})
setp(2, n="Racerback Rib Tank", d="Fitted ribbed racerback with the gothic chest print. Stretch cotton that holds its shape.",
     img=BLACK_RACER, imgs=[BLACK_RACER, BONE_RACER], ci={"Black": BLACK_RACER, "Bone": BONE_RACER})
setp(3, n="Velocity Tracksuit Set", d="Two-piece set: zip track jacket and drawcord pants with curved side panels. Sold as a set; the jacket and pants are also sold separately.",
     img=RED_SET, imgs=[RED_SET, BLUE_SET], ci={"Red": RED_SET, "Blue": BLUE_SET}, featured=True)
setp(4, n="Angelic Chaos Muscle Tee", d="Sleeveless muscle tee with the cracked-statue and butterfly print across the chest. Heavy cotton, boxy cut.",
     imgs=[IMG + "f9acf5d4bbdd10d25cc124bc10140301.jpg"])
# Only the ash colourway has a photo; black/brown stay listed without photos.
setp(5, n="Oversized Sweat Shorts", d="Heavyweight fleece shorts with a raw hem, deep pockets and the wordmark across the front. Pictured in ash.",
     b="", cl=["Ash", "Black", "Brown"],
     img=IMG + "a3ad6c387f5de39051e9f93cd5ba65fb.jpg",
     imgs=[IMG + "a3ad6c387f5de39051e9f93cd5ba65fb.jpg"],
     ci={"Ash": IMG + "a3ad6c387f5de39051e9f93cd5ba65fb.jpg"})
setp(6, n="Aura Flame Tee", d="Oversized black tee with the flame graphic: Wear Mind Set. Drop shoulders, heavy cotton.",
     imgs=[IMG + "1d88fb3e4ed5bb5b499a721fbd9abc3b.jpg"])
setp(7, n="Stone Wings Tee", d="Oversized tee with the mirrored chrome wings print and star mark. Heavy cotton, relaxed fit.",
     imgs=[IMG + "f2ca120e031aff3039d1bf2c71c5fb9e.jpg"])
setp(8, n="Essential Sweat Shorts", d="Clean fleece shorts with the embroidered DV mark. Elastic waist, sits above the knee.",
     imgs=[IMG + "1c8036e2e37185766288a92bb8b87da1.jpg"])
# Jackets/pants: only the blue colourway is photographed so far.
JACKET_BLUE = IMG + "8e60b6c4f85181e87f2609d081297f7d.jpg"
PANTS_BLUE = IMG + "b9ee441e635d29665f3be10c5f8d4f7c.jpg"
setp(9, n="Velocity Track Jacket", d="Zip-front track jacket with curved contrast panels, stand collar and zip pockets. Pairs with the Velocity track pants. Pictured in blue.",
     img=JACKET_BLUE, imgs=[JACKET_BLUE], ci={"Blue": JACKET_BLUE}, featured=False)
setp(10, n="Velocity Track Pants", d="Drawcord track pants with zip pockets and cuffed ankles. Pairs with the Velocity track jacket or buy the full set. Pictured in blue.",
     img=PANTS_BLUE, imgs=[PANTS_BLUE], ci={"Blue": PANTS_BLUE})

for p in D["products"]:
    p["cl"] = [ren.get(c, c) for c in p.get("cl", [])]
    if "ci" in p:
        p["ci"] = {ren.get(k, k): v for k, v in p["ci"].items()}

# ---- dedupe image files: keep one canonical file per identical content ----
hashes = {}
canon = {}
for f in sorted(os.listdir(IMG)):
    path = IMG + f
    h = hashlib.md5(open(path, "rb").read()).hexdigest()
    if h in hashes:
        canon[path] = hashes[h]
    else:
        hashes[h] = path

def fix_refs(obj):
    if isinstance(obj, dict):
        return {k: fix_refs(v) for k, v in obj.items()}
    if isinstance(obj, list):
        out = []
        for v in obj:
            v = fix_refs(v)
            if isinstance(v, str) and v.startswith(IMG) and v in canon:
                if v not in out:
                    out.append(v)
            else:
                out.append(v)
        return out
    if isinstance(obj, str) and obj in canon:
        return canon[obj]
    return obj

D = fix_refs(D)

with open("data.json", "w") as f:
    json.dump(D, f, indent=1, ensure_ascii=False)
    f.write("\n")

# keep the embedded copy in index.html identical to data.json
html = open("index.html").read()
embedded = json.dumps(D, ensure_ascii=False).replace("<", "\\u003c")
html2, n = re.subn(
    r'(<script id="dv-data" type="application/json">).*?(</script>)',
    lambda m: m.group(1) + embedded + m.group(2),
    html, count=1, flags=re.S)
if n != 1:
    sys.exit("dv-data block not found in index.html")
open("index.html", "w").write(html2)

# remove the now-unreferenced duplicate files
blob = open("data.json").read() + open("index.html").read()
removed = []
for dup, keep in canon.items():
    if dup not in blob:
        os.remove(dup)
        removed.append(dup)

print("Canonical map:", json.dumps(canon, indent=1))
print("Removed:", removed)
print("Products:", [(p["id"], p["n"]) for p in D["products"]])
