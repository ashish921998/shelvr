const appConfig = require('./app.json');

module.exports = ({ config }) => ({
  ...appConfig.expo,
  ...config,
  extra: {
    ...appConfig.expo.extra,
    ...config.extra,
    posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
    posthogHost: process.env.POSTHOG_HOST,
  },
});
