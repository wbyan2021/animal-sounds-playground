#!/usr/bin/env python3
"""
Sound Encyclopedia - Batch Sound Downloader
Searches Freesound for CC0 sounds, downloads LQ previews,
trims and normalizes them with ffmpeg to <300KB.
"""

import urllib.request, urllib.parse, re, os, sys, time, json, subprocess, tempfile

PROJECT_DATA = "/Users/bz01/Desktop/文博知识库/10_vibcoding/声音世界/voices/sound-encyclopedia/data"
CONTRIBUTOR = "wbyan2021"
FFMPEG = "/opt/homebrew/bin/ffmpeg"

SOUNDS = {
    "nature": {
        "weather": [
            ("rain", "雨", "Rain", "🌧️", "雨水落下的声音，滴滴答答",
             "雨水是云朵里的小水滴抱在一起太重了，掉下来就变成了雨", ["雨水", "下雨", "天气"]),
            ("thunder", "雷", "Thunder", "🌩️", "打雷轰隆隆，闪电亮晶晶",
             "雷声是闪电把空气加热膨胀发出的巨响，就像气球爆掉一样", ["雷声", "打雷", "天气"]),
            ("wind", "风", "Wind", "💨", "风吹过树叶沙沙响",
             "风是空气在跑步，跑得快的时候就会发出呼呼的声音", ["风声", "刮风", "天气"]),
        ],
        "water": [
            ("ocean_waves", "海浪", "Ocean Waves", "🌊", "海浪拍打沙滩，哗啦哗啦",
             "海浪是海水被风吹得摇来摇去，永远停不下来", ["海浪", "大海", "水"]),
            ("stream", "溪流", "Stream", "🏞️", "山间小溪哗啦啦地流",
             "溪水从山上往低处跑，流过石头就会发出哗哗的声音", ["溪流", "流水", "水"]),
        ],
        "forest": [
            ("campfire", "篝火", "Campfire", "🔥", "篝火噼里啪啦地烧",
             "火烧木头时木头里的水分受热膨胀把木头撑破，就发出噼啪声", ["篝火", "火", "木头"]),
            ("forest", "森林", "Forest", "🌲", "森林里树木沙沙，小鸟叽喳",
             "森林里有好多树和动物，是大自然最热闹的家", ["森林", "树林", "大自然"]),
        ],
    },
    "transport": {
        "road": [
            ("car", "汽车", "Car", "🚗", "汽车滴滴的声音",
             "汽车靠发动机工作才能跑起来，不同速度声音也不一样哦", ["汽车", "滴滴", "交通"]),
            ("motorcycle", "摩托车", "Motorcycle", "🏍️", "摩托车突突突的声音",
             "摩托车的发动机比汽车的跑得快，所以声音更响更高", ["摩托车", "突突", "交通"]),
        ],
        "rail": [
            ("train", "火车", "Train", "🚂", "火车轰隆隆开过来了",
             "火车在铁轨上跑，车轮和铁轨碰撞就发出轰隆隆的声音", ["火车", "轰隆隆", "交通"]),
        ],
        "sky": [
            ("airplane", "飞机", "Airplane", "✈️", "飞机飞过头顶的轰鸣声",
             "飞机引擎力气特别大才能让那么重的飞机飞上天", ["飞机", "轰鸣", "交通"]),
        ],
        "water": [
            ("boat", "轮船", "Boat", "🚢", "轮船的汽笛声呜呜响",
             "轮船在海上呜呜叫是在告诉别的船：我在这里，别撞到我", ["轮船", "汽笛", "交通"]),
        ],
    },
    "life": {
        "home": [
            ("doorbell", "门铃", "Doorbell", "🔔", "门铃叮咚响，有客人来了",
             "门铃一响就知道有人来找我们玩了，是家里的礼貌小卫士", ["门铃", "叮咚", "家"]),
            ("alarm_clock", "闹钟", "Alarm Clock", "⏰", "闹钟叮铃铃叫你起床",
             "闹钟是你起床的好帮手，每天早上准时叫你起来", ["闹钟", "起床", "家"]),
            ("telephone", "电话铃声", "Telephone", "📞", "电话铃声响，快接电话",
             "电话铃声是在告诉你有朋友找你聊天了", ["电话", "铃声", "家"]),
        ],
        "music": [
            ("piano", "钢琴", "Piano", "🎹", "钢琴叮叮咚咚的声音",
             "钢琴有黑白两种键，按下去小锤子敲打琴弦就发出美妙的声音", ["钢琴", "音乐", "乐器"]),
            ("guitar", "吉他", "Guitar", "🎸", "吉他弹奏的声音",
             "吉他拨动琴弦就能发出声音，六根弦从粗到细声音从低到高", ["吉他", "音乐", "乐器"]),
            ("drum", "鼓", "Drum", "🥁", "咚咚咚的鼓声",
             "鼓皮被敲打时振动就发出咚咚声，是最古老的乐器之一", ["鼓", "音乐", "乐器"]),
        ],
        "kitchen": [
            ("frying", "炒菜", "Frying", "🍳", "炒菜滋滋啦啦的声音",
             "油在热锅里会跳舞，菜放进去就发出滋滋声，好香呀", ["炒菜", "厨房", "滋滋"]),
            ("microwave", "微波炉", "Microwave", "📟", "微波炉嗡嗡工作的声音",
             "微波炉用看不见的微波让食物里的水分子运动，食物就热了", ["微波炉", "厨房", "嗡嗡"]),
        ],
    },
}

def search_freesound(query):
    encoded = urllib.parse.quote(query)
    url = f"https://freesound.org/search/?q={encoded}&f=license:%22Creative+Commons+0%22&s=download+desc"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    r = urllib.request.urlopen(req, timeout=15)
    html = r.read().decode('utf-8')
    paths = re.findall(r'href=\"(/people/[^/]+/sounds/\d+/)\"', html)
    seen = set()
    return [p for p in paths if not (p in seen or seen.add(p))]

def get_sound_info(sound_path):
    url = f"https://freesound.org{sound_path}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    r = urllib.request.urlopen(req, timeout=15)
    html = r.read().decode('utf-8')
    
    preview = re.findall(r'data-mp3=\"([^\"]+\.mp3)\"', html)
    title = re.search(r'<title>(.*?) by', html)
    author = re.search(r'by (.*?) \|', html)
    
    return {
        'url': preview[0] if preview else None,
        'title': title.group(1).strip() if title else '',
        'author': author.group(1).strip() if author else 'unknown',
        'page': f"https://freesound.org{sound_path}",
    }

def download_audio(url, output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cmd = ["curl", "-L", "--connect-timeout", "10", "--max-time", "180",
           "-o", output_path, url]
    subprocess.run(cmd, capture_output=True, timeout=190)
    return os.path.getsize(output_path) if os.path.exists(output_path) else 0

def trim_normalize(input_path, output_path, duration=6):
    """Trim to first N seconds, normalize to -16 LUFS, output MP3 128kbps."""
    cmd = [
        FFMPEG, "-y", "-i", input_path,
        "-t", str(duration),
        "-af", "loudnorm=I=-16:LRA=11:TP=-1.5",
        "-ac", "1",
        "-ar", "44100",
        "-b:a", "128k",
        "-f", "mp3",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, timeout=60)
    return os.path.getsize(output_path) if os.path.exists(output_path) else 0

def process_sound(cat_id, subcat_id, name_id, name_zh, name_en, emoji,
                   desc, fun_fact, tags):
    meta_dir = os.path.join(PROJECT_DATA, "sounds", cat_id, name_id)
    audio_dir = os.path.join(meta_dir, "audio")
    meta_path = os.path.join(meta_dir, "meta.json")
    os.makedirs(audio_dir, exist_ok=True)
    
    # Don't re-process if already done
    if os.path.exists(meta_path):
        print(f"  ⏭️  Already exists: {name_zh}")
        return True
    
    print(f"\n{'='*55}")
    print(f"  [{name_zh} / {name_en}]")
    print(f"{'='*55}")
    
    queries = [f"{name_en} sound effect", name_en, f"{name_zh} 声音"]
    
    for q in queries:
        print(f"  Searching: {q}")
        try:
            paths = search_freesound(q)
            print(f"  Found {len(paths)} results" if paths else "  No results")
        except Exception as e:
            print(f"  Search failed: {e}")
            continue
        
        for sp in paths[:3]:
            try:
                info = get_sound_info(sp)
                if not info['url']:
                    continue
                
                print(f"  Downloading: {info['title'][:50]}...")
                sys.stdout.flush()
                
                # Download to temp
                tmp_raw = os.path.join(audio_dir, f"{name_id}_raw.mp3")
                size = download_audio(info['url'], tmp_raw)
                if size < 2000:
                    print(f"  ✗ Too small: {size/1024:.0f}KB")
                    continue
                
                print(f"  Raw: {size/1024:.0f}KB → Processing...")
                
                # Trim + normalize
                final_path = os.path.join(audio_dir, f"{name_id}_1.mp3")
                final_size = trim_normalize(tmp_raw, final_path, duration=7)
                
                # Clean up raw
                if os.path.exists(tmp_raw):
                    os.remove(tmp_raw)
                
                if final_size > 5000 and final_size < 350000:
                    meta = {
                        "id": f"{cat_id}.{name_id}",
                        "category": cat_id,
                        "subcategory": subcat_id,
                        "name_zh": name_zh,
                        "name_en": name_en,
                        "emoji": emoji,
                        "description": desc,
                        "fun_fact": fun_fact,
                        "sounds": [{"file": f"audio/{name_id}_1.mp3"}],
                        "tags": tags,
                        "license": "CC0-1.0",
                        "source": info['page'],
                        "contributor": CONTRIBUTOR,
                        "added_at": time.strftime("%Y-%m-%d"),
                    }
                    with open(meta_path, 'w', encoding='utf-8') as f:
                        json.dump(meta, f, ensure_ascii=False, indent=2)
                    print(f"  ✓ {name_zh}: {final_size/1024:.0f}KB → meta.json ✓")
                    return True
                else:
                    print(f"  ✗ Final size {final_size/1024:.0f}KB out of range")
                    if os.path.exists(final_path):
                        os.remove(final_path)
            except Exception as e:
                print(f"  ✗ {e}")
            
            time.sleep(0.5)
    
    return False

if __name__ == '__main__':
    total = sum(len(sounds) for cat in SOUNDS.values() for sounds in cat.values())
    done = 0
    failed = []
    
    print(f"Sound Encyclopedia - Batch Downloader")
    print(f"Total to process: {total} sounds\n")
    
    for cat_id, subcats in SOUNDS.items():
        for subcat_id, sounds in subcats.items():
            for s in sounds:
                ok = process_sound(cat_id, subcat_id, *s)
                if ok:
                    done += 1
                else:
                    failed.append(s[0])
                time.sleep(0.3)
    
    print(f"\n{'='*55}")
    print(f"Done: {done}/{total} sounds added")
    if failed:
        print(f"Failed: {', '.join(failed)}")
