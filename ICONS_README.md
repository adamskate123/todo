# PWA Icons

The PWA requires icon files for installation on mobile devices. You'll need to create:

1. **icon-192.png** - 192x192 pixels
2. **icon-512.png** - 512x512 pixels

## How to Create Icons

### Option 1: Online Icon Generator
1. Visit https://realfavicongenerator.net/ or similar
2. Upload a logo or design
3. Generate icons in the required sizes
4. Place them in the root directory

### Option 2: Create Manually
1. Create a simple design in any image editor
2. Export as PNG at 192x192 and 512x512
3. Name them exactly as specified above

### Temporary Solution
Until you create custom icons, the app will still work as a PWA, but the icon references in `manifest.json` and `index.html` will show broken image links. The functionality is not affected.

## Suggested Design
For a medical professional todo app, consider:
- Medical cross or stethoscope icon
- Checklist/checkbox symbol
- Calendar with checkmark
- Professional blue color scheme (#3f6df6)
