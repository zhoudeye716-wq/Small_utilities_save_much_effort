var appUpdate = require('./utils/app-update');
App({
  onLaunch: function () {
    this.updater = appUpdate.createUpdater(wx);
    this.updater.check();
  },
  globalData: {
    appName: '小工具省更多'
  }
});
