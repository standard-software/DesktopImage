# DesktopImage

A cross-platform CLI tool to capture desktop screenshots with automatic timestamp naming and multi-monitor support.

## Features

- Captures full desktop screenshot
- Captures individual screenshots for each display/monitor
- **Selective display capture**: Capture specific displays only
- Automatic timestamp-based file naming
- Support for multiple image formats (PNG, JPG, JPEG, BMP)
- Cross-platform support (Windows, macOS, Linux, WSL)
- Customizable output directory
- Adjustable image quality for JPEG formats

## Installation

### Prerequisites

- Node.js >= 14.0.0
- Platform-specific requirements:
  - **Linux**: `imagemagick` package (for `import` command)
  - **macOS**: Built-in support (uses `screencapture`)
  - **Windows/WSL**: Built-in support (uses PowerShell)

### Install from source

```bash
# Clone or download this repository
cd DesktopImage

# Install dependencies
npm install

# Install globally
npm install -g .
```

## Usage

### Basic Usage

Capture desktop and all display screenshots with default settings:

```bash
desktopimage
```

This will create:
- `DesktopImage_2024-01-20_14-30-45.png` - Full desktop screenshot
- `DisplayImage1_2024-01-20_14-30-45.png` - First display
- `DisplayImage2_2024-01-20_14-30-45.png` - Second display (if available)
- etc.

### Options

```bash
desktopimage [options]
```

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--display` | `-d` | Display number to capture (e.g., 1 for DisplayImage1 only) | All displays |
| `--output` | `-o` | Output directory for screenshots | Current directory |
| `--format` | `-f` | Image format (png, jpg, jpeg, bmp) | `png` |
| `--quality` | `-q` | JPEG quality (1-100) | `100` |
| `--help` | `-h` | Show help message | - |

### Examples

Capture only Display 1:
```bash
desktopimage -d 1
```

Capture only Display 2 as JPEG:
```bash
desktopimage -d 2 -f jpg
```

Save screenshots to a specific directory:
```bash
desktopimage -o ~/Screenshots
```

Save as JPEG with 85% quality:
```bash
desktopimage -f jpg -q 85
```

Save to custom directory with BMP format:
```bash
desktopimage -o /path/to/screenshots -f bmp
```

Capture Display 1 only and save as JPEG to specific directory:
```bash
desktopimage -d 1 -f jpg -q 90 -o ~/Screenshots
```

## File Naming

Screenshots are automatically named with timestamps in the following format:

- Main desktop: `DesktopImage_YYYY-MM-DD_HH-MM-SS.{format}`
- Individual displays: `DisplayImage{N}_YYYY-MM-DD_HH-MM-SS.{format}`

Where:
- `YYYY` - Year (4 digits)
- `MM` - Month (2 digits, zero-padded)
- `DD` - Day (2 digits, zero-padded)
- `HH` - Hours (2 digits, 24-hour format, zero-padded)
- `MM` - Minutes (2 digits, zero-padded)
- `SS` - Seconds (2 digits, zero-padded)
- `{N}` - Display number (1, 2, 3, etc.)
- `{format}` - File extension (png, jpg, jpeg, bmp)

## Platform Notes

### Windows / WSL
- Uses PowerShell and .NET Framework for screenshot capture
- Automatically detects all connected monitors
- WSL users can capture Windows desktop screenshots

### macOS
- Uses built-in `screencapture` command
- Supports multiple displays
- No additional dependencies required

### Linux
- Requires `imagemagick` package for the `import` command
- Uses X11 for screenshot capture
- Install with: `sudo apt-get install imagemagick` (Debian/Ubuntu) or equivalent

## Troubleshooting

### Linux: "import: command not found"
Install ImageMagick:
```bash
# Debian/Ubuntu
sudo apt-get install imagemagick

# Fedora
sudo dnf install ImageMagick

# Arch
sudo pacman -S imagemagick
```

### No screenshots for individual displays
- Ensure your system properly detects multiple monitors
- On Linux, check `xrandr --query` output
- On Windows, check display settings

## License

MIT

## Similar Projects

This project is inspired by [ClipImageToFile](https://github.com/standard-software/ClipImageToFile), which saves clipboard images to files.