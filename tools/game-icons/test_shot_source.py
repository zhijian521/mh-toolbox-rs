"""截图来源契约；只使用临时目录，不读取或生成游戏资源。"""
import os
import tempfile
import unittest
from contextlib import redirect_stderr
from io import StringIO
from unittest.mock import patch

from shot_source import shot_directory, shot_parser


class ShotSourceTests(unittest.TestCase):
    def test_explicit_source_overrides_environment(self):
        with tempfile.TemporaryDirectory() as path:
            parser = shot_parser('test')
            args = parser.parse_args(['--src', path])
            with patch.dict(os.environ, {'GAME_SHOT_DIR': 'missing'}):
                self.assertEqual(str(shot_directory(parser, args)), os.path.realpath(path))

    def test_environment_source(self):
        with tempfile.TemporaryDirectory() as path:
            parser = shot_parser('test')
            with patch.dict(os.environ, {'GAME_SHOT_DIR': path}):
                self.assertEqual(str(shot_directory(parser, parser.parse_args([]))),
                                 os.path.realpath(path))

    def test_missing_or_invalid_directory_reports_argument_error(self):
        parser = shot_parser('test')
        with patch.dict(os.environ, {}, clear=True):
            for argv in ([], ['--src', __file__]):
                with self.subTest(argv=argv), redirect_stderr(StringIO()) as error:
                    with self.assertRaises(SystemExit) as exit:
                        shot_directory(parser, parser.parse_args(argv))
                    self.assertEqual(exit.exception.code, 2)
                    self.assertIn('截图目录', error.getvalue())


if __name__ == '__main__':
    unittest.main()
