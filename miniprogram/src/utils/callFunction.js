import 'wepy-async-function'
const callFunction = async(path, data) => {
    let name = path.split('/')[0]
    path = path.split('/')[1]
    try {
        let res = await wx.cloud.callFunction({name, data:{path, data}})
        return res.result
    } catch(e) {
        return {
            success:false,
            reason:e.message
        }
    }
}

module.exports = callFunction