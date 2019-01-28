const callFunction = require('./callFunction')
const moment = require('moment')
const wepy = require('wepy').default
module.exports = async () => {
    const wxGetSetting = () => {
        return new Promise((res) => {
            wx.getSetting({
                success:res
            })
        })
    }
    let authSetting = (await wxGetSetting()).authSetting
    let authList = ['scope.userInfo']
    authList.forEach( a => {
        if(!authSetting[a]) {
            // 如果存在未授权的「权限项目」则跳转至授权页
            wx.reLaunch(
                {
                    url:'/pages/authorize'
                }
            )
            return
        } 
    })
    // 执行到此处说明用户已正确授权权限，检查是否完成身份认证授权
    // 为了减少云函数调用次数，使用本地storage做缓存
    const wxGetUserInfo = () => {
        return new Promise((res) => {
            wx.getUserInfo({
                success:res
            })
        })
    }
    let now = +moment()
    let avatarUrl = (await wxGetUserInfo()).userInfo.avatarUrl
    let userInfo
    let userInfoCache = wx.getStorageSync('userInfo')
    if (!userInfoCache || now > userInfoCache.expireTime) {
        // 缓存不存在或过期
        userInfo = await callFunction('userInfo/get')
        if (userInfo.success && userInfo.data.authorized) {
            // 如果已存在授权信息则更新缓存
            userInfo.data.data.expireTime = now + 24 * 60 * 60 * 1000 // 缓存的用户信息
            wx.setStorageSync('userInfo', userInfo.data.data)
            userInfo = userInfo.data.data
        } else {
            // 用户未授权，也跳转到授权页进行授权
            wx.reLaunch(
                {
                    url:'/pages/authorize'
                }
            )
            return
        }
    } else {
        userInfo = userInfoCache
    }
    userInfo.avatarUrl = avatarUrl
    return userInfo
}