import json
import time
import urllib.request
import uuid
from pathlib import Path

candidate_paths = [
    Path(__file__).resolve().parents[1] / "sample output" / "05    Body  480+480    Boder    576   100  Reed.jpg",
    Path(r"C:\Users\user\.gemini\antigravity-ide\brain\3c4c7c17-d5d1-4b7c-a726-dfb7dc0eae0f\.tempmediaStorage\media_1789325199189.jpg"),
]
# Also check tmp directory for any saree images
tmp_dir = Path(__file__).resolve().parents[1] / "tmp"
if tmp_dir.exists():
    candidate_paths.extend(list(tmp_dir.glob("*.jpg")) + list(tmp_dir.glob("*.jpeg")) + list(tmp_dir.glob("*.png")))

img_path = next((p for p in candidate_paths if p.exists()), None)
if not img_path:
    raise FileNotFoundError("No suitable test saree image found in candidate paths.")

print(f"Using test saree image: {img_path}", flush=True)
with open(img_path, "rb") as f:
    img_bytes = f.read()

boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
parts = []

def add_field(name, val):
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{val}\r\n'.encode('utf-8'))

def add_file(name, filename, data, content_type):
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode('utf-8') + data + b'\r\n')

add_file('image', img_path.name, img_bytes, 'image/jpeg' if img_path.suffix.lower() in ('.jpg', '.jpeg') else 'image/png')
add_field('coordinates', json.dumps([[0, 0], [800, 0], [800, 1200], [0, 1200]]))
add_field('color_count', '6')
add_field('target_width', '960')
parts.append(f'--{boundary}--\r\n'.encode('utf-8'))

body = b''.join(parts)
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/v1/designs/upload',
    data=body,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
)

resp = urllib.request.urlopen(req)
res_json = json.loads(resp.read().decode('utf-8'))
task_id = res_json['task_id']
print(f"Task uploaded successfully! task_id = {task_id}")

for i in range(60):
    time.sleep(1)
    status_req = urllib.request.Request(f'http://127.0.0.1:8000/api/v1/designs/status/{task_id}')
    st = json.loads(urllib.request.urlopen(status_req).read().decode('utf-8'))
    status = st.get('status')
    stage = st.get('stage')
    progress = st.get('progress')
    print(f"[{i+1}s] status={status} | stage={stage} | progress={progress}%")
    if status == 'SUCCESS':
        print("\n=== PIPELINE SUCCESS ===")
        r = st.get('result', {})
        print("AI Analysis:", json.dumps(r.get('ai_analysis'), indent=2))
        print("Saree Panel Authentic Preview:", r.get('saree_panel_authentic_preview_url'))
        print("Saree Panel Blue Preview:", r.get('saree_panel_blue_preview_url'))
        print("Saree Panel Red Preview:", r.get('saree_panel_redwhite_preview_url'))
        print("Zari Card (Jeri):", r.get('jeri_bmp_url'))
        print("Silk Tabby (Ani):", r.get('ani_bmp_url'))
        print("Body Repeat File:", r.get('body_bmp_url'))
        print("Body Zari Card:", r.get('body_jeri_bmp_url'))
        print("Pallu File:", r.get('pallu_bmp_url'))
        print("Pallu Zari Card:", r.get('pallu_jeri_bmp_url'))
        print("PSP Bundle ZIP:", r.get('psp_bundle_zip_url'))
        print("Infill Metadata:", json.dumps(r.get('infill_metadata'), indent=2))
        print("Production Specs:", json.dumps(r.get('production_specs'), indent=2))
        break
    elif status == 'FAILURE':
        print("\n=== PIPELINE FAILED ===")
        print("Error detail:", st.get('error'))
        break
