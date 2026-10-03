# Share-source icons (placeholders)

The paywall's first slide shows a row of apps people share from. These PNGs
are flat brand-coloured placeholders (78×78, 3× of the 26pt tile) so the
layout ships without third-party artwork fetched from a CDN.

TODO: replace each with the official icon from the brand's press kit, and
follow its usage guidelines (no recolouring, minimum size, clear space):

| File            | Brand     | Press kit / brand resources                                   |
| --------------- | --------- | ------------------------------------------------------------- |
| `instagram.png` | Instagram | https://about.meta.com/brand/resources/instagram/             |
| `safari.png`    | Safari    | https://developer.apple.com/app-store/marketing/guidelines/   |
| `tiktok.png`    | TikTok    | https://www.tiktok.com/about/brand-guidelines                 |
| `x.png`         | X         | https://about.x.com/en/who-we-are/brand-toolkit               |
| `youtube.png`   | YouTube   | https://www.youtube.com/about/brand-resources/                |
| `pinterest.png` | Pinterest | https://business.pinterest.com/brand-guidelines/              |
| `medium.png`    | Medium    | https://medium.design/logos-and-brand-guidelines-f1a01a733592 |

Keep the file names and 78×78 size so `src/components/paywall/slides/share-slide.tsx`
needs no change.
