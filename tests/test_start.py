import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('softwall_start', Path(__file__).resolve().parents[1] / 'start.py')
starter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(starter)


class StartupTests(unittest.TestCase):
    def test_platform_support(self):
        self.assertEqual(starter.platform_info('Darwin', 'arm64'), ('macos', 'realesrgan-ncnn-vulkan'))
        self.assertEqual(starter.platform_info('Darwin', 'x86_64')[0], 'macos')
        self.assertEqual(starter.platform_info('Windows', 'AMD64'), ('windows', 'realesrgan-ncnn-vulkan.exe'))
        self.assertEqual(starter.platform_info('Linux', 'x86_64')[0], 'ubuntu')
        with self.assertRaises(RuntimeError):
            starter.platform_info('Linux', 'aarch64')

    def test_only_selected_native_files_are_installed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / 'engine.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('release/realesrgan-ncnn-vulkan', b'test engine')
                for name in starter.MODEL_FILES:
                    z.writestr('release/models/' + name, b'test model')
                z.writestr('../../outside.txt', b'not extracted')
                z.writestr('models/unselected.bin', b'not installed')
            with patch.object(starter, 'ROOT', root), patch.object(starter, 'platform_info', return_value=('macos', 'realesrgan-ncnn-vulkan')):
                starter.install_engine(archive)
                self.assertTrue((root / 'local/engine/installation.json').exists())
                self.assertFalse((root / 'outside.txt').exists())
                self.assertFalse((root / 'local/engine/models/unselected.bin').exists())
                # Re-running uses the completed installation, even if the original ZIP is gone.
                archive.unlink()
                starter.install_engine(archive)

    def test_incomplete_archive_is_not_installed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / 'incomplete.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('realesrgan-ncnn-vulkan', b'incomplete')
            with patch.object(starter, 'ROOT', root), patch.object(starter, 'platform_info', return_value=('macos', 'realesrgan-ncnn-vulkan')):
                with self.assertRaises(RuntimeError):
                    starter.install_engine(archive)
                self.assertFalse((root / 'local/engine/installation.json').exists())


if __name__ == '__main__':
    unittest.main()
