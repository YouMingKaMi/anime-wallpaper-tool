"""Final 4K resizing for Windows and Linux. Native inference stays in a separate process."""
import sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = 130_000_000  # Native 4x output of the enforced 8 MP input limit.
with Image.open(sys.argv[1]) as image:
    scale = 3840 / max(image.size)
    size = tuple(max(1, round(n * scale)) for n in image.size)
    image.resize(size, Image.Resampling.LANCZOS).save(sys.argv[2], format='PNG')
