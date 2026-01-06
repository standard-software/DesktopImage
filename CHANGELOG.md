# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-10-06

### Added
- New `--display` / `-d` option to capture specific displays only
- Ability to selectively capture individual displays without capturing all displays

### Changed
- Improved command-line interface consistency - all options now use the same named option style

## [1.0.0] - 2025-10-06

### Added
- Initial release
- Cross-platform desktop screenshot capture (Windows, macOS, Linux, WSL)
- Multi-monitor support with automatic detection
- Automatic timestamp-based file naming
- Support for multiple image formats (PNG, JPG, JPEG, BMP)
- Customizable output directory (`--output` / `-o`)
- Adjustable image quality for JPEG formats (`--quality` / `-q`)
- Individual display capture alongside full desktop capture
