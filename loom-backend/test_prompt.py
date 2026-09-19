import os, base64, json, urllib.request

api_key = os.environ.get("GEMINI_API_KEY", "")

prompt = """You are an expert Jacquard Master Weaver and Textile CAD Engineer.
Analyze this saree image to reconstruct the complete Jacquard weaving draft.
Detect the layout, the motif, and pattern repetition.
Return strictly a JSON object with:
{
  "heritage_style": "e.g. Kanchipuram Silk, Banarasi Brocade, Paithani",
  "layout_type": "all_over_brocade" | "single_border_and_body" | "double_border" | "border_only" | "pallu_panel",
  "motif_family": "elephant" | "peacock" | "paisley_mango" | "floral_booti" | "chakra_coin" | "geometric" | "creeper",
  "motif_description": "Detailed description of the motif shape and inner anatomy",
  "motif_symmetry": "bilateral_vertical" | "bilateral_horizontal" | "radial" | "asymmetric",
  "cleanest_motif_bbox": [0, 0, 1000, 1000],
  "border_present": true,
  "border_position": "bottom",
  "border_bbox": [0, 0, 1000, 1000],
  "border_description": "Description of border bands, arches, or vines",
  "repeat_arrangement": "half_drop",
  "ground_color_hex": "#RRGGBB",
  "zari_color_hex": "#RRGGBB",
  "suggested_hooks": 240,
  "suggested_picks": 1024
}
Return ONLY valid JSON.
"""

with open("../sample output/05    Body  480+480    Boder    576   100  Reed.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

payload = {
    "contents": [{"parts": [{"inline_data": {"mime_type": "image/jpeg", "data": b64}}, {"text": prompt}]}],
    "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"}
}

req = urllib.request.Request(
    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"}
)
res = urllib.request.urlopen(req)
parsed = json.loads(json.loads(res.read().decode())["candidates"][0]["content"]["parts"][0]["text"])
print(json.dumps(parsed, indent=2))
