# App Icons for Your PWA

This directory holds all the icon images for your Progressive Web App. You will need to create and add these image files yourself, as I cannot generate images.

## Required Icons

The `manifest.json` file is configured to use the following images. Please create your logo as `.png` files with these exact names and dimensions and place them in this directory.

*   `icon-192x192.png`: A standard 192x192 pixel icon. Used on Android home screens and splash screens.
*   `icon-512x512.png`: A larger 512x512 pixel icon for high-resolution displays.
*   `apple-touch-icon.png`: A 180x180 pixel icon specifically for when users add your app to their home screen on an iPhone or iPad.

## Maskable Icons (Highly Recommended)

*   `icon-maskable-192x192.png`
*   `icon-maskable-512x512.png`

These "maskable" icons are important. Different Android devices use different icon shapes (circles, squares, etc.). A maskable icon has a "safe zone" in the center so your logo never gets cut off, no matter what shape the device uses.

**Tip:** You can use online tools like [Maskable.app](https://maskable.app/editor) to test and generate your maskable icons easily.

Once you add these image files, your PWA will have a professional, native-app appearance when installed!
