const axios = require('axios');
const crypto = require('crypto');
const secret = require('./secret.json')
const base64url = require('base64-url')

exports.base64ToUrlSafe = function(v) {
    return v.replace(/\//g, '_').replace(/\+/g, '-');
};

exports.urlSafeToBase64 = function(v) {
    return v.replace(/_/g, '/').replace(/-/g, '+');
};

// UrlSafe Base64 Decode
exports.urlsafeBase64Encode = function(jsonFlags) {
    var encoded = new Buffer(jsonFlags).toString('base64');
    return exports.base64ToUrlSafe(encoded);
};

// UrlSafe Base64 Decode
exports.urlSafeBase64Decode = function(fromStr) {
    return new Buffer(exports.urlSafeToBase64(fromStr), 'base64').toString();
};

// Hmac-sha1 Crypt
exports.hmacSha1 = function(encodedFlags, secretKey) {
    /*
   *return value already encoded with base64
   * */
    var hmac = crypto.createHmac('sha1', secretKey);
    hmac.update(encodedFlags);
    return hmac.digest('base64');
};

async function qiniuRequest(path, method="GET", query="",body="", contentType="application/x-www-form-urlencoded"){

    let signatureData = `${method} ${path}`
    if (query) {
        signatureData += "?"
        signatureData += query
    }
    signatureData += "\nHost: sms.qiniuapi.com"
    signatureData += "\nContent-Type: "+contentType
    signatureData += "\n\n"
    if (body) {
        signatureData += body
    }
    console.log(signatureData)
    console.log("__________")
    let signature = exports.base64ToUrlSafe(exports.hmacSha1(signatureData, secret.qiniuSK))
    let qiniuToken = `Qiniu ${secret.qiniuAK}:${signature}`
    console.log(qiniuToken)
    console.log("__________")
    try{
        if (method === "GET") {
            res = await axios.get("https://sms.qiniuapi.com" + path + query, {headers:{Authorization: qiniuToken, 'Content-Type':contentType, 'Host':"sms.qiniuapi.com"}})
        }
        if (method === "POST") {
            res = await axios.post("https://sms.qiniuapi.com" + path + query, body,{headers:{Authorization: qiniuToken, 'Content-Type':contentType, 'Host':"sms.qiniuapi.com"}})
        }
        console.log(res.data)
    }catch(e){
        console.log(e)
    }
   
}

// 注册签名
// qiniuRequest("/v1/signature", "POST", "", JSON.stringify({signature:"小猴答疑室", source:"public_number_or_small_program"}), "application/json")

// 查询签名状态
// qiniuRequest("/v1/signature", "GET")

// 创建模板
