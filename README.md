# 小猴答疑室 - 微信小程序

## 经常需要参考的文档链接

微信小程序官方文档：https://developers.weixin.qq.com/miniprogram/dev/

wepy 框架文档：https://tencent.github.io/wepy/document.html#/

由于 wepy 本身是把 Vue （的开发模式）移植到微信小程序开发中，所以如果还不太了解 Vue 请预先充电。

Vue.js 中文文档：https://cn.vuejs.org/v2/guide/index.html


## 开始开发

**克隆项目到本地**

```
git@github.com:HeraldStudio/herald-discussion-room-mina.git
```

执行以下操作前请确保正确安装了:
* Node.js 环境
* 微信开发者工具（bug很多，注意保持更新）
* 一个得心应手的文本编辑工具（不要用微信开发者工具当编辑器）

**安装 wepy**

在终端中执行：`npm install wepy-cli -g`

如果安装遇到问题请参考 wepy 官方文档：https://tencent.github.io/wepy/document.html#/

**补全项目依赖**

在 `miniprogram/` 目录下执行：

```
npm install 
```

当然更希望使用 yarn，具体方法不如问问 Google ？

**启动 wepy 编译**

在 `miniprogram/` 目录下执行：

```
wepy build -w
```

如果提示有编译组件缺失请按照提示进行补全。

**在微信开发者工具中打开**

在微信开发者工具中打开项目根目录，正常情况下无需填写其他配置即可看到小程序模拟运行的结果

## 项目要求

一些繁文缛节：2空格缩紧 + 无分号

模版语言 pug + less

（emm...还有啥？）

## 云函数模板与调用方法约定

由于云开发环境对于云函数的数量有限制，故将云函数当作模块看待，函数内部设计路由。

请参考 cloudFunctionTemplate 云函数的实现方法：

```javascript
const cloud = require('wx-server-sdk')
cloud.init()
const wxContext = cloud.getWXContext()
const openid = wxContext.OPENID // 获取调用用户的openid
// ---上面的内容请复制---

// ---函数逻辑所需依赖在此引入---
// ...
// ---从这里开始编写路由和逻辑---
const routes = {
  async route1 (data) {
    return '正确结果' // 执行正确结果直接返回
  },
  async route2 (data) {
    throw Error('出错') // 执行出错 throw Error
  }
  // 其他的路由
}

// ---下面的内容请复制---
exports.main = async (event, context) => {
  let {path, data} = event
  if (routes[path] instanceof Function) {
    try {
      let result = await routes[path](data)
      return {
        success: true,
        data: result
      }
    } catch(e) {
      return {
        success: false,
        reason: e.message
      }
    }
  } else {
    return {
      success: false,
      reason: '调用方式不正确'
    }
  }
}
```

在小程序部分，对于云函数的调用进行了一定程度的封装，请参考 `pages/index` 页面 onLoad() 函数中的调用方法：

```javascript
import callFunction from '../utils/callFunction' // 引入云函数调用的便捷封装

// ...

let res1 = await callFunction('cloudFunctionTemplate/route1', {/**自定义的参数 */})
let res2 = await callFunction('cloudFunctionTemplate/route2')
```

## 数据库的访问约定

由于云函数调用次数有限，加上云函数调用调试数据库困难，只需要操作单个Collection即可完成的操作统一在小程序中发起API请求。

后续将明确每个操作的具体分割方法。

## 身份认证和授权

程序启动首先调用云函数检查授权情况，如果已授权则进入正常逻辑，否则进入身份认证逻辑。


