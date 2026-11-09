import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from optimize_images import encode, optimise


class OptimiseImagesTest(unittest.TestCase):
    def test_webp_keeps_exact_alpha_and_dimensions(self):
        image = Image.new("RGBA", (256, 256))
        image.putdata([(x, y, (x + y) // 2, (x * y) % 256)
                       for y in range(256) for x in range(256)])
        stream = io.BytesIO()
        image.save(stream, "WEBP", lossless=True)
        source = stream.getvalue()
        output, size, _ = encode(source)
        with Image.open(io.BytesIO(output)) as decoded:
            self.assertEqual(size, image.size)
            self.assertEqual(decoded.size, image.size)
            self.assertEqual(decoded.convert("RGBA").getchannel("A").tobytes(),
                             image.getchannel("A").tobytes())
        self.assertLessEqual(len(output), len(source))

    def test_png_is_pixel_exact_and_smaller(self):
        image = Image.new("RGBA", (128, 128), (26, 64, 192, 128))
        stream = io.BytesIO()
        image.save(stream, "PNG", compress_level=0)
        output, _, _ = encode(stream.getvalue())
        self.assertLess(len(output), len(stream.getvalue()))
        with Image.open(io.BytesIO(output)) as decoded:
            self.assertEqual(decoded.convert("RGBA").tobytes(), image.tobytes())

    def test_animated_art_is_not_flattened(self):
        stream = io.BytesIO()
        Image.new("RGB", (32, 32), "red").save(
            stream, "WEBP", save_all=True,
            append_images=[Image.new("RGB", (32, 32), "blue")], duration=100, loop=0)
        source = stream.getvalue()
        self.assertEqual(encode(source)[0], source)

    def test_report_accounts_for_duplicates_and_untouched_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ["first.png", "second.png"]:
                Image.new("RGBA", (32, 32), (1, 2, 3, 100)).save(
                    root / name, compress_level=0)
            (root / "untouched.txt").write_text("Keep me")
            report = optimise([root], root / "report.json")
            self.assertEqual(report["images"], 2)
            self.assertLess(report["after"], report["before"])
            self.assertEqual((root / "first.png").read_bytes(), (root / "second.png").read_bytes())
            self.assertEqual((root / "untouched.txt").read_text(), "Keep me")


if __name__ == "__main__":
    unittest.main()
