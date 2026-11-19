var appUpdate = require('./utils/app-update');
var backupStartup = require('./utils/backup/startup');
App({
  onLaunch: function () {
    this.tryBackupRecovery();
    this.updater = appUpdate.createUpdater(wx);
    if (!this.backupRecoveryFailed) this.updater.check();
    else if(typeof wx.reLaunch==='function')wx.reLaunch({url:'/pages/home/index'});
  },
  onShow: function () {
    if (!this.backupRecoveryFailed) return;
    var pages=typeof getCurrentPages==='function'?getCurrentPages():[];
    if(pages.length&&pages[pages.length-1].route!=='pages/home/index')wx.reLaunch({url:'/pages/home/index'});
  },
  tryBackupRecovery:function(){var result=backupStartup.tryRecover(wx);this.backupRecoveryFailed=!result.ok;return result.ok;},
  globalData: {
    appName: '小工具省更多'
  }
});
