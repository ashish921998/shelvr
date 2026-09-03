const APP_ROOT = '/Users/ashishhuddar/Developer/shelvr/apps/native';
const APP_PATH =
  process.env.GOLDIE_APP_PATH ??
  '/tmp/shelvr-goldie-derived/Build/Products/Release-iphonesimulator/Shelvr.app';

const config = {
  appRoot: APP_ROOT,
  appPath: APP_PATH,
  bundleId: 'app.shelvr.save',

  devices: ['iphone-6.9'],
  locales: ['en-US'],
  appearance: 'light',

  frame: { variant: '17-pro-silver' },

  theme: {
    background: 'linear-gradient(160deg, #F1DFC0 0%, #F8F0E3 52%, #FFFDF8 100%)',
    headlineColor: '#261A12',
    subheadColor: '#765F4E',
    fontFamily: '"DM Sans", -apple-system, system-ui, sans-serif',
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.86,
    template: ['hero', 'tilt-right', 'duo', 'classic'],
    layout: 'classic',
  },

  store: {
    name: 'Shelvr',
    subtitle: { 'en-US': 'Save now. Find anything later.' },
    developer: 'Shelvr',
    category: 'Productivity',
    rating: 4.8,
    ratingCount: '128 Ratings',
    ageRating: '4+',
    price: 'Free',
    description: {
      'en-US':
        'Shelvr is one warm place for everything you want to remember. Save links, notes, and photos in seconds, then let AI create clear titles, summaries, and tags.\n\nSmart Spaces keep ideas organized automatically, while powerful search brings any save back the moment you need it.',
    },
  },

  scenes: [
    {
      kind: 'screenshot',
      id: 'home',
      flow: 'store-01-home',
      headline: { 'en-US': 'Everything worth saving' },
      subhead: { 'en-US': 'Links, notes, and photos—beautifully organized in one place.' },
    },
    {
      kind: 'screenshot',
      id: 'detail',
      flow: 'store-02-detail',
      headline: { 'en-US': 'Let AI sort it out' },
      subhead: { 'en-US': 'Titles, summaries, and tags appear automatically.' },
    },
    {
      kind: 'screenshot',
      id: 'spaces',
      flow: 'store-03-spaces',
      headline: { 'en-US': 'A place for everything' },
      subhead: { 'en-US': 'Smart Spaces organize ideas without the busywork.' },
      secondScene: 'search',
    },
    {
      kind: 'screenshot',
      id: 'search',
      flow: 'store-04-search',
      headline: { 'en-US': 'Find it in seconds' },
      subhead: { 'en-US': 'Search every save by title, tag, or description.' },
    },
    {
      kind: 'preview',
      id: 'preview',
      segments: [
        { id: 'discover', flow: 'store-preview-01-discover' },
        { id: 'organize', flow: 'store-preview-02-organize' },
        { id: 'find', flow: 'store-preview-03-find' },
      ],
    },
  ],
};

export default config;
