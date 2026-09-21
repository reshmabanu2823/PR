import base64
import logging
import random
import urllib.parse
from typing import Any
import httpx

logger = logging.getLogger("pragna.image")

STABILITY_API_BASE = "https://api.stability.ai/v2beta/stable-image"
MODEL = "sd3.5-large-turbo"


def _error_from_response(resp: httpx.Response) -> str:
    try:
        detail = resp.json().get("errors", [resp.text])
        message = "; ".join(detail) if isinstance(detail, list) else str(detail)
    except Exception:
        message = resp.text
    return f"Stability AI request failed ({resp.status_code}): {message[:300]}"


async def generate_image(prompt: str, api_key: str, aspect_ratio: str = "1:1") -> dict[str, Any]:
    width, height = 1024, 1024
    if aspect_ratio == "16:9":
        width, height = 1280, 720
    elif aspect_ratio == "9:16":
        width, height = 720, 1280
    elif aspect_ratio == "4:3":
        width, height = 1024, 768
    elif aspect_ratio == "3:4":
        width, height = 768, 1024

    seed = random.randint(1, 999999)
    encoded_prompt = urllib.parse.quote(prompt)
    pollinations_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&seed={seed}&nologo=true&enhance=true"

    if api_key:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{STABILITY_API_BASE}/generate/sd3",
                    headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
                    files={"none": (None, "")},
                    data={
                        "prompt": prompt,
                        "mode": "text-to-image",
                        "model": MODEL,
                        "aspect_ratio": aspect_ratio,
                        "output_format": "png",
                    },
                )
            if resp.status_code == 200:
                data = resp.json()
                img_b64 = data.get("image", "")
                data_url = f"data:image/png;base64,{img_b64}"
                return {
                    "success": True,
                    "prompt": prompt,
                    "summary": f"Generated an image of: {prompt}\n\n![{prompt}]({data_url})",
                    "image_base64": img_b64,
                    "image_url": data_url,
                }
            else:
                logger.warning(f"Stability error ({resp.status_code}), falling back to FLUX/Pollinations")
        except Exception as e:
            logger.warning(f"Stability generate exception ({e}), falling back to FLUX/Pollinations")

    return {
        "success": True,
        "prompt": prompt,
        "summary": f"Generated an image of: {prompt}\n\n![{prompt}]({pollinations_url})",
        "image_url": pollinations_url,
    }


async def edit_image(image_base64: str, prompt: str, api_key: str, strength: float = 0.35) -> dict[str, Any]:
    if not api_key:
        return {"success": False, "error": "No Stability AI API key configured (STABILITY_API_KEY)."}
    try:
        image_bytes = base64.b64decode(image_base64)
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{STABILITY_API_BASE}/generate/sd3",
                headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
                files={"image": ("image.png", image_bytes, "image/png")},
                data={
                    "prompt": prompt,
                    "mode": "image-to-image",
                    "model": MODEL,
                    "strength": str(strength),
                    "output_format": "png",
                },
            )
        if resp.status_code != 200:
            logger.error(f"Stability edit error {resp.status_code}: {resp.text[:500]}")
            return {"success": False, "error": _error_from_response(resp)}
        data = resp.json()
        img_b64 = data.get("image", "")
        data_url = f"data:image/png;base64,{img_b64}"
        return {
            "success": True,
            "prompt": prompt,
            "summary": f"Edited the image: {prompt}\n\n![{prompt}]({data_url})",
            "image_base64": img_b64,
            "image_url": data_url,
        }
    except Exception as e:
        logger.error(f"Stability edit exception: {e}")
        return {"success": False, "error": str(e)}
