import urllib.request
import json
import time
import uuid

boundary = '----WebKitFormBoundary' + uuid.uuid4().hex
with open('d:/coding/screenshot_to_design/loom-backend/temp/demo_image.png', 'rb') as f:
    img_bytes = f.read()

parts = []
def add_field(name, val):
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{val}\r\n'.encode('utf-8'))

def add_file(name, filename, data, content_type):
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode('utf-8') + data + b'\r\n')

add_file('image', 'demo.png', img_bytes, 'image/png')
add_field('coordinates', json.dumps([[0, 0], [400, 0], [400, 400], [0, 400]]))
add_field('color_count', '4')
add_field('target_width', '600')
parts.append(f'--{boundary}--\r\n'.encode('utf-8'))

body = b''.join(parts)
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/v1/designs/upload',
    data=body,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
)

resp = urllib.request.urlopen(req)
res_json = json.loads(resp.read().decode('utf-8'))
print('Upload response status:', resp.status, res_json)
task_id = res_json['task_id']

for i in range(30):
    time.sleep(1)
    status_req = urllib.request.Request(f'http://127.0.0.1:8000/api/v1/designs/status/{task_id}')
    st = json.loads(urllib.request.urlopen(status_req).read().decode('utf-8'))
    status = st.get('status')
    stage = st.get('stage')
    progress = st.get('progress')
    print(f'Poll {i+1}s: status={status} | stage={stage} | progress={progress}%')
    if status == 'SUCCESS':
        print('\n=== PIPELINE SUCCESS ===')
        r = st.get('result', {})
        print('BMP URL:', r.get('file_url'))
        print('TIFF URL:', r.get('tiff_url'))
        print('Manifest URL:', r.get('manifest_url'))
        print('Regions detected:', len(r.get('regions', [])))
        print('Repeat vector:', r.get('repeat'))
        print('Sharpness:', r.get('sharpness'))
        break
    elif status == 'FAILURE':
        print('\n=== PIPELINE FAILED ===')
        print('Error detail:', st.get('error'))
        break
