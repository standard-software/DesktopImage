#!/usr/bin/env node

// Suppress punycode deprecation warning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && 
      warning.message.includes('punycode')) {
    return;
  }
  console.warn(warning.message);
});

const yargs = require('yargs');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const Jimp = require('jimp');
const { promisify } = require('util');
const execAsync = promisify(exec);

const argv = yargs
  .option('display', {
    alias: 'd',
    type: 'number',
    description: 'Display number to capture (e.g., 1 for DisplayImage1 only)'
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Output directory for screenshots'
  })
  .option('format', {
    alias: 'f',
    type: 'string',
    default: 'png',
    description: 'Image format (png, jpg, jpeg, bmp)',
    choices: ['png', 'jpg', 'jpeg', 'bmp']
  })
  .option('quality', {
    alias: 'q',
    type: 'number',
    default: 100,
    description: 'Image quality for JPEG (1-100)'
  })
  .version('1.1.0')
  .alias('version', 'v')
  .help()
  .alias('help', 'h')
  .argv;

function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return { year, month, day, hours, minutes, seconds };
}

function generateFilename(prefix, format, timestamp) {
  const { year, month, day, hours, minutes, seconds } = timestamp;
  return `${prefix}_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.${format}`;
}

async function detectPlatform() {
  const platform = os.platform();
  
  if (platform === 'linux') {
    try {
      await fs.access('/mnt/c');
      return 'wsl';
    } catch {
      return 'linux';
    }
  }
  
  return platform;
}

async function getScreenInfo() {
  const platform = await detectPlatform();
  
  switch (platform) {
    case 'win32':
    case 'wsl':
      let psScript;
      let psScriptWin;
      if (platform === 'wsl') {
        // Use direct path for WSL - cmd.exe can hang
        const userHome = os.homedir();
        const userName = path.basename(userHome);
        const fallbackTemp = `/mnt/c/Users/${userName}/AppData/Local/Temp`;
        
        // Check if the temp directory exists, otherwise use /tmp
        try {
          await fs.access(fallbackTemp);
          psScript = `${fallbackTemp}/getmonitors_${Date.now()}.ps1`;
          psScriptWin = psScript.replace('/mnt/c', 'C:').replace(/\//g, '\\');
        } catch {
          // Use Linux temp if Windows temp is not accessible
          psScript = `/tmp/getmonitors_${Date.now()}.ps1`;
          psScriptWin = psScript;
        }
      } else {
        // Windows native
        psScript = path.join(os.tmpdir(), `getmonitors_${Date.now()}.ps1`);
        psScriptWin = psScript;
      }
      const psContent = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class DPIAware {
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();
    
    [DllImport("shcore.dll")]
    public static extern int SetProcessDpiAwareness(int value);
}
"@

# Set DPI awareness
try {
    [DPIAware]::SetProcessDpiAwareness(2) # Per-monitor DPI aware
} catch {
    [DPIAware]::SetProcessDPIAware()
}

# Get all screens with actual pixel dimensions
$screens = [System.Windows.Forms.Screen]::AllScreens
foreach ($screen in $screens) {
    $x = $screen.Bounds.X
    $y = $screen.Bounds.Y
    $width = $screen.Bounds.Width
    $height = $screen.Bounds.Height
    Write-Output "$x,$y,$width,$height"
}
`;
      
      try {
        await fs.writeFile(psScript, psContent);
        
        const cmd = platform === 'wsl' 
          ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScriptWin}"`
          : `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptWin}"`;
        
        const { stdout, stderr } = await execAsync(cmd, { timeout: 10000 });
        if (stderr) {
          console.error('Error in getScreenInfo:', stderr);
        }
        await fs.unlink(psScript).catch(() => {});
        
        if (!stdout || stdout.trim() === '') {
          return [];
        }
        
        const monitors = stdout.trim().split('\n').filter(line => line.trim());
        
        const monitorList = monitors.map((monitor, index) => {
          const [x, y, width, height] = monitor.trim().split(',').map(Number);
          return { index: index + 1, x, y, width, height };
        }).filter(m => m.width > 0 && m.height > 0);
        
        // Sort monitors by position (left to right, top to bottom)
        monitorList.sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        });
        
        // Re-index after sorting
        monitorList.forEach((m, i) => m.index = i + 1);
        
        return monitorList;
      } catch (error) {
        console.error('Error getting screen info:', error.message);
        await fs.unlink(psScript).catch(() => {});
        return [];
      }
    case 'darwin':
      try {
        const { stdout } = await execAsync('system_profiler SPDisplaysDataType -json');
        const data = JSON.parse(stdout);
        const displays = data.SPDisplaysDataType[0].spdisplays_ndrvs || [];
        
        return displays.map((display, index) => ({
          index: index + 1,
          x: 0,
          y: 0,
          width: parseInt(display._spdisplays_resolution?.split(' x ')[0] || 1920),
          height: parseInt(display._spdisplays_resolution?.split(' x ')[1] || 1080)
        }));
      } catch {
        return [];
      }
      
    case 'linux':
      try {
        const { stdout } = await execAsync('xrandr --query');
        const monitors = [];
        const lines = stdout.split('\n');
        
        for (const line of lines) {
          const match = line.match(/(\S+) connected.*?(\d+)x(\d+)\+(\d+)\+(\d+)/);
          if (match) {
            monitors.push({
              index: monitors.length + 1,
              x: parseInt(match[4]),
              y: parseInt(match[5]),
              width: parseInt(match[2]),
              height: parseInt(match[3])
            });
          }
        }
        
        return monitors;
      } catch {
        return [];
      }
      
    default:
      return [];
  }
}

async function captureScreen(monitor = null) {
  const platform = await detectPlatform();
  let tempFile;
  let windowsTempFile;
  
  if (platform === 'wsl') {
    // Use direct path for WSL - cmd.exe can hang
    const userHome = os.homedir();
    const userName = path.basename(userHome);
    const fallbackTemp = `/mnt/c/Users/${userName}/AppData/Local/Temp`;
    
    try {
      await fs.access(fallbackTemp);
      tempFile = `${fallbackTemp}/screenshot_${Date.now()}.png`;
      windowsTempFile = tempFile.replace('/mnt/c', 'C:').replace(/\//g, '\\');
    } catch {
      // Use Linux temp if Windows temp is not accessible
      tempFile = `/tmp/screenshot_${Date.now()}.png`;
      windowsTempFile = tempFile;
    }
  } else {
    // Windows native
    tempFile = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);
    windowsTempFile = tempFile;
  }
  
  try {
    switch (platform) {
      case 'win32':
      case 'wsl':
        let psScript;
        let psScriptWin;
        if (platform === 'wsl') {
          // Use direct path for WSL - cmd.exe can hang
          const userHome = os.homedir();
          const userName = path.basename(userHome);
          const fallbackTemp = `/mnt/c/Users/${userName}/AppData/Local/Temp`;
          
          try {
            await fs.access(fallbackTemp);
            psScript = `${fallbackTemp}/capture_${Date.now()}.ps1`;
            psScriptWin = psScript.replace('/mnt/c', 'C:').replace(/\//g, '\\');
          } catch {
            // Use Linux temp if Windows temp is not accessible
            psScript = `/tmp/capture_${Date.now()}.ps1`;
            psScriptWin = psScript;
          }
        } else {
          // Windows native
          psScript = path.join(os.tmpdir(), `capture_${Date.now()}.ps1`);
          psScriptWin = psScript;
        }
        if (monitor && (monitor.width <= 0 || monitor.height <= 0)) {
          throw new Error(`Invalid monitor dimensions: ${monitor.width}x${monitor.height}`);
        }
        
        const psContent = monitor
          ? `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$x = ${Math.max(0, monitor.x)}
$y = ${Math.max(0, monitor.y)}
$width = ${monitor.width}
$height = ${monitor.height}
if ($width -le 0 -or $height -le 0) {
    Write-Error "Invalid dimensions: $width x $height"
    exit 1
}
$bounds = [System.Drawing.Rectangle]::FromLTRB($x, $y, ($x + $width), ($y + $height))
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save('${windowsTempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`
          : `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class DPIAware {
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();
    
    [DllImport("shcore.dll")]
    public static extern int SetProcessDpiAwareness(int value);
}
"@

# Set DPI awareness to get actual pixel dimensions
try {
    [DPIAware]::SetProcessDpiAwareness(2) # Per-monitor DPI aware
} catch {
    [DPIAware]::SetProcessDPIAware()
}

# Use SystemInformation.VirtualScreen for most accurate multi-monitor capture
$virtualScreen = [System.Windows.Forms.SystemInformation]::VirtualScreen

$x = $virtualScreen.X
$y = $virtualScreen.Y
$width = $virtualScreen.Width
$height = $virtualScreen.Height

# Get actual screens to verify we're capturing everything
# $screens = [System.Windows.Forms.Screen]::AllScreens
# Write-Host "Found $($screens.Count) screens"
# foreach ($screen in $screens) {
#     Write-Host "  Screen: $($screen.DeviceName) at $($screen.Bounds.X),$($screen.Bounds.Y) size $($screen.Bounds.Width)x$($screen.Bounds.Height)"
# }
# Write-Host "Virtual screen area: $x, $y size $width x $height"

# Create bitmap for entire virtual screen
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

# Capture the entire virtual screen
$graphics.CopyFromScreen($x, $y, 0, 0, [System.Drawing.Size]::new($width, $height))

$bitmap.Save('${windowsTempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;
        
        await fs.writeFile(psScript, psContent);
        
        const cmd = platform === 'wsl'
          ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScriptWin}"`
          : `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptWin}"`;
        
        const { stdout, stderr } = await execAsync(cmd, { timeout: 10000 });
        // Debug output if needed
        // if (stdout) {
        //   console.log(stdout.trim());
        // }
        if (stderr && !stderr.includes('DeprecationWarning')) {
          console.error('PowerShell stderr:', stderr);
        }
        await fs.unlink(psScript).catch(() => {});
        
        await fs.access(tempFile);  // Check if file was created
        break;
        
      case 'darwin':
        const macCmd = monitor
          ? `screencapture -x -R${monitor.x},${monitor.y},${monitor.width},${monitor.height} "${tempFile}"`
          : `screencapture -x "${tempFile}"`;
        await execAsync(macCmd);
        break;
        
      case 'linux':
        const linuxCmd = monitor
          ? `import -window root -crop ${monitor.width}x${monitor.height}+${monitor.x}+${monitor.y} "${tempFile}"`
          : `import -window root "${tempFile}"`;
        await execAsync(linuxCmd);
        break;
        
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    return tempFile;
  } catch (error) {
    throw new Error(`Failed to capture screen: ${error.message}`);
  }
}

async function convertImage(inputPath, outputPath, format, quality) {
  try {
    const image = await Jimp.read(inputPath);
    
    if (format === 'jpg' || format === 'jpeg') {
      await image.quality(quality).writeAsync(outputPath);
    } else {
      await image.writeAsync(outputPath);
    }
  } catch (error) {
    throw new Error(`Failed to convert image: ${error.message}`);
  }
}

async function main() {
  try {
    const timestamp = getTimestamp();
    const outputDir = argv.output || process.cwd();
    const format = argv.format;
    const quality = argv.quality;
    const displayNumber = argv.display;

    await fs.mkdir(outputDir, { recursive: true });

    const monitors = await getScreenInfo();
    const screenshots = [];

    // If display number is specified, only capture that display
    if (displayNumber !== undefined) {
      if (displayNumber < 1 || displayNumber > monitors.length) {
        console.error(`Error: Display ${displayNumber} not found. Available displays: 1-${monitors.length}`);
        process.exit(1);
      }

      const monitor = monitors.find(m => m.index === displayNumber);
      console.log(`Capturing display ${displayNumber}...`);

      const monitorScreenshot = await captureScreen(monitor);
      const monitorOutput = path.join(
        outputDir,
        generateFilename(`DisplayImage${monitor.index}`, format, timestamp)
      );

      if (format !== 'png') {
        await convertImage(monitorScreenshot, monitorOutput, format, quality);
        await fs.unlink(monitorScreenshot);
      } else {
        await fs.copyFile(monitorScreenshot, monitorOutput);
        await fs.unlink(monitorScreenshot);
      }

      console.log(`✓ Display ${monitor.index} screenshot saved: ${monitorOutput}`);
      screenshots.push(monitorOutput);
    } else {
      // Capture all displays (existing behavior)
      console.log('Capturing desktop screenshot...');

      // Capture main desktop (all monitors combined)
      const mainScreenshot = await captureScreen();
      const mainOutput = path.join(outputDir, generateFilename('DesktopImage', format, timestamp));

      if (format !== 'png') {
        await convertImage(mainScreenshot, mainOutput, format, quality);
        await fs.unlink(mainScreenshot);
      } else {
        await fs.copyFile(mainScreenshot, mainOutput);
        await fs.unlink(mainScreenshot);
      }

      console.log(`✓ Main desktop screenshot saved: ${mainOutput}`);
      screenshots.push(mainOutput);

      // Capture individual displays
      if (monitors && monitors.length > 0) {
        console.log(`Capturing ${monitors.length} individual displays...`);

        for (const monitor of monitors) {
          try {
            const monitorScreenshot = await captureScreen(monitor);
            const monitorOutput = path.join(
              outputDir,
              generateFilename(`DisplayImage${monitor.index}`, format, timestamp)
            );

            if (format !== 'png') {
              await convertImage(monitorScreenshot, monitorOutput, format, quality);
              await fs.unlink(monitorScreenshot);
            } else {
              await fs.copyFile(monitorScreenshot, monitorOutput);
              await fs.unlink(monitorScreenshot);
            }

            console.log(`✓ Display ${monitor.index} screenshot saved: ${monitorOutput}`);
            screenshots.push(monitorOutput);
          } catch (error) {
            console.error(`✗ Failed to capture display ${monitor.index}: ${error.message}`);
          }
        }
      }
    }

    console.log('\n✓ All screenshots captured successfully!');
    console.log('Files saved:');
    screenshots.forEach(file => console.log(`  - ${file}`));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Always run main when this file is required or executed
main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});