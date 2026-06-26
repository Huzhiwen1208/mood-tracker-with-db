const { initializeApplication } = require('../backend/services');

initializeApplication()
  .then((admin) => {
    console.log('数据库初始化完成。');
    console.log(`默认管理员账号: ${admin.account}`);
  })
  .catch((error) => {
    console.error('数据库初始化失败:', error.message);
    process.exit(1);
  });

